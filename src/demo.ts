import type {
  ActionArgs,
  Commit,
  CommitDetails,
  DiffData,
  GeneratedCommitMessage,
  Snapshot,
} from "./types";

const demoRoot = "/demo/orbit-web";
const authors = [
  ["Alex Morgan", "alex@demo.local"],
  ["Jamie Chen", "jamie@demo.local"],
  ["Sam Rivera", "sam@demo.local"],
];
const subjects = [
  "Refine navigation and workspace switcher",
  "Add keyboard shortcuts to command menu",
  "Merge branch feature/design-system",
  "Build out the new settings experience",
  "Update button variants and focus states",
  "Fix sidebar overflow on smaller screens",
  "Add workspace invitation flow",
  "Extract reusable avatar component",
  "Improve empty states across the dashboard",
  "Set up application shell and routing",
  "Add design tokens and typography",
  "Initialize project",
];
let commits: Commit[] = subjects.map((subject, i) => ({
  hash:
    [
      "a3f8c21",
      "9d2b410",
      "e8c307f",
      "4f19a62",
      "b8d4e03",
      "31ca97e",
      "62d910a",
      "fc7290b",
      "0cd810a",
      "10ae497",
      "9ff03c8",
      "ea39c01",
    ][i] + "0".repeat(33),
  shortHash: [
    "a3f8c21",
    "9d2b410",
    "e8c307f",
    "4f19a62",
    "b8d4e03",
    "31ca97e",
    "62d910a",
    "fc7290b",
    "0cd810a",
    "10ae497",
    "9ff03c8",
    "ea39c01",
  ][i],
  parents: [],
  subject,
  body:
    i === 0
      ? "Polish the header spacing and introduce a clearer workspace switcher.\nIncludes updated navigation styles and a more accessible focus ring."
      : "",
  author: authors[i % 3][0],
  email: authors[i % 3][1],
  date: new Date(Date.now() - (i * 5 + 2) * 3600000).toISOString(),
  refs:
    i === 0
      ? ["HEAD -> feature/workspace", "origin/feature/workspace"]
      : i === 3
        ? ["main", "origin/main"]
        : i === 7
          ? ["v1.2.0"]
          : [],
}));
commits = commits.map((c, i) => ({
  ...c,
  parents: commits[i + 1]
    ? [
        commits[i + 1].hash,
        ...(i === 2 && commits[i + 2] ? [commits[i + 2].hash] : []),
      ]
    : [],
}));
let snapshot: Snapshot = {
  root: demoRoot,
  branch: "feature/workspace",
  detached: false,
  upstream: "origin/feature/workspace",
  ahead: 2,
  behind: 0,
  files: [
    { path: "src/components/WorkspaceHeader.tsx", index: " ", worktree: "M" },
    { path: "src/components/Sidebar.tsx", index: " ", worktree: "M" },
    { path: "src/styles/globals.css", index: " ", worktree: "M" },
    { path: "src/hooks/useWorkspace.ts", index: "?", worktree: "?" },
    { path: "README.md", index: " ", worktree: "M" },
    { path: "src/components/Button.tsx", index: "M", worktree: " " },
    { path: "src/lib/utils.ts", index: "A", worktree: " " },
  ],
  branches: [
    {
      name: "feature/workspace",
      current: true,
      remote: false,
      hash: commits[0].hash,
    },
    { name: "main", current: false, remote: false, hash: commits[3].hash },
    {
      name: "fix/sidebar-overflow",
      current: false,
      remote: false,
      hash: commits[5].hash,
    },
    {
      name: "origin/main",
      current: false,
      remote: true,
      hash: commits[3].hash,
    },
    {
      name: "origin/feature/workspace",
      current: false,
      remote: true,
      hash: commits[0].hash,
    },
  ],
  tags: ["v1.2.0", "v1.1.0"],
  stashes: [{ ref: "stash@{0}", message: "WIP: workspace preferences" }],
  remotes: [{ name: "origin", url: "git@github.com:demo/orbit-web.git" }],
  operation: null,
  user: { name: "Alex Morgan", email: "alex@demo.local" },
};
const headerDiff = `diff --git a/src/components/WorkspaceHeader.tsx b/src/components/WorkspaceHeader.tsx
--- a/src/components/WorkspaceHeader.tsx
+++ b/src/components/WorkspaceHeader.tsx
@@ -1,14 +1,28 @@
 import { useState } from 'react';
-import { ChevronDown } from 'lucide-react';
+import { ChevronDown, Plus, Search } from 'lucide-react';
 import { useWorkspace } from '@/hooks/useWorkspace';
+import { WorkspaceMenu } from './WorkspaceMenu';
 
 export function WorkspaceHeader() {
   const { workspace, workspaces } = useWorkspace();
+  const [isMenuOpen, setIsMenuOpen] = useState(false);
 
   return (
-    <header className="workspace-header">
-      <h2>{workspace.name}</h2>
-      <ChevronDown size={16} />
+    <header className="flex items-center justify-between">
+      <button
+        onClick={() => setIsMenuOpen(!isMenuOpen)}
+        className="workspace-switcher"
+        aria-expanded={isMenuOpen}
+      >
+        <span className="workspace-icon">{workspace.icon}</span>
+        <h2>{workspace.name}</h2>
+        <ChevronDown size={16} />
+      </button>
+      <WorkspaceMenu
+        open={isMenuOpen}
+        workspaces={workspaces}
+        onClose={() => setIsMenuOpen(false)}
+      />
     </header>
   );
 }`;
