import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

const DIFF_LIMIT = 1024 * 1024;
const FULL_DIFF_LIMIT = 16 * 1024 * 1024;
const TEXT_LIMIT = 8 * 1024 * 1024;
const LOG_FORMAT = "%H%x00%h%x00%P%x00%s%x00%b%x00%an%x00%ae%x00%aI%x00%D";
const mutations = new Map();

function gitEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      /^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_)/.test(
        key,
      )
    )
      delete env[key];
  }
  return {
    ...env,
    GIT_TERMINAL_PROMPT: "0",
    // Status reads must not refresh the index and trigger our file watcher.
    // Explicit mutations still take the locks they require.
    GIT_OPTIONAL_LOCKS: "0",
    GIT_EDITOR: "true",
    GIT_SEQUENCE_EDITOR: "true",
    GIT_PAGER: "cat",
    LC_ALL: "C",
  };
}

function git(
  cwd,
  argv,
  { optional = false, diff = false, outputLimit = DIFF_LIMIT } = {},
) {
  return new Promise((resolveResult, reject) => {
    execFile(
      "git",
      [
        "--no-pager",
        "-c",
        "color.ui=false",
        "-c",
        "core.quotepath=false",
        "-c",
        "diff.autoRefreshIndex=false",
        ...argv,
      ],
      {
        cwd,
        env: gitEnvironment(),
        encoding: "utf8",
        shell: false,
        maxBuffer: diff ? outputLimit : 32 * 1024 * 1024,
        timeout: 180000,
      },
      (error, stdout = "", stderr = "") => {
        const truncated = error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
        if (diff && truncated)
          return resolveResult({
            stdout: stdout.slice(0, outputLimit),
            stderr,
            truncated: true,
          });
        if (error && !(diff && error.code === 1) && !optional) {
          const message = [stderr.trim(), stdout.trim()]
            .filter(Boolean)
            .join("\n");
          return reject(
            new Error(message || `Git ${argv[0]} failed: ${error.message}`),
          );
        }
        resolveResult({
          stdout,
          stderr,
          truncated: false,
          failed: Boolean(error),
        });
      },
    );
  });
}

const output = (result) =>
  [result.stdout.trimEnd(), result.stderr.trimEnd()].filter(Boolean).join("\n");
const text = async (cwd, argv, options) =>
  (await git(cwd, argv, options)).stdout.replace(/\n$/, "");

function nonempty(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0"))
    throw new Error(`Invalid ${label}.`);
  return value;
}

function ref(value, label = "ref") {
  nonempty(value, label);
  if (value.startsWith("-") || /[\r\n]/.test(value))
    throw new Error(`Invalid ${label}: options are not allowed.`);
  return value;
}

async function validName(root, value, kind) {
  ref(value, kind);
  const prefix = kind === "tag" ? "refs/tags/" : "refs/heads/";
  if (
    (
      await git(root, ["check-ref-format", `${prefix}${value}`], {
        optional: true,
      })
    ).failed
  )
    throw new Error(`Invalid ${kind} name.`);
  return value;
}

function remoteName(value) {
  ref(value, "remote");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) || value.includes(".."))
    throw new Error("Invalid remote name.");
  return value;
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function rootFor(path) {
  nonempty(path, "repository path");
  const canonical = await realpath(resolve(path));
  if (!(await lstat(canonical)).isDirectory())
    throw new Error("Repository path must be a directory.");
  return realpath(await text(canonical, ["rev-parse", "--show-toplevel"]));
}

async function filePath(root, file, { rejectSymlinks = false } = {}) {
  nonempty(file, "file path");
  const parts = file.split(/[\\/]/);
  if (
    isAbsolute(file) ||
    parts.includes("..") ||
    parts.some((part) => part.toLowerCase() === ".git")
  ) {
    throw new Error(
      "File path must stay inside the repository and outside Git metadata.",
    );
  }
  const absolute = resolve(root, file);
  const local = relative(root, absolute);
  if (!local || local.startsWith(`..${sep}`) || isAbsolute(local))
    throw new Error("Invalid file path outside repository.");
  // Check every ancestor, including missing paths, before any read/write or discard.
  let cursor = root;
  const segments = local.split(sep);
  for (let i = 0; i < segments.length; i++) {
    cursor = join(cursor, segments[i]);
    let stat;
    try {
      stat = await lstat(cursor);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink() && (rejectSymlinks || i < segments.length - 1))
      throw new Error("Symbolic link file paths are not allowed.");
  }
  return { absolute, local };
}

