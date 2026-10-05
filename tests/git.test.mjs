import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  realpath,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitService } from "../desktop/git.mjs";

const exec = promisify(execFile);
async function git(path, ...args) {
  const { stdout } = await exec("git", args, {
    cwd: path,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}
async function fixture(t, initial = true) {
  const base = await mkdtemp(join(tmpdir(), "grove git test "));
  t.after(() => rm(base, { recursive: true, force: true }));
  const path = join(base, "working repo");
  await mkdir(path);
  const service = new GitService();
  await service.request("init", { path });
  await git(path, "config", "user.name", "Test Author");
  await git(path, "config", "user.email", "author@example.test");
  const action = (action, args = {}) =>
    service.request("action", { path, action, args });
  const snapshot = () => service.request("snapshot", { path });
  const commitFile = async (file, content, message) => {
    await writeFile(join(path, file), content);
    await action("stage", { files: [file] });
    await action("commit", { message });
    return git(path, "rev-parse", "HEAD");
  };
  if (initial) await commitFile("hello.txt", "hello\n", "Initial commit");
  return { base, path, service, action, snapshot, commitFile };
}

test("background reads do not rewrite the index and trigger another refresh", async (t) => {
  const { path, service, snapshot } = await fixture(t);
  const indexPath = join(path, ".git", "index");
  const before = await readFile(indexPath);
  // A save with unchanged content makes Git want to refresh its stat cache.
  const changedTime = new Date(Date.now() + 2000);
  await utimes(join(path, "hello.txt"), changedTime, changedTime);
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.deepEqual((await snapshot()).files, []);
    assert.deepEqual(
      await readFile(indexPath),
      before,
      "snapshot must not write the index",
    );
    await service.request("history", { path });
    assert.deepEqual(
      await readFile(indexPath),
      before,
      "history must not write the index",
    );
    await service.request("diff", { path, file: "hello.txt" });
    assert.deepEqual(
      await readFile(indexPath),
      before,
      "diff must not write the index",
    );
  }
});

test("initializes an unborn repository and resolves its canonical root from a subdirectory", async (t) => {
  const { path, service, snapshot } = await fixture(t, false);
  await mkdir(join(path, "nested"));
  assert.equal(
    await service.request("root", { path: join(path, "nested") }),
    await realpath(path),
  );
  const state = await snapshot();
  assert.equal(state.root, await realpath(path));
  assert.equal(state.detached, false);
  assert.equal(state.files.length, 0);
  assert.equal(state.operation, null);
  assert.deepEqual(state.user, {
    name: "Test Author",
    email: "author@example.test",
  });
  assert.deepEqual(await service.request("history", { path }), []);
});

test("stages, unstages, and commits filenames with spaces and newline characters in an unborn repository", async (t) => {
  const { path, action, snapshot, service } = await fixture(t, false);
  const file = "a file\nwith spaces.txt";
  await writeFile(join(path, file), "first line\n");
  assert.deepEqual((await snapshot()).files[0], {
    path: file,
    index: "?",
    worktree: "?",
  });
  const diff = await service.request("diff", { path, file });
  assert.match(diff.text, /\+first line/);
  await action("stage", { files: [file] });
  assert.equal((await snapshot()).files[0].index, "A");
  await action("unstage", { files: [file] });
  assert.equal((await snapshot()).files[0].index, "?");
  await action("stage", { files: [file] });
  assert.match(
    (await service.request("diff", { path, file, staged: true })).text,
    /\+first line/,
  );
  await action("commit", { message: "First commit\n\nWith a body." });
  assert.deepEqual((await snapshot()).files, []);
  const [commit] = await service.request("history", { path });
  assert.equal(commit.subject, "First commit");
  assert.match(commit.body, /With a body/);
  assert.deepEqual(commit.parents, []);
  assert.equal(commit.author, "Test Author");
  assert.equal(commit.email, "author@example.test");
});

test("paginates and searches history, shows first-parent commit diffs and additions/deletions", async (t) => {
  const { path, service, commitFile } = await fixture(t);
  const root = await git(path, "rev-parse", "HEAD");
  const second = await commitFile(
    "hello.txt",
    "hello\nsecond\n",
    "Add second line",
  );
  await commitFile("hello.txt", "changed\nsecond\n", "Replace first line");
  const page = await service.request("history", { path, skip: 1, limit: 1 });
  assert.equal(page.length, 1);
  assert.equal(page[0].hash, second);
  assert.equal(
    (await service.request("history", { path, search: "Add second" }))[0].hash,
    second,
  );
  assert.match(
    (await service.request("diff", { path, file: "hello.txt", commit: second }))
      .text,
    /\+second/,
  );
  assert.match(
    (await service.request("diff", { path, file: "hello.txt", commit: root }))
      .text,
    /\+hello/,
  );
  const details = await service.request("commitDetails", {
    path,
    hash: second,
  });
  assert.equal(details.commit.hash, second);
  assert.deepEqual(details.files, [
    { path: "hello.txt", status: "M", additions: 1, deletions: 0 },
  ]);
  const rootDetails = await service.request("commitDetails", {
    path,
    hash: root,
  });
  assert.deepEqual(rootDetails.files, [
    { path: "hello.txt", status: "A", additions: 1, deletions: 0 },
  ]);
});

test("recognizes renamed and binary files without losing paths", async (t) => {
  const { path, action, snapshot, service } = await fixture(t);
  await git(path, "mv", "hello.txt", "renamed hello.txt");
  const [renamed] = (await snapshot()).files;
  assert.equal(renamed.path, "renamed hello.txt");
  assert.equal(renamed.originalPath, "hello.txt");
  assert.equal(renamed.index, "R");
  assert.match(
    (await service.request("diff", { path, file: renamed.path, staged: true }))
      .text,
    /rename from hello.txt/,
  );
  await action("commit", { message: "Rename greeting" });
  const hash = await git(path, "rev-parse", "HEAD");
  const details = await service.request("commitDetails", { path, hash });
  assert.deepEqual(details.files, [
    { path: "renamed hello.txt", status: "R100", additions: 0, deletions: 0 },
  ]);
  assert.match(
    (await service.request("diff", { path, file: renamed.path, commit: hash }))
      .text,
    /rename from hello.txt/,
  );
  await writeFile(join(path, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  assert.equal(
    (await service.request("diff", { path, file: "binary.bin" })).binary,
    true,
  );
  await action("stage", { files: ["binary.bin"] });
  assert.equal(
    (await service.request("diff", { path, file: "binary.bin", staged: true }))
      .binary,
    true,
  );
});

test("branches, renames, tags, stashes, and detached HEAD are accurately reflected", async (t) => {
  const { path, action, snapshot } = await fixture(t);
  const original = (await snapshot()).branch;
  await action("branch-create", { name: "feature/example" });
  assert.equal((await snapshot()).branch, "feature/example");
  await action("branch-rename", {
    name: "feature/example",
    newName: "feature/renamed",
  });
  await writeFile(join(path, "hello.txt"), "stashed change\n");
  await writeFile(join(path, "untracked.txt"), "also stash\n");
  await action("stash-save", {
    message: "Work in progress",
    includeUntracked: true,
  });
  let state = await snapshot();
  assert.equal(state.files.length, 0);
  assert.equal(state.stashes[0].ref, "stash@{0}");
  assert.match(state.stashes[0].message, /Work in progress/);
  await action("stash-apply", { ref: "stash@{0}" });
  assert.equal((await snapshot()).files.length, 2);
  await action("discard", { files: ["hello.txt", "untracked.txt"] });
  await action("stash-pop", { ref: "stash@{0}" });
  assert.equal((await snapshot()).stashes.length, 0);
  await action("discard", { files: ["hello.txt", "untracked.txt"] });
  await action("tag-create", { name: "v1.0", ref: "HEAD" });
  assert.deepEqual((await snapshot()).tags, ["v1.0"]);
  await action("tag-delete", { name: "v1.0" });
  await action("checkout", { ref: original });
  await action("branch-delete", { name: "feature/renamed" });
  await action("checkout", { ref: await git(path, "rev-parse", "HEAD") });
  assert.equal((await snapshot()).detached, true);
});

test("pushes, clones, fetches and pulls through a local bare remote", async (t) => {
  const { base, path, action, snapshot, service, commitFile } =
    await fixture(t);
  const remote = join(base, "bare remote.git");
  await git(base, "init", "--bare", remote);
  await action("remote-add", { name: "origin", url: remote });
  assert.deepEqual((await snapshot()).remotes, [
    { name: "origin", url: remote, pushUrls: [remote] },
  ]);
  await action("push", { remote: "origin", setUpstream: true });
  const branch = (await snapshot()).branch;
  await git(remote, "symbolic-ref", "HEAD", `refs/heads/${branch}`);
  const cloned = join(base, "cloned repo");
  assert.equal(
    await service.request("clone", { url: remote, path: cloned }),
    await realpath(cloned),
  );
  await git(cloned, "config", "user.name", "Other Author");
  await git(cloned, "config", "user.email", "other@example.test");
  await commitFile("new.txt", "remote change\n", "Remote change");
  assert.equal((await snapshot()).ahead, 1);
  await action("push");
  await service.request("action", { path: cloned, action: "fetch" });
  assert.equal((await service.request("snapshot", { path: cloned })).behind, 1);
  await service.request("action", { path: cloned, action: "pull" });
  assert.equal(
    await readFile(join(cloned, "new.txt"), "utf8"),
    "remote change\n",
  );
  await action("remote-remove", { name: "origin" });
  assert.deepEqual((await snapshot()).remotes, []);
});

test("detects merge conflicts and supports abort or editing and continuing the merge", async (t) => {
  const { path, service, action, snapshot, commitFile } = await fixture(t);
  const original = (await snapshot()).branch;
  await action("branch-create", { name: "conflicting" });
  await commitFile("hello.txt", "feature\n", "Feature change");
  await action("checkout", { ref: original });
  await commitFile("hello.txt", "main\n", "Main change");
  await assert.rejects(
    action("merge", { ref: "conflicting" }),
    /conflict|automatic merge failed/i,
  );
  let state = await snapshot();
  assert.equal(state.operation, "merge");
  assert.equal(state.files[0].index, "U");
  assert.equal(state.files[0].worktree, "U");
  await action("abort");
  assert.equal((await snapshot()).operation, null);
  await assert.rejects(
    action("merge", { ref: "conflicting" }),
    /conflict|automatic merge failed/i,
  );
  assert.match(
    await service.request("readFile", { path, file: "hello.txt" }),
    /<<<<<<< HEAD/,
  );
  await service.request("writeFile", {
    path,
    file: "hello.txt",
    content: "resolved\n",
  });
  await action("stage", { files: ["hello.txt"] });
  await action("continue");
  state = await snapshot();
  assert.equal(state.operation, null);
  assert.equal(state.files.length, 0);
  const [merge] = await service.request("history", { path });
  assert.equal(merge.parents.length, 2);
  assert.match(
    (
      await service.request("diff", {
        path,
        file: "hello.txt",
        commit: merge.hash,
      })
    ).text,
    /\+resolved/,
  );
});

test("supports amend, cherry-pick, revert, reset, rebase, stash drop, and explicit argv commands", async (t) => {
  const { path, action, snapshot, service, commitFile } = await fixture(t);
  const branch = (await snapshot()).branch;
  const initial = await git(path, "rev-parse", "HEAD");
  await action("branch-create", { name: "topic" });
  const picked = await commitFile("topic.txt", "topic\n", "Topic");
  await action("checkout", { ref: branch });
  await action("cherry-pick", { ref: picked });
  await action("amend", { message: "Amended topic" });
  assert.equal(
    (await service.request("history", { path }))[0].subject,
    "Amended topic",
  );
  await action("revert", { ref: "HEAD" });
  assert.equal((await snapshot()).files.length, 0);
  await action("reset", { ref: initial, mode: "hard" });
  await commitFile("main.txt", "main\n", "Main addition");
  await action("checkout", { ref: "topic" });
  await action("rebase", { ref: branch });
  assert.equal((await service.request("history", { path })).length, 3);
  await writeFile(join(path, "topic.txt"), "stash me\n");
  await action("stash-save", { message: "Drop this" });
  await action("stash-drop", { ref: "stash@{0}" });
  assert.deepEqual((await snapshot()).stashes, []);
  assert.equal(
    (
      await action("command", { argv: ["rev-parse", "--show-toplevel"] })
    ).trim(),
    await realpath(path),
  );
});

test("discards only unstaged contents and selected untracked files", async (t) => {
  const { path, action, snapshot } = await fixture(t);
  await writeFile(join(path, "hello.txt"), "staged\n");
  await action("stage", { files: ["hello.txt"] });
  await writeFile(join(path, "hello.txt"), "unstaged\n");
  await writeFile(join(path, "remove me.txt"), "untracked");
  await action("discard", { files: ["hello.txt", "remove me.txt"] });
  assert.equal(await readFile(join(path, "hello.txt"), "utf8"), "staged\n");
  assert.deepEqual((await snapshot()).files, [
    { path: "hello.txt", index: "M", worktree: " " },
  ]);
});

test("rejects traversal, Git metadata, symlinks, and option-like refs without touching outside files", async (t) => {
  const { base, path, action, service } = await fixture(t);
  const outside = join(base, "outside.txt");
  await writeFile(outside, "keep safe");
  await symlink(outside, join(path, "linked.txt"));
  await symlink(base, join(path, "linked-directory"));
  for (const file of [
    "../outside.txt",
    outside,
    ".git/config",
    "linked.txt",
    "linked-directory/outside.txt",
  ]) {
    await assert.rejects(
      service.request("readFile", { path, file }),
      /path|symlink|symbolic|outside|metadata/i,
    );
    await assert.rejects(
      service.request("writeFile", { path, file, content: "bad" }),
      /path|symlink|symbolic|outside|metadata/i,
    );
    await assert.rejects(
      action("discard", { files: [file] }),
      /path|symlink|symbolic|outside|metadata/i,
    );
  }
  for (const actionName of [
    "checkout",
    "merge",
    "rebase",
    "cherry-pick",
    "revert",
    "reset",
  ]) {
    await assert.rejects(
      action(actionName, { ref: "--help", mode: "hard" }),
      /ref|option|invalid/i,
    );
  }
  await assert.rejects(
    action("branch-create", { name: "--bad" }),
    /branch|ref|option|invalid/i,
  );
  await assert.rejects(
    action("reset", { ref: "HEAD", mode: "invented" }),
    /mode|invalid/i,
  );
  await assert.rejects(
    action("command", { argv: ["-C", base, "status"] }),
    /command|argument|subcommand/i,
  );
  await assert.rejects(
    service.request("history", { path, skip: -1 }),
    /skip|invalid/i,
  );
  await assert.rejects(
    action("stage", { files: ["../outside.txt"] }),
    /path|outside/i,
  );
  assert.equal(await readFile(outside, "utf8"), "keep safe");
});

test("serializes concurrent repository mutations even when called through a nested path", async (t) => {
  const { path, action, service, snapshot } = await fixture(t);
  await mkdir(join(path, "nested"));
  const files = Array.from({ length: 12 }, (_, i) => `file ${i}.txt`);
  await Promise.all(files.map((file) => writeFile(join(path, file), file)));
  await Promise.all(
    files.map((file, i) =>
      service.request("action", {
        path: i % 2 ? join(path, "nested") : path,
        action: "stage",
        args: { files: [file] },
      }),
    ),
  );
  assert.equal(
    (await snapshot()).files.filter((file) => file.index === "A").length,
    12,
  );
  await action("commit", { message: "Concurrent stages" });
  assert.equal((await snapshot()).files.length, 0);
});

test("bounds initial diff output and exposes truncation and binary flags", async (t) => {
  const { path, service, action } = await fixture(t);
  await writeFile(
    join(path, "large.txt"),
    Array.from({ length: 100000 }, (_, i) => `long changed line ${i}`).join(
      "\n",
    ),
  );
  await action("stage", { files: ["large.txt"] });
  const diff = await service.request("diff", {
    path,
    file: "large.txt",
    staged: true,
  });
  assert.equal(diff.truncated, true);
  assert.equal(diff.binary, false);
  assert.ok(diff.text.length < 2_000_000);
});

test("treats wildcard-like filenames literally when diffing or staging selected files", async (t) => {
  const { path, action, service, commitFile, snapshot } = await fixture(t);
  await commitFile("special[1].txt", "original\n", "Add brackets");
  await commitFile("special1.txt", "other original\n", "Add similar name");
  await writeFile(join(path, "special[1].txt"), "chosen change\n");
  await writeFile(join(path, "special1.txt"), "other change\n");
  const selected = await service.request("diff", {
    path,
    file: "special[1].txt",
  });
  assert.match(selected.text, /\+chosen change/);
  assert.doesNotMatch(selected.text, /\+other change/);
  await action("stage", { files: ["special[1].txt"] });
  const files = (await snapshot()).files;
  assert.equal(files.find((file) => file.path === "special[1].txt").index, "M");
  assert.equal(files.find((file) => file.path === "special1.txt").index, " ");
});

test("checkout rejects a tracked filename instead of discarding its worktree edits", async (t) => {
  const { path, action } = await fixture(t);
  await writeFile(join(path, "hello.txt"), "preserve these edits\n");
  await assert.rejects(action("checkout", { ref: "hello.txt" }));
  assert.equal(
    await readFile(join(path, "hello.txt"), "utf8"),
    "preserve these edits\n",
  );
});

test("reset rejects filenames that are not commit refs and preserves the index", async (t) => {
  const { path, action } = await fixture(t);
  await writeFile(join(path, "hello.txt"), "staged edits\n");
  await action("stage", { files: ["hello.txt"] });
  await assert.rejects(action("reset", { ref: "hello.txt", mode: "mixed" }));
  assert.equal(await git(path, "show", ":hello.txt"), "staged edits");
});

test("unstaging a renamed destination also restores the original index path", async (t) => {
  const { path, action, snapshot } = await fixture(t);
  await git(path, "mv", "hello.txt", "new greeting.txt");
  await action("unstage", { files: ["new greeting.txt"] });
  assert.equal(await git(path, "diff", "--cached"), "");
  assert.equal(
    await readFile(join(path, "new greeting.txt"), "utf8"),
    "hello\n",
  );
  const files = (await snapshot()).files;
  assert.equal(files.find((file) => file.path === "hello.txt").worktree, "D");
  assert.equal(
    files.find((file) => file.path === "new greeting.txt").index,
    "?",
  );
});

test("history includes commits on all branches and an unreferenced detached HEAD", async (t) => {
  const { path, service, action, snapshot, commitFile } = await fixture(t);
  const initial = await git(path, "rev-parse", "HEAD");
  const branch = (await snapshot()).branch;
  await action("branch-create", { name: "other-history" });
  const other = await commitFile("other.txt", "other\n", "Other branch commit");
  await action("checkout", { ref: branch });
  const main = await commitFile("main.txt", "main\n", "Main branch commit");
  assert.deepEqual(
    new Set(
      (await service.request("history", { path })).map((commit) => commit.hash),
    ),
    new Set([initial, other, main]),
  );
  await action("checkout", { ref: initial });
  const detached = await commitFile(
    "detached.txt",
    "detached\n",
    "Detached commit",
  );
  assert.deepEqual(
    new Set(
      (await service.request("history", { path })).map((commit) => commit.hash),
    ),
    new Set([initial, other, main, detached]),
  );
});

test("history searches message, body, author, email, and hash case-insensitively before pagination", async (t) => {
  const { path, service, commitFile } = await fixture(t);
  await git(path, "config", "user.name", "Mixed Author");
  await git(path, "config", "user.email", "UniqueEmail@example.test");
  const first = await commitFile(
    "one.txt",
    "one\n",
    "SearchMarker one\n\nBodyNeedle details",
  );
  await git(path, "config", "user.name", "Test Author");
  await git(path, "config", "user.email", "author@example.test");
  await commitFile("noise.txt", "noise\n", "Unrelated middle commit");
  const second = await commitFile("two.txt", "two\n", "SearchMarker two");
  for (const search of [
    "mixed AUTHOR",
    "UNIQUEEMAIL@EXAMPLE.TEST",
    "bodyNEEDLE",
    first.toUpperCase(),
    first.slice(0, 10).toUpperCase(),
  ]) {
    assert.deepEqual(
      (await service.request("history", { path, search })).map(
        (commit) => commit.hash,
      ),
      [first],
    );
  }
  assert.deepEqual(
    (
      await service.request("history", {
        path,
        search: "sEaRcHmArKeR",
        skip: 0,
        limit: 1,
      })
    ).map((commit) => commit.hash),
    [second],
  );
  assert.deepEqual(
    (
      await service.request("history", {
        path,
        search: "sEaRcHmArKeR",
        skip: 1,
        limit: 1,
      })
    ).map((commit) => commit.hash),
    [first],
  );
});

test("history search scans beyond its initial batch without silently dropping older matches", async (t) => {
  const { path, service } = await fixture(t);
  const initial = await git(path, "rev-parse", "HEAD");
  const tree = await git(path, "rev-parse", "HEAD^{tree}");
  let parent = initial;
  for (let i = 0; i < 230; i++)
    parent = await git(
      path,
      "commit-tree",
      tree,
      "-p",
      parent,
      "-m",
      `Unrelated commit ${i}`,
    );
  await git(path, "update-ref", "HEAD", parent);
  assert.deepEqual(
    (
      await service.request("history", {
        path,
        search: initial.toUpperCase(),
        limit: 1,
      })
    ).map((commit) => commit.hash),
    [initial],
  );
});

test("full diff reveals the final lines beyond the initial output limit", async (t) => {
  const { path, service, action } = await fixture(t);
  await writeFile(
    join(path, "expanded.txt"),
    `${"a sufficiently long line to exceed the first cap\n".repeat(60000)}FINAL_EXPANDED_LINE\n`,
  );
  await action("stage", { files: ["expanded.txt"] });
  const initial = await service.request("diff", {
    path,
    file: "expanded.txt",
    staged: true,
  });
  assert.equal(initial.truncated, true);
  assert.doesNotMatch(initial.text, /FINAL_EXPANDED_LINE/);
  const full = await service.request("diff", {
    path,
    file: "expanded.txt",
    staged: true,
    full: true,
  });
  assert.equal(full.truncated, false);
  assert.match(full.text, /\+FINAL_EXPANDED_LINE/);
  assert.ok(full.text.length > 1024 * 1024);
});

test("full diff retains a hard output limit for exceptionally large changes", async (t) => {
  const { path, service, action } = await fixture(t);
  await writeFile(
    join(path, "huge.txt"),
    `${"A".repeat(1023)}\n`.repeat(18000),
  );
  await action("stage", { files: ["huge.txt"] });
  const full = await service.request("diff", {
    path,
    file: "huge.txt",
    staged: true,
    full: true,
  });
  assert.equal(full.truncated, true);
  assert.ok(full.text.length > 1024 * 1024);
  assert.ok(Buffer.byteLength(full.text) <= 16 * 1024 * 1024);
});

async function remoteBranchFixture(t) {
  const fixtureData = await fixture(t);
  const { base, path, action, snapshot, commitFile } = fixtureData;
  const mainBranch = (await snapshot()).branch;
  const remote = join(base, "checkout remote.git");
  await git(base, "init", "--bare", remote);
  await action("remote-add", { name: "origin", url: remote });
  await action("push", { remote: "origin", setUpstream: true });
  await action("branch-create", { name: "feature/nested" });
  const remoteHash = await commitFile(
    "remote.txt",
    "remote\n",
    "Remote feature",
  );
  await action("push", { remote: "origin", setUpstream: true });
  await action("checkout", { ref: mainBranch });
  await action("branch-delete", { name: "feature/nested" });
  return { ...fixtureData, mainBranch, remoteHash };
}

test("checking out a remote branch creates its local tracking branch and subsequently reuses it", async (t) => {
  const { action, snapshot, mainBranch } = await remoteBranchFixture(t);
  await action("checkout", { ref: "origin/feature/nested" });
  let state = await snapshot();
  assert.equal(state.detached, false);
  assert.equal(state.branch, "feature/nested");
  assert.equal(state.upstream, "origin/feature/nested");
  await action("checkout", { ref: mainBranch });
  await action("checkout", { ref: "origin/feature/nested" });
  state = await snapshot();
  assert.equal(state.branch, "feature/nested");
  assert.equal(state.detached, false);
});

test("remote checkout refuses a conflicting local branch without rewriting or detaching it", async (t) => {
  const { path, action, snapshot, mainBranch } = await remoteBranchFixture(t);
  await action("branch-create", { name: "feature/nested" });
  const localHash = await git(path, "rev-parse", "HEAD");
  await action("checkout", { ref: mainBranch });
  await assert.rejects(
    action("checkout", { ref: "origin/feature/nested" }),
    /existing|already|conflict|tracking/i,
  );
  const state = await snapshot();
  assert.equal(state.branch, mainBranch);
  assert.equal(state.detached, false);
  assert.equal(await git(path, "rev-parse", "feature/nested"), localHash);
});

test("remote checkout reuses an untracked local branch at the same commit and sets its upstream", async (t) => {
  const { path, action, snapshot, remoteHash } = await remoteBranchFixture(t);
  await git(path, "branch", "feature/nested", remoteHash);
  await action("checkout", { ref: "origin/feature/nested" });
  const state = await snapshot();
  assert.equal(state.branch, "feature/nested");
  assert.equal(state.upstream, "origin/feature/nested");
  assert.equal(state.detached, false);
  assert.equal(await git(path, "rev-parse", "HEAD"), remoteHash);
});

test("canonical repository roots retain significant trailing whitespace", async (t) => {
  const { base, service } = await fixture(t);
  for (const suffix of ["spaces  ", "tab\t", "newline\n"]) {
    const path = join(base, `repository with trailing ${suffix}`);
    await mkdir(path);
    await git(path, "init");
    await mkdir(join(path, "nested"));
    assert.equal(await service.request("root", { path }), await realpath(path));
    assert.equal(
      await service.request("root", { path: join(path, "nested") }),
      await realpath(path),
    );
    assert.equal(
      (await service.request("snapshot", { path })).root,
      await realpath(path),
    );
  }
});

async function syncFixture(t) {
  const data = await fixture(t);
  const branch = (await data.snapshot()).branch;
  const remote = join(data.base, "sync remote.git");
  await git(data.base, "init", "--bare", remote);
  await data.action("remote-add", { name: "origin", url: remote });
  await data.action("push", { remote: "origin", setUpstream: true });
  return { ...data, branch, remote };
}

test("snapshot reports every push destination separately from a remote fetch URL", async (t) => {
  const { base, path, remote, snapshot } = await syncFixture(t);
  const pushUrls = [
    join(base, "first push.git"),
    join(base, "second push.git"),
  ];
  for (const destination of pushUrls) {
    await git(base, "init", "--bare", destination);
    await git(
      path,
      "remote",
      "set-url",
      "--add",
      "--push",
      "origin",
      destination,
    );
  }
  assert.deepEqual((await snapshot()).remotes, [
    { name: "origin", url: remote, pushUrls },
  ]);
});

test("selected push publishes a different local branch to a new destination without changing checkout or tracking", async (t) => {
  const { path, remote, branch, action, snapshot, commitFile } =
    await syncFixture(t);
  const initial = await git(path, "rev-parse", "HEAD");
  await action("branch-create", { name: "feature/local" });
  const source = await commitFile("feature.txt", "feature\n", "Local feature");
  await git(path, "branch", "--set-upstream-to", `origin/${branch}`);
  await action("checkout", { ref: branch });
  await git(path, "tag", "feature/local", initial);
  await git(path, "config", "remote.origin.push", "refs/heads/*:refs/heads/*");
  const trackingBefore = await git(
    path,
    "config",
    "--get-regexp",
    "^branch\\.",
  );
  await action("push", {
    remote: "origin",
    localBranch: "feature/local",
    remoteBranch: "review/destination",
    setUpstream: false,
  });
  assert.equal(
    await git(
      remote,
      "for-each-ref",
      "--format=%(objectname)",
      "refs/heads/review/destination",
    ),
    source,
  );
  assert.equal(await git(remote, "rev-parse", `refs/heads/${branch}`), initial);
  assert.equal((await snapshot()).branch, branch);
  assert.equal(await git(path, "rev-parse", "HEAD"), initial);
  assert.equal(
    await git(path, "config", "--get-regexp", "^branch\\."),
    trackingBefore,
  );
  assert.equal(
    await git(remote, "for-each-ref", "--format=%(refname)", "refs/heads"),
    [`refs/heads/${branch}`, "refs/heads/review/destination"].sort().join("\n"),
  );
});

test("selected push sets the chosen source upstream even while HEAD is detached", async (t) => {
  const { path, remote, branch, action, snapshot, commitFile } =
    await syncFixture(t);
  const initial = await git(path, "rev-parse", "HEAD");
  await action("branch-create", { name: "feature/local" });
  const source = await commitFile("feature.txt", "feature\n", "Local feature");
  await git(path, "switch", "--detach", initial);
  await action("push", {
    remote: "origin",
    localBranch: "feature/local",
    remoteBranch: "review/destination",
    setUpstream: true,
  });
  assert.equal(
    await git(remote, "rev-parse", "refs/heads/review/destination"),
    source,
  );
  assert.equal(
    await git(path, "config", "branch.feature/local.remote"),
    "origin",
  );
  assert.equal(
    await git(path, "config", "branch.feature/local.merge"),
    "refs/heads/review/destination",
  );
  assert.equal(
    await git(path, "config", `branch.${branch}.merge`),
    `refs/heads/${branch}`,
  );
  assert.equal((await snapshot()).detached, true);
  assert.equal(await git(path, "rev-parse", "HEAD"), initial);
  await assert.rejects(
    action("push", { remote: "origin", setUpstream: true }),
    /branch|detached|upstream/i,
  );
});

test("selected push does not publish annotated tags when followTags is enabled", async (t) => {
  const { path, remote, branch, action } = await syncFixture(t);
  const source = await git(path, "rev-parse", "HEAD");
  await git(
    path,
    "tag",
    "--annotate",
    "private-release",
    "--message",
    "Local release",
  );
  await git(path, "config", "push.followTags", "true");
  await action("push", {
    remote: "origin",
    localBranch: branch,
    remoteBranch: "review/selected-only",
  });
  assert.equal(await git(remote, "for-each-ref", "refs/tags"), "");
  assert.equal(
    await git(remote, "rev-parse", "refs/heads/review/selected-only"),
    source,
  );
  assert.equal(await git(path, "config", "push.followTags"), "true");
});

test("selected pull fast-forwards the current branch from a different remote branch without changing tracking", async (t) => {
  const { path, branch, action, snapshot, commitFile } = await syncFixture(t);
  await action("branch-create", { name: "incoming/source" });
  const incoming = await commitFile(
    "incoming.txt",
    "incoming\n",
    "Incoming change",
  );
  await git(
    path,
    "push",
    "origin",
    "refs/heads/incoming/source:refs/heads/review/source",
  );
  await action("checkout", { ref: branch });
  const trackingBefore = await git(
    path,
    "config",
    "--get-regexp",
    "^branch\\.",
  );
  await action("pull", { remote: "origin", remoteBranch: "review/source" });
  assert.equal(await git(path, "rev-parse", "HEAD"), incoming);
  assert.equal((await snapshot()).branch, branch);
  assert.equal(
    await readFile(join(path, "incoming.txt"), "utf8"),
    "incoming\n",
  );
  assert.equal(
    await git(path, "config", "--get-regexp", "^branch\\."),
    trackingBefore,
  );
});

test("selected pull rejects a divergent remote branch without merging or changing the current branch", async (t) => {
  const { path, branch, action, snapshot, commitFile } = await syncFixture(t);
  await action("branch-create", { name: "incoming/source" });
  await commitFile("incoming.txt", "incoming\n", "Incoming change");
  await git(
    path,
    "push",
    "origin",
    "refs/heads/incoming/source:refs/heads/review/source",
  );
  await action("checkout", { ref: branch });
  const local = await commitFile("local.txt", "local\n", "Local change");
  await assert.rejects(
    action("pull", { remote: "origin", remoteBranch: "review/source" }),
    /fast.forward|diverg/i,
  );
  assert.equal(await git(path, "rev-parse", "HEAD"), local);
  const state = await snapshot();
  assert.equal(state.branch, branch);
  assert.equal(state.upstream, `origin/${branch}`);
  assert.equal(state.operation, null);
  assert.deepEqual(state.files, []);
});

async function pullSafetyFixture(t) {
  const data = await syncFixture(t);
  const { path, branch, action, commitFile } = data;
  const initial = await git(path, "rev-parse", "HEAD");
  await action("branch-create", { name: "incoming/source" });
  const incoming = await commitFile(
    "hello.txt",
    "remote update\n",
    "Incoming update",
  );
  await git(
    path,
    "push",
    "origin",
    "refs/heads/incoming/source:refs/heads/review/source",
  );
  await action("checkout", { ref: branch });
  return { ...data, initial, incoming };
}

test("selected pull refuses overlapping edits instead of applying configured autostash", async (t) => {
  for (const rebase of [false, true]) {
    await t.test(rebase ? "rebase autostash" : "merge autostash", async (t) => {
      const { path, remote, action, initial, snapshot } =
        await pullSafetyFixture(t);
      const remoteBefore = await git(remote, "show-ref");
      await git(path, "config", "pull.rebase", String(rebase));
      await git(path, "config", "merge.autoStash", "true");
      await git(path, "config", "rebase.autoStash", "true");
      await writeFile(join(path, "hello.txt"), "staged work\n");
      await action("stage", { files: ["hello.txt"] });
      await writeFile(join(path, "hello.txt"), "unsaved work\n");
      await assert.rejects(
        action("pull", { remote: "origin", remoteBranch: "review/source" }),
        /overwritten|unstaged|commit.*stash|cannot pull/i,
      );
      assert.equal(await git(path, "rev-parse", "HEAD"), initial);
      assert.equal(await git(path, "show", ":hello.txt"), "staged work");
      assert.equal(
        await readFile(join(path, "hello.txt"), "utf8"),
        "unsaved work\n",
      );
      assert.equal(await git(path, "stash", "list"), "");
      assert.equal(await git(remote, "show-ref"), remoteBefore);
      assert.equal((await snapshot()).operation, null);
    });
  }
});

test("selected pull preserves unrelated staged, unstaged, and untracked edits", async (t) => {
  const { path, remote, action, branch, incoming, snapshot } =
    await pullSafetyFixture(t);
  const remoteBefore = await git(remote, "show-ref");
  await git(path, "config", "pull.rebase", "true");
  await git(path, "config", "merge.autoStash", "true");
  await git(path, "config", "rebase.autoStash", "true");
  await writeFile(join(path, "local.txt"), "staged work\n");
  await action("stage", { files: ["local.txt"] });
  await writeFile(join(path, "local.txt"), "unstaged work\n");
  await writeFile(join(path, "draft.txt"), "untracked work\n");
  await action("pull", { remote: "origin", remoteBranch: "review/source" });
  assert.equal(await git(path, "rev-parse", "HEAD"), incoming);
  assert.equal(await git(path, "show", ":local.txt"), "staged work");
  assert.equal(
    await readFile(join(path, "local.txt"), "utf8"),
    "unstaged work\n",
  );
  assert.equal(
    await readFile(join(path, "draft.txt"), "utf8"),
    "untracked work\n",
  );
  assert.equal((await snapshot()).upstream, `origin/${branch}`);
  assert.equal(await git(remote, "show-ref"), remoteBefore);
  assert.equal(await git(path, "stash", "list"), "");
});

test("selected pull remains fast-forward-only when Git is configured to rebase", async (t) => {
  const { path, remote, action, branch, snapshot, commitFile } =
    await pullSafetyFixture(t);
  const remoteBefore = await git(remote, "show-ref");
  const local = await commitFile(
    "local.txt",
    "local commit\n",
    "Local divergence",
  );
  await git(path, "config", "pull.rebase", "true");
  await git(path, "config", `branch.${branch}.rebase`, "true");
  await git(path, "config", "pull.ff", "false");
  await assert.rejects(
    action("pull", { remote: "origin", remoteBranch: "review/source" }),
    /fast.forward|diverg/i,
  );
  assert.equal(await git(path, "rev-parse", "HEAD"), local);
  assert.equal((await snapshot()).upstream, `origin/${branch}`);
  assert.equal((await snapshot()).operation, null);
  assert.equal(await git(remote, "show-ref"), remoteBefore);
});

test("selected push rejects non-fast-forward updates without altering the destination", async (t) => {
  const { path, remote, branch, action, commitFile } = await syncFixture(t);
  await action("branch-create", { name: "feature/local" });
  await commitFile("source.txt", "source\n", "Source change");
  await action("checkout", { ref: branch });
  const destination = await commitFile(
    "remote.txt",
    "remote\n",
    "Remote change",
  );
  await git(
    path,
    "push",
    "origin",
    `refs/heads/${branch}:refs/heads/review/destination`,
  );
  await assert.rejects(
    action("push", {
      remote: "origin",
      localBranch: "feature/local",
      remoteBranch: "review/destination",
    }),
    /non.fast.forward|rejected/i,
  );
  assert.equal(
    await git(remote, "rev-parse", "refs/heads/review/destination"),
    destination,
  );
  assert.equal(await git(path, "rev-parse", "HEAD"), destination);
});

test("selected pull requires a checked-out branch and leaves detached HEAD unchanged", async (t) => {
  const { path, branch, action, commitFile } = await syncFixture(t);
  const initial = await git(path, "rev-parse", "HEAD");
  await commitFile("incoming.txt", "incoming\n", "Incoming change");
  await action("push");
  await git(path, "switch", "--detach", initial);
  await assert.rejects(
    action("pull", { remote: "origin", remoteBranch: branch }),
    /branch|detached/i,
  );
  assert.equal(await git(path, "rev-parse", "HEAD"), initial);
});

test("selected sync refuses an active merge without changing local or remote refs", async (t) => {
  const { path, remote, branch, action, snapshot, commitFile } =
    await syncFixture(t);
  await action("branch-create", { name: "conflicting" });
  await commitFile("hello.txt", "conflicting\n", "Conflicting change");
  await action("checkout", { ref: branch });
  const local = await commitFile("hello.txt", "local\n", "Local change");
  await assert.rejects(action("merge", { ref: "conflicting" }), /conflict/i);
  const remoteBefore = await git(remote, "show-ref");
  const localBefore = await git(path, "show-ref");
  await assert.rejects(
    action("push", {
      remote: "origin",
      localBranch: branch,
      remoteBranch: branch,
    }),
    /operation|progress|finish/i,
  );
  await assert.rejects(
    action("pull", { remote: "origin", remoteBranch: branch }),
    /operation|progress|finish/i,
  );
  assert.equal(await git(remote, "show-ref"), remoteBefore);
  assert.equal(await git(path, "show-ref"), localBefore);
  assert.equal(await git(path, "rev-parse", "HEAD"), local);
  assert.equal((await snapshot()).operation, "merge");
});

test("selected sync rejects partial selections, nonlocal sources, and unsafe arguments before changing any refs", async (t) => {
  const { path, remote, branch, action } = await syncFixture(t);
  const unconfigured = join(path, "unconfigured.git");
  await git(path, "init", "--bare", unconfigured);
  const before = await git(remote, "show-ref");
  const localBefore = await git(path, "show-ref");
  const configBefore = await readFile(join(path, ".git", "config"));
  const invalidPush = [
    { localBranch: branch, remoteBranch: "destination" },
    { remote: "origin", localBranch: branch },
    { remote: "origin", remoteBranch: "destination" },
    { remote: "origin", localBranch: "missing", remoteBranch: "destination" },
    {
      remote: "origin",
      localBranch: `origin/${branch}`,
      remoteBranch: "destination",
    },
  ];
  for (const value of [
    "--all",
    "+main",
    ":main",
    "main:other",
    "main other",
    "refs/heads/main",
    "*",
    "main\nother",
    "",
  ]) {
    invalidPush.push({
      remote: "origin",
      localBranch: value,
      remoteBranch: "destination",
    });
    invalidPush.push({
      remote: "origin",
      localBranch: branch,
      remoteBranch: value,
    });
  }
  for (const value of [
    "--mirror",
    "https://example.invalid/repo.git",
    "../sync remote.git",
    "missing-remote",
    "unconfigured.git",
    ".",
  ]) {
    invalidPush.push({
      remote: value,
      localBranch: branch,
      remoteBranch: "destination",
    });
  }
  for (const args of invalidPush) {
    await assert.rejects(
      action("push", args),
      /branch|remote|ref|option|invalid|select/i,
      JSON.stringify(args),
    );
    assert.equal(await git(remote, "show-ref"), before);
    assert.equal(await git(unconfigured, "for-each-ref"), "");
    assert.equal(await git(path, "show-ref"), localBefore);
    assert.deepEqual(
      await readFile(join(path, ".git", "config")),
      configBefore,
    );
  }
  for (const args of [
    { remoteBranch: branch },
    { remote: "origin", localBranch: branch, remoteBranch: branch },
    { remote: "origin", remoteBranch: "--all" },
    { remote: "origin", remoteBranch: "main:other" },
    { remote: "origin", remoteBranch: "*" },
    { remote: "origin", remoteBranch: "" },
    { remote: "origin", remoteBranch: "refs/heads/main" },
    { remote: "missing-remote", remoteBranch: branch },
    { remote: "unconfigured.git", remoteBranch: branch },
    { remote: "https://example.invalid/repo.git", remoteBranch: branch },
  ]) {
    await assert.rejects(
      action("pull", args),
      /branch|remote|ref|option|invalid|select/i,
      JSON.stringify(args),
    );
    assert.equal(await git(remote, "show-ref"), before);
    assert.equal(await git(path, "show-ref"), localBefore);
    assert.deepEqual(
      await readFile(join(path, ".git", "config")),
      configBefore,
    );
  }
});