function diffFor(file: string): string {
  if (file.includes("WorkspaceHeader")) return headerDiff;
  if (file.endsWith(".css"))
    return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,7 +1,10 @@\n :root {\n-  --surface: #121212;\n+  --surface: #161b19;\n+  --accent: #a5d6b0;\n   --radius: 8px;\n }\n \n+.workspace-switcher:focus-visible {\n+  outline: 2px solid var(--accent);\n+  outline-offset: 4px;\n+}`;
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,5 +1,8 @@\n ${file.endsWith(".md") ? "# Orbit" : "import { clsx } from 'clsx';"}\n \n-${file.endsWith(".md") ? "Your workspace, connected." : 'export const styles = "flex items-center";'}\n+${file.endsWith(".md") ? "A more thoughtful space for your next big idea." : 'export const styles = "flex items-center gap-3";'}\n+\n+${file.endsWith(".md") ? "## Getting started" : "export function cn(...inputs: string[]) {"}\n+${file.endsWith(".md") ? "Run npm install, then npm run dev." : "  return clsx(inputs);"}\n+${file.endsWith(".md") ? "" : "}"}\n `;
}
export async function demoRequest<T>(
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  let result: unknown;
  if (method === "projects")
    result = [
      { path: demoRoot, name: "orbit-web" },
      { path: "/demo/design-system", name: "design-system" },
      { path: "/demo/api-service", name: "api-service" },
    ];
  else if (method === "snapshot")
    result = { ...snapshot, root: payload.path || demoRoot };
  else if (method === "history")
    result = commits
      .filter(
        (c) =>
          !payload.search ||
          `${c.subject} ${c.author} ${c.hash}`
            .toLowerCase()
            .includes(String(payload.search).toLowerCase()),
      )
      .slice(
        Number(payload.skip || 0),
        Number(payload.skip || 0) + Number(payload.limit || 100),
      );
  else if (method === "diff")
    result = {
      text: diffFor(String(payload.file)),
      binary: false,
      truncated: false,
    } satisfies DiffData;
  else if (method === "generateCommitMessage") {
    if (
      snapshot.files.some(
        (file) =>
          file.index === "U" ||
          file.worktree === "U" ||
          ["AA", "DD"].includes(file.index + file.worktree),
      )
    )
      throw new Error("Resolve conflicts before generating a commit message.");
    const staged = snapshot.files
      .filter((file) => file.index !== " " && file.index !== "?")
      .sort((a, b) => a.path.localeCompare(b.path));
    if (!staged.length)
      throw new Error(
        "Stage at least one file before generating a commit message.",
      );
    const verbs: Record<string, string> = {
      A: "Add",
      D: "Remove",
      R: "Rename",
      C: "Copy",
      T: "Change file type for",
      M: "Update",
    };
    const shortSummary = staged
      .slice(0, 2)
      .map((file, index) => {
        const verb = verbs[file.index] || "Update";
        return `${index ? verb.toLowerCase() : verb} ${file.path.split("/").pop()}`;
      })
      .join(" and ");
    const fingerprintData = JSON.stringify(
      staged.map((file) => ({
        path: file.path,
        originalPath: file.originalPath,
        status: file.index,
        diff: diffFor(file.path),
      })),
    );
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(fingerprintData),
    );
    result = {
      summary:
        staged.length <= 2 && shortSummary.length <= 72
          ? shortSummary
          : `Update ${staged.length} staged ${staged.length === 1 ? "file" : "files"}`,
      description: staged
        .map(
          (file) =>
            `- ${verbs[file.index] || "Update"} ${file.originalPath ? `${file.originalPath} → ` : ""}${file.path}`,
        )
        .join("\n"),
      fileCount: staged.length,
      stagedFingerprint: Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    } satisfies GeneratedCommitMessage;
  } else if (method === "commitDetails")
    result = {
      commit: commits.find((c) => c.hash === payload.hash) || commits[0],
      files: [
        {
          path: "src/components/WorkspaceHeader.tsx",
          status: "M",
          additions: 20,
          deletions: 4,
        },
        {
          path: "src/styles/globals.css",
          status: "M",
          additions: 8,
          deletions: 1,
        },
      ],
    } satisfies CommitDetails;
  else if (method === "action") {
    const args = (payload.args || {}) as ActionArgs;
    const selected = (file: { path: string }) =>
      !args.files?.length || args.files.includes(file.path);
    switch (payload.action) {
      case "command":
        if (args.argv?.[0] === "stash" && args.argv[1] === "show")
          return headerDiff as T;
        throw new Error(
          "Git commands require the desktop app and a real repository.",
        );
      case "stage":
        snapshot.files = snapshot.files.map((f) =>
          selected(f) && f.worktree !== " "
            ? {
                ...f,
                index: f.worktree === "?" ? "A" : f.worktree,
                worktree: " ",
              }
            : f,
        );
        break;
      case "unstage":
        snapshot.files = snapshot.files.map((f) =>
          selected(f) && f.index !== " "
            ? { ...f, index: " ", worktree: f.index === "A" ? "?" : "M" }
            : f,
        );
        break;
      case "discard":
        snapshot.files = snapshot.files.filter((f) => !selected(f));
        break;
      case "commit":
      case "amend": {
        if (!args.message?.trim())
          throw new Error("Write a commit message first.");
        if (
          !snapshot.files.some((f) => f.index !== " " && f.index !== "?") &&
          payload.action === "commit"
        )
          throw new Error("Stage at least one file before committing.");
        const hash = crypto.randomUUID().replaceAll("-", "") + "00000000";
        const commit = {
          hash,
          shortHash: hash.slice(0, 7),
          parents: [commits[0].hash],
          subject: args.message.split("\n")[0],
          body: args.message.split("\n").slice(1).join("\n").trim(),
          author: snapshot.user.name,
          email: snapshot.user.email,
          date: new Date().toISOString(),
          refs: ["HEAD -> " + snapshot.branch],
        };
        commits = [
          commit,
          ...commits.slice(payload.action === "amend" ? 1 : 0).map((c) => ({
            ...c,
            refs: c.refs.filter((r) => !r.startsWith("HEAD")),
          })),
        ];
        snapshot.files = snapshot.files.filter((f) => f.worktree !== " ");
        snapshot.ahead++;
        break;
      }
      case "checkout":
        snapshot.branch = args.ref!;
        snapshot.branches = snapshot.branches.map((b) => ({
          ...b,
          current: b.name === args.ref,
        }));
        break;
      case "branch-create":
        snapshot.branches.push({
          name: args.name!,
          current: false,
          remote: false,
          hash: commits[0].hash,
        });
        break;
      case "branch-delete":
        snapshot.branches = snapshot.branches.filter(
          (b) => b.name !== args.name,
        );
        break;
      case "branch-rename":
        snapshot.branches = snapshot.branches.map((b) =>
          b.name === args.name ? { ...b, name: args.newName! } : b,
        );
        if (snapshot.branch === args.name) snapshot.branch = args.newName!;
        break;
      case "stash-save":
        snapshot.stashes.unshift({
          ref: `stash@{${snapshot.stashes.length}}`,
          message: args.message || "Work in progress",
        });
        snapshot.files = [];
        break;
      case "stash-drop":
        snapshot.stashes = snapshot.stashes.filter((s) => s.ref !== args.ref);
        break;
      case "tag-create":
        snapshot.tags.push(args.name!);
        break;
      case "tag-delete":
        snapshot.tags = snapshot.tags.filter((t) => t !== args.name);
        break;
      case "remote-add":
        snapshot.remotes.push({ name: args.name!, url: args.url! });
        break;
      case "remote-remove":
        snapshot.remotes = snapshot.remotes.filter((r) => r.name !== args.name);
        break;
      default:
        throw new Error(
          "This operation needs a real repository. Open Grove desktop to use local Git.",
        );
    }
    result = "Demo workspace updated. No local files were changed.";
  } else
    throw new Error(
      "Open Grove desktop to connect a real local repository. This browser is an interactive demo.",
    );
  return structuredClone(result) as T;
}