async function serialize(key, work) {
  const previous = mutations.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(work);
  mutations.set(key, pending);
  try {
    return await pending;
  } finally {
    if (mutations.get(key) === pending) mutations.delete(key);
  }
}

function parseStatus(raw) {
  const entries = raw.split("\0");
  const files = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const file = { path: entry.slice(3), index: entry[0], worktree: entry[1] };
    if (/[RC]/.test(entry.slice(0, 2))) file.originalPath = entries[++i];
    files.push(file);
  }
  return files;
}

function parseLog(raw) {
  const fields = raw.split("\0");
  const commits = [];
  for (let i = 0; i + 8 < fields.length; i += 9) {
    const [hash, shortHash, parents, subject, body, author, email, date, refs] =
      fields.slice(i, i + 9);
    if (!hash.trim()) continue;
    commits.push({
      hash: hash.trim(),
      shortHash,
      parents: parents ? parents.split(" ") : [],
      subject,
      body: body.trimEnd(),
      author,
      email,
      date,
      refs: refs ? refs.split(", ").filter(Boolean) : [],
    });
  }
  return commits;
}

async function operation(root) {
  const gitDir = await text(root, ["rev-parse", "--absolute-git-dir"]);
  for (const [marker, name] of [
    ["rebase-merge", "rebase"],
    ["rebase-apply", "rebase"],
    ["MERGE_HEAD", "merge"],
    ["CHERRY_PICK_HEAD", "cherry-pick"],
    ["REVERT_HEAD", "revert"],
  ]) {
    if (await exists(join(gitDir, marker))) return name;
  }
  return null;
}

async function snapshot(root) {
  const [
    status,
    symbolic,
    branchesRaw,
    tagsRaw,
    stashRaw,
    remoteRaw,
    username,
    email,
    upstream,
    currentOperation,
  ] = await Promise.all([
    text(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], {
      optional: true,
    }),
    text(root, [
      "for-each-ref",
      "--format=%(refname)%00%(objectname)%00%(symref)",
      "refs/heads",
      "refs/remotes",
    ]),
    text(root, ["tag", "--list"]),
    text(root, ["stash", "list", "--format=%gd%x00%gs"]),
    text(root, ["remote"]),
    text(root, ["config", "--get", "user.name"], { optional: true }),
    text(root, ["config", "--get", "user.email"], { optional: true }),
    text(
      root,
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      { optional: true },
    ),
    operation(root),
  ]);
  const detached = symbolic.failed;
  const branch = detached
    ? await text(root, ["rev-parse", "--short", "HEAD"])
    : symbolic.stdout.trim();
  const branches = branchesRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, hash, symref] = line.split("\0");
      if (symref) return null;
      const remote = name.startsWith("refs/remotes/");
      const short = name.replace(/^refs\/(heads|remotes)\//, "");
      return {
        name: short,
        hash,
        remote,
        current: !detached && !remote && short === branch,
      };
    })
    .filter(Boolean);
  const stashes = stashRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [stashRef, message] = line.split("\0");
      return { ref: stashRef, message };
    });
  const remotes = await Promise.all(
    remoteRaw
      .split("\n")
      .filter(Boolean)
      .map(async (name) => ({
        name,
        url: await text(root, ["remote", "get-url", name]),
      })),
  );
  let ahead = 0;
  let behind = 0;
  if (upstream && upstream !== "@{upstream}") {
    const counts = await text(
      root,
      ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
      { optional: true },
    );
    [ahead, behind] = counts.split(/\s+/).map((value) => Number(value) || 0);
  }
  return {
    root,
    branch,
    detached,
    upstream: upstream === "@{upstream}" ? "" : upstream,
    ahead,
    behind,
    files: parseStatus(status),
    branches,
    tags: tagsRaw ? tagsRaw.split("\n") : [],
    stashes,
    remotes,
    operation: currentOperation,
    user: { name: username, email },
  };
}

