import { spawn } from "node:child_process";
import electron from "electron";

const url = "http://127.0.0.1:5173";
let vite;
let desktop;
let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true;
  vite?.kill();
  desktop?.kill();
}
async function probe() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
let page = await probe();
if (page && !page.includes("Grove — a home for your code")) {
  throw new Error(
    "Port 5173 is being used by another app. Stop that app before starting Grove.",
  );
}
if (!page) {
  vite = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
    { stdio: "inherit" },
  );
  vite.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
    stop();
  });
  vite.on("exit", (code) => {
    if (!stopped && code) process.exitCode = code;
    stop();
  });
  for (let attempt = 0; attempt < 100 && !stopped; attempt++) {
    page = await probe();
    if (page) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
if (!stopped && !page) {
  stop();
  throw new Error("The Grove preview server did not start.");
}
if (!stopped) {
  desktop = spawn(electron, [".", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, GROVE_DEV_URL: url },
  });
  desktop.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
    stop();
  });
  desktop.on("exit", (code) => {
    process.exitCode = code || 0;
    stop();
  });
}
