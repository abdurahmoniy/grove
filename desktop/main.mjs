import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GitService } from "./git.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const git = new GitService();
app.setName("Grove");
const devURL = process.env.GROVE_DEV_URL;
if (devURL && devURL !== "http://127.0.0.1:5173")
  throw new Error("Invalid development origin");
if (process.env.GROVE_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.GROVE_DATA_DIR));
let win;
let projects = [];
let watcher;
let watchTimer;
let saveQueue = Promise.resolve();
const entryURL =
  devURL || pathToFileURL(path.join(here, "../dist/index.html")).href;
const storage = () => path.join(app.getPath("userData"), "projects.json");

async function saveProjects() {
  const data = JSON.stringify(projects, null, 2);
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      await mkdir(path.dirname(storage()), { recursive: true });
      await writeFile(`${storage()}.tmp`, data, { mode: 0o600 });
      await rename(`${storage()}.tmp`, storage());
    });
  return saveQueue;
}
async function remember(repoPath) {
  const root = await git.request("root", { path: repoPath });
  const project = { path: root, name: path.basename(root) };
  projects = [project, ...projects.filter((p) => p.path !== root)];
  await saveProjects();
  return project;
}
function watchRepo(repoPath) {
  watcher?.close();
  try {
    watcher = watch(repoPath, { recursive: true }, (_event, filename) => {
      if (
        filename &&
        /(^|\/)(node_modules|\.git\/objects|dist)(\/|$)/.test(filename)
      )
        return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        if (!win?.isDestroyed()) win?.webContents.send("grove:changed");
      }, 600);
    });
    watcher.on("error", () => watcher?.close());
  } catch {
    /* Focus and manual refresh remain available on unwatched filesystems. */
  }
}
function trusted(event) {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame
  )
    return false;
  const actual = event.senderFrame.url;
  return devURL
    ? new URL(actual).origin === devURL
    : actual.split("#")[0] === entryURL;
}

ipcMain.handle("grove:request", async (event, method, payload = {}) => {
  if (!trusted(event)) throw new Error("Untrusted application window");
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Invalid request");
  if (method === "projects") return projects;
  if (method === "open") {
    const choice = await dialog.showOpenDialog(win, {
      title: "Open a Git repository",
      properties: ["openDirectory"],
    });
    return choice.canceled ? null : remember(choice.filePaths[0]);
  }
  if (method === "forget") {
    projects = projects.filter((p) => p.path !== payload.path);
    await saveProjects();
    return true;
  }
  if (method === "init" || method === "clone") {
    const choice = await dialog.showOpenDialog(win, {
      title:
        method === "init"
          ? "Initialize a repository in this folder"
          : "Choose the parent folder for your clone",
      properties: ["openDirectory", "createDirectory"],
    });
    if (choice.canceled) return null;
    const destination =
      method === "clone"
        ? path.join(choice.filePaths[0], validFolderName(payload.name))
        : choice.filePaths[0];
    const root = await git.request(method, { ...payload, path: destination });
    return remember(root);
  }
  const allowed = [
    "snapshot",
    "history",
    "diff",
    "commitDetails",
    "generateCommitMessage",
    "action",
    "readFile",
    "writeFile",
  ];
  if (!allowed.includes(method)) throw new Error("Unknown operation");
  if (
    typeof payload.path !== "string" ||
    !projects.some((p) => p.path === payload.path)
  )
    throw new Error("Open this repository first");
  if (method === "snapshot") watchRepo(payload.path);
  return git.request(method, payload);
});
function validFolderName(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value === "." ||
    value === ".." ||
    /[/\\\0]/.test(value)
  )
    throw new Error("Enter a folder name without slashes");
  return value.trim();
}
async function createWindow() {
  win = new BrowserWindow({
    title: "Grove",
    width: 1512,
    height: 940,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: "#17181c",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 14 },
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== entryURL) event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  await win.loadURL(entryURL);
}
app
  .whenReady()
  .then(async () => {
    try {
      const stored = JSON.parse(await readFile(storage(), "utf8"));
      if (Array.isArray(stored))
        projects = stored.filter(
          (p) => p && typeof p.path === "string" && typeof p.name === "string",
        );
    } catch {
      /* First launch has no recent repositories. */
    }
    const initial = process.argv.find((arg) => arg.startsWith("--repo="));
    if (initial) await remember(initial.slice(7));
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Grove",
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
        { role: "editMenu" },
        {
          label: "View",
          submenu: [
            { role: "reload" },
            { role: "toggleDevTools" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { role: "togglefullscreen" },
          ],
        },
        { role: "windowMenu" },
      ]),
    );
    await createWindow();
  })
  .catch((error) => {
    console.error("Grove startup failed:", error);
    app.quit();
  });
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
  watcher?.close();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  watcher?.close();
  clearTimeout(watchTimer);
});