async function resolveCommit(root, value) {
  return text(root, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${ref(value)}^{commit}`,
  ]);
}

async function history(root, { skip = 0, limit = 100, search } = {}) {
  if (!Number.isInteger(skip) || skip < 0)
    throw new Error("Invalid history skip.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Invalid history limit (1–1000).");
  const head = await git(root, ["rev-parse", "--verify", "HEAD"], {
    optional: true,
  });
  const readPage = async (offset, size) =>
    parseLog(
      (
        await git(root, [
          "log",
          "-z",
          `--format=${LOG_FORMAT}`,
          `--skip=${offset}`,
          `--max-count=${size}`,
          "--date-order",
          "--all",
          ...(head.failed ? [] : ["HEAD"]),
          "--",
        ])
      ).stdout,
    );
  if (search === undefined || search === "") return readPage(skip, limit);
  const query = nonempty(search, "history search").toLowerCase();
  const batchSize = 200;
  const matches = [];
  let matchingCount = 0;
  for (let offset = 0; ; offset += batchSize) {
    const batch = await readPage(offset, batchSize);
    for (const commit of batch) {
      if (
        ![
          commit.subject,
          commit.body,
          commit.author,
          commit.email,
          commit.hash,
        ].some((value) => value.toLowerCase().includes(query))
      )
        continue;
      if (matchingCount++ < skip) continue;
      matches.push(commit);
      if (matches.length === limit) return matches;
    }
    if (batch.length < batchSize) return matches;
  }
}

async function commitDetails(root, hash) {
  const resolved = await resolveCommit(root, hash);
  const [commit] = parseLog(
    (
      await git(root, [
        "log",
        "-z",
        "-1",
        `--format=${LOG_FORMAT}`,
        resolved,
        "--",
      ])
    ).stdout,
  );
  const base = ["diff-tree", "--root", "--no-commit-id", "-r", "-M"];
  const revisions = commit.parents.length
    ? [commit.parents[0], resolved]
    : [resolved];
  const [namesResult, countsResult] = await Promise.all([
    git(root, [...base, "--name-status", "-z", ...revisions, "--"]),
    git(root, [...base, "--numstat", "-z", ...revisions, "--"]),
  ]);
  const names = namesResult.stdout.split("\0");
  const files = [];
  for (let i = 0; i < names.length && names[i];) {
    const status = names[i++];
    let path = names[i++];
    if (/^[RC]/.test(status)) path = names[i++];
    files.push({ path, status, additions: 0, deletions: 0 });
  }
  const counts = new Map();
  const entries = countsResult.stdout.split("\0");
  for (let i = 0; i < entries.length; i++) {
    if (!entries[i]) continue;
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(entries[i]);
    if (!match) continue;
    let path = match[3];
    if (!path) {
      i++;
      path = entries[++i];
    }
    counts.set(path, {
      additions: Number(match[1]) || 0,
      deletions: Number(match[2]) || 0,
    });
  }
  return {
    commit,
    files: files.map((file) => ({ ...file, ...(counts.get(file.path) ?? {}) })),
  };
}

async function diffPaths(root, revisions, files) {
  const { stdout } = await git(root, [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "-M",
    "--diff-filter=R",
    "--name-status",
    "-z",
    ...revisions,
    "--",
  ]);
  const entries = stdout.split("\0");
  const paths = new Set(files);
  for (let i = 0; i + 2 < entries.length; i += 3) {
    if (paths.has(entries[i + 2])) paths.add(entries[i + 1]);
  }
  return [...paths];
}

async function diff(root, { file, staged = false, commit, full = false }) {
  const { local, absolute } = await filePath(root, file);
  const flags = [
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "-M",
    full ? "--unified=1000000" : "--unified=3",
  ];
  const options = {
    diff: true,
    outputLimit: full ? FULL_DIFF_LIMIT : DIFF_LIMIT,
  };
  let result;
  if (commit) {
    const hash = await resolveCommit(root, commit);
    const parents = (
      await text(root, ["rev-list", "--parents", "-n", "1", hash])
    )
      .split(" ")
      .slice(1);
    const paths = parents.length
      ? await diffPaths(root, [parents[0], hash], [local])
      : [local];
    result = parents.length
      ? await git(
          root,
          [
            "--literal-pathspecs",
            "diff",
            ...flags,
            parents[0],
            hash,
            "--",
            ...paths,
          ],
          options,
        )
      : await git(
          root,
          [
            "--literal-pathspecs",
            "show",
            "--format=",
            ...flags,
            hash,
            "--",
            local,
          ],
          options,
        );
  } else if (
    !staged &&
    !(await text(root, ["--literal-pathspecs", "ls-files", "--", local]))
  ) {
    await filePath(root, file, { rejectSymlinks: true });
    if (!(await exists(absolute)))
      return { text: "", binary: false, truncated: false };
    result = await git(
      root,
      ["diff", "--no-index", ...flags, "--", "/dev/null", local],
      options,
    );
  } else {
    const revisions = staged ? ["--cached"] : [];
    const paths = staged ? await diffPaths(root, revisions, [local]) : [local];
    result = await git(
      root,
      ["--literal-pathspecs", "diff", ...flags, ...revisions, "--", ...paths],
      options,
    );
  }
  return {
    text: result.stdout,
    binary: /(^|\n)(Binary files |GIT binary patch)/.test(result.stdout),
    truncated: result.truncated,
  };
}

async function readTextFile(root, file) {
  const { absolute } = await filePath(root, file, { rejectSymlinks: true });
  const handle = await open(
    absolute,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile())
      throw new Error("File path must refer to a regular file.");
    if (stat.size > TEXT_LIMIT)
      throw new Error("File is too large to edit (8 MB maximum).");
    const data = await handle.readFile();
    if (data.includes(0))
      throw new Error("Binary files cannot be edited as text.");
    return data.toString("utf8");
  } finally {
    await handle.close();
  }
}

async function writeTextFile(root, file, content) {
  if (
    typeof content !== "string" ||
    Buffer.byteLength(content) > TEXT_LIMIT ||
    content.includes("\0")
  )
    throw new Error("Invalid text content (8 MB maximum).");
  const { absolute } = await filePath(root, file, { rejectSymlinks: true });
  const handle = await open(
    absolute,
    constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW,
    0o666,
  );
  try {
    if (!(await handle.stat()).isFile())
      throw new Error("File path must refer to a regular file.");
    await handle.truncate(0);
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
  return "File saved.";
}

async function selectedFiles(root, files, rejectSymlinks = false) {
  if (!Array.isArray(files) || files.length === 0)
    throw new Error("Select at least one file.");
  return Promise.all(
    files.map(
      async (file) => (await filePath(root, file, { rejectSymlinks })).local,
    ),
  );
}

async function checkout(root, value) {
  const target = ref(value);
  const localName = target.replace(/^refs\/heads\//, "");
  if (
    !(
      await git(
        root,
        ["show-ref", "--verify", "--quiet", `refs/heads/${localName}`],
        { optional: true },
      )
    ).failed
  ) {
    return output(await git(root, ["switch", localName]));
  }
  let remoteRef = target.startsWith("refs/remotes/")
    ? target
    : `refs/remotes/${target}`;
  if (
    (
      await git(root, ["show-ref", "--verify", "--quiet", remoteRef], {
        optional: true,
      })
    ).failed
  ) {
    return output(
      await git(root, [
        "switch",
        "--detach",
        await resolveCommit(root, target),
      ]),
    );
  }
  const symbolic = await text(root, ["symbolic-ref", "--quiet", remoteRef], {
    optional: true,
  });
  if (symbolic) remoteRef = symbolic;
  const remoteBranch = remoteRef.replace(/^refs\/remotes\//, "");
  const remotes = (await text(root, ["remote"]))
    .split("\n")
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const remote = remotes.find((name) => remoteBranch.startsWith(`${name}/`));
  if (!remote)
    throw new Error(`Remote branch ${remoteBranch} has no configured remote.`);
  const branch = await validName(
    root,
    remoteBranch.slice(remote.length + 1),
    "branch",
  );
  const branchRef = `refs/heads/${branch}`;
  const existing = await git(
    root,
    ["show-ref", "--verify", "--quiet", branchRef],
    { optional: true },
  );
  if (existing.failed)
    return output(
      await git(root, ["switch", "--track", "-c", branch, remoteRef]),
    );
  const upstream = await text(root, [
    "for-each-ref",
    "--format=%(upstream)",
    branchRef,
  ]);
  if (upstream === remoteRef)
    return output(await git(root, ["switch", branch]));
  if (
    upstream ||
    (await resolveCommit(root, branchRef)) !==
      (await resolveCommit(root, remoteRef))
  ) {
    throw new Error(
      `A different local branch named ${branch} already exists. Rename it or check it out directly.`,
    );
  }
  const switched = await git(root, ["switch", branch]);
  const tracked = await git(root, [
    "branch",
    `--set-upstream-to=${remoteRef}`,
    branch,
  ]);
  return [output(switched), output(tracked)].filter(Boolean).join("\n");
}

async function action(root, name, args = {}) {
  let argv;
  switch (name) {
    case "stage":
      argv = [
        "--literal-pathspecs",
        "add",
        "--",
        ...(await selectedFiles(root, args.files)),
      ];
      break;
    case "unstage": {
      let files = await selectedFiles(root, args.files);
      const head = await git(root, ["rev-parse", "--verify", "HEAD"], {
        optional: true,
      });
      if (!head.failed) files = await diffPaths(root, ["--cached"], files);
      argv = head.failed
        ? [
            "--literal-pathspecs",
            "rm",
            "--cached",
            "-r",
            "-f",
            "--ignore-unmatch",
            "--",
            ...files,
          ]
        : ["--literal-pathspecs", "restore", "--staged", "--", ...files];
      break;
    }
    case "discard": {
      const files = await selectedFiles(root, args.files, true);
      const tracked = [];
      const untracked = [];
      for (const file of files) {
        const { absolute } = await filePath(root, file, {
          rejectSymlinks: true,
        });
        if ((await exists(absolute)) && !(await lstat(absolute)).isFile())
          throw new Error("Discard requires an individual regular file path.");
        if (await text(root, ["--literal-pathspecs", "ls-files", "--", file]))
          tracked.push(file);
        else untracked.push(absolute);
      }
      let result = "";
      if (tracked.length)
        result = output(
          await git(root, [
            "--literal-pathspecs",
            "restore",
            "--worktree",
            "--",
            ...tracked,
          ]),
        );
      for (const file of untracked) {
        try {
          await unlink(file);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      return result || "Selected changes discarded.";
    }
    case "commit":
    case "amend":
      nonempty(args.message, "commit message");
      argv = [
        "commit",
        ...(name === "amend" ? ["--amend"] : []),
        "-m",
        args.message,
      ];
      break;
    case "checkout":
      return checkout(root, args.ref);
    case "branch-create":
      argv = ["switch", "-c", await validName(root, args.name, "branch")];
      break;
    case "branch-rename":
      argv = [
        "branch",
        "-m",
        await validName(root, args.name, "branch"),
        await validName(root, args.newName, "branch"),
      ];
      break;
    case "branch-delete":
      argv = ["branch", "-d", await validName(root, args.name, "branch")];
      break;
    case "merge":
      argv = ["merge", "--no-edit", ref(args.ref)];
      break;
    case "rebase":
      argv = ["rebase", ref(args.ref)];
      break;
    case "cherry-pick":
      argv = ["cherry-pick", ref(args.ref)];
      break;
    case "revert":
      argv = ["revert", "--no-edit", ref(args.ref)];
      break;
    case "reset":
      if (!["soft", "mixed", "hard"].includes(args.mode ?? "mixed"))
        throw new Error("Invalid reset mode.");
      argv = [
        "reset",
        `--${args.mode ?? "mixed"}`,
        await resolveCommit(root, args.ref),
        "--",
      ];
      break;
    case "fetch":
    case "pull":
    case "push": {
      argv = [name];
      if (name === "fetch") argv.push("--prune");
      if (name === "pull") argv.push("--ff-only");
      if (name === "push" && args.setUpstream) {
        const branch = await git(
          root,
          ["symbolic-ref", "--quiet", "--short", "HEAD"],
          { optional: true },
        );
        if (branch.failed)
          throw new Error(
            "Create or switch to a branch before setting an upstream.",
          );
        argv.push(
          "--set-upstream",
          remoteName(args.remote || "origin"),
          branch.stdout.trim(),
        );
      } else if (args.remote) argv.push(remoteName(args.remote));
      break;
    }
    case "stash-save":
      argv = ["stash", "push"];
      if (args.includeUntracked) argv.push("--include-untracked");
      if (args.message)
        argv.push("-m", nonempty(args.message, "stash message"));
      break;
    case "stash-apply":
    case "stash-pop":
    case "stash-drop": {
      const stashRef = args.ref ?? "stash@{0}";
      if (!/^stash@\{\d+\}$/.test(stashRef))
        throw new Error("Invalid stash ref.");
      argv = ["stash", name.slice(6), stashRef];
      break;
    }
    case "tag-create":
      argv = [
        "tag",
        await validName(root, args.name, "tag"),
        ...(args.ref ? [ref(args.ref)] : []),
      ];
      break;
    case "tag-delete":
      argv = ["tag", "-d", await validName(root, args.name, "tag")];
      break;
    case "remote-add":
      argv = [
        "remote",
        "add",
        remoteName(args.name),
        ref(args.url, "remote URL"),
      ];
      break;
    case "remote-remove":
      argv = ["remote", "remove", remoteName(args.name)];
      break;
    case "continue":
    case "abort": {
      const current = await operation(root);
      if (!current) throw new Error("There is no Git operation in progress.");
      argv = [current, `--${name}`];
      break;
    }
    case "command":
      if (
        !Array.isArray(args.argv) ||
        !args.argv.length ||
        !args.argv.every(
          (arg) => typeof arg === "string" && !arg.includes("\0"),
        ) ||
        !/^[a-z][a-z0-9-]*$/.test(args.argv[0])
      )
        throw new Error(
          "Command must be an array of Git arguments beginning with a subcommand.",
        );
      argv = args.argv;
      break;
    default:
      throw new Error(`Unknown Git action: ${String(name)}.`);
  }
  return output(await git(root, argv));
}

export class GitService {
  async request(method, payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error("Invalid request payload.");
    if (method === "init" || method === "clone") {
      nonempty(payload.path, "destination path");
      const destination = resolve(payload.path);
      await mkdir(
        method === "init" ? destination : resolve(destination, ".."),
        { recursive: true },
      );
      const parent = await realpath(resolve(destination, ".."));
      const key = join(parent, basename(destination));
      return serialize(key, async () => {
        if (method === "init") await git(destination, ["init"]);
        else
          await git(parent, [
            "clone",
            "--",
            ref(payload.url, "clone URL"),
            basename(destination),
          ]);
        return rootFor(destination);
      });
    }
    if (
      ![
        "root",
        "snapshot",
        "history",
        "diff",
        "commitDetails",
        "readFile",
        "writeFile",
        "action",
      ].includes(method)
    )
      throw new Error(`Unknown Git method: ${String(method)}.`);
    const root = await rootFor(payload.path);
    switch (method) {
      case "root":
        return root;
      case "snapshot":
        return snapshot(root);
      case "history":
        return history(root, payload);
      case "diff":
        return diff(root, payload);
      case "commitDetails":
        return commitDetails(root, payload.hash);
      case "readFile":
        return readTextFile(root, payload.file);
      case "writeFile":
        return serialize(root, () =>
          writeTextFile(root, payload.file, payload.content),
        );
      case "action":
        return serialize(root, () =>
          action(root, payload.action, payload.args),
        );
    }
  }
}
