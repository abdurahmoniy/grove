import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  chmod,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService } from "../desktop/git.mjs";

const exec = promisify(execFile);
async function git(path, ...args) {
  return (
    await exec("git", args, {
      cwd: path,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_OPTIONAL_LOCKS: "0",
      },
    })
  ).stdout.trim();
}
async function fixture(t, files = {}) {
  const base = await mkdtemp(join(tmpdir(), "grove message test "));
  t.after(() => rm(base, { recursive: true, force: true }));
  const path = join(base, "repository");
  await mkdir(path);
  await git(path, "init");
  await git(path, "config", "user.name", "Test Author");
  await git(path, "config", "user.email", "author@example.test");
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(path, name, ".."), { recursive: true });
    await writeFile(join(path, name), content);
  }
  if (Object.keys(files).length) {
    await git(path, "add", "--all");
    await git(path, "commit", "-m", "Initial files");
  }
  const service = new GitService();
  const generate = () => service.request("generateCommitMessage", { path });
  return { base, path, service, generate };
}

test("message generation requires actual staged changes, including in an unborn repository", async (t) => {
  const { path, generate } = await fixture(t);
  await assert.rejects(generate(), /stage.*change|staged.*file/i);
  await writeFile(join(path, "draft.txt"), "Untracked work");
  await assert.rejects(generate(), /stage.*change|staged.*file/i);
  await git(path, "add", "--intent-to-add", "--", "draft.txt");
  await assert.rejects(generate(), /stage.*change|staged.*file/i);
});

test("message generation uses staged metadata only and never changes the index, worktree, or history", async (t) => {
  const { path, generate } = await fixture(t, {
    "README.md": "Original\n",
    "private.txt": "Original\n",
  });
  await writeFile(join(path, "README.md"), "STAGED_SECRET_MUST_NOT_APPEAR\n");
  await git(path, "add", "--", "README.md");
  await writeFile(join(path, "README.md"), "UNSTAGED_SECRET_MUST_NOT_APPEAR\n");
  await writeFile(join(path, "private.txt"), "Other unstaged edits\n");
  await writeFile(join(path, "untracked.txt"), "Untracked content\n");
  const beforeIndex = await readFile(join(path, ".git", "index"));
  const beforeHead = await git(path, "rev-parse", "HEAD");
  const message = await generate();
  assert.equal(message.summary, "Update README.md");
  assert.equal(message.description, "- Update README.md");
  assert.equal(message.fileCount, 1);
  assert.match(message.stagedFingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(
    JSON.stringify(message),
    /SECRET|private\.txt|untracked\.txt/,
  );
  assert.deepEqual(await readFile(join(path, ".git", "index")), beforeIndex);
  assert.equal(await git(path, "rev-parse", "HEAD"), beforeHead);
  assert.equal(
    await readFile(join(path, "README.md"), "utf8"),
    "UNSTAGED_SECRET_MUST_NOT_APPEAR\n",
  );
  assert.equal(
    await git(path, "show", ":README.md"),
    "STAGED_SECRET_MUST_NOT_APPEAR",
  );
  await writeFile(join(path, "README.md"), "Another unstaged change\n");
  assert.deepEqual(await generate(), message);
  await git(path, "add", "--", "README.md");
  assert.notEqual(
    (await generate()).stagedFingerprint,
    message.stagedFingerprint,
  );
});

test("message generation supports the first commit and staged binary files without reading worktree replacements", async (t) => {
  const { base, path, generate } = await fixture(t);
  await writeFile(join(path, "image.bin"), Buffer.from([0, 255, 1, 2]));
  await git(path, "add", "--", "image.bin");
  const beforeIndex = await readFile(join(path, ".git", "index"));
  const outside = join(base, "outside.txt");
  await writeFile(outside, "PRIVATE_OUTSIDE_CONTENT");
  await rm(join(path, "image.bin"));
  await symlink(outside, join(path, "image.bin"));
  const message = await generate();
  assert.equal(message.summary, "Add image.bin");
  assert.equal(message.description, "- Add image.bin");
  assert.equal(message.fileCount, 1);
  assert.doesNotMatch(JSON.stringify(message), /PRIVATE_OUTSIDE_CONTENT/);
  assert.deepEqual(await readFile(join(path, ".git", "index")), beforeIndex);
  await assert.rejects(git(path, "rev-parse", "--verify", "HEAD"));
});

test("message generation describes staged renames, removals, additions, and mode changes", async (t) => {
  const { path, generate } = await fixture(t, {
    "old.txt": "A unique file that will be renamed\n",
    "remove.txt": "Remove this file\n",
    "run.sh": "#!/bin/sh\nexit 0\n",
  });
  await git(path, "mv", "old.txt", "renamed.txt");
  await git(path, "rm", "remove.txt");
  await git(path, "update-index", "--chmod=+x", "run.sh");
  await writeFile(join(path, "added.bin"), Buffer.from([0, 1, 255]));
  await git(path, "add", "--", "added.bin");
  const message = await generate();
  assert.equal(message.fileCount, 4);
  assert.match(message.description, /Rename old\.txt to renamed\.txt/);
  assert.match(message.description, /Remove remove\.txt/);
  assert.match(message.description, /Add added\.bin/);
  assert.match(message.description, /Update permissions for run\.sh/);
  assert.ok(message.summary.length <= 72);
});

test("message generation distinguishes same-named files when a staged rename moves directories", async (t) => {
  const { path, generate } = await fixture(t, {
    "old/index.ts": "export default 1;\n",
  });
  await mkdir(join(path, "new"));
  await git(path, "mv", "old/index.ts", "new/index.ts");
  assert.equal(
    (await generate()).summary,
    "Rename old/index.ts to new/index.ts",
  );
});

test("message generation summarizes two file actions when they fit on one line", async (t) => {
  const { path, generate } = await fixture(t, {
    "Button.tsx": "export const label = 'old';\n",
  });
  await writeFile(join(path, "Button.tsx"), "export const label = 'new';\n");
  await writeFile(join(path, "utils.ts"), "export const value = 1;\n");
  await git(path, "add", "--all");
  assert.equal(
    (await generate()).summary,
    "Update Button.tsx and add utils.ts",
  );
});

test("message generation keeps two long file names within the summary limit", async (t) => {
  const { path, generate } = await fixture(t);
  for (const name of [`${"a".repeat(100)}.txt`, `${"b".repeat(100)}.txt`])
    await writeFile(join(path, name), "content\n");
  await git(path, "add", "--all");
  assert.equal((await generate()).summary, "Add 2 files");
});

test("message generation rejects unresolved conflicts without changing the index", async (t) => {
  const { path, generate } = await fixture(t, { "conflict.txt": "initial\n" });
  const branch = await git(path, "branch", "--show-current");
  await git(path, "switch", "-c", "other");
  await writeFile(join(path, "conflict.txt"), "other\n");
  await git(path, "commit", "-am", "Other change");
  await git(path, "switch", branch);
  await writeFile(join(path, "conflict.txt"), "current\n");
  await git(path, "commit", "-am", "Current change");
  await assert.rejects(git(path, "merge", "other"), (error) =>
    /conflict|merge failed/i.test(error.stdout),
  );
  const index = await readFile(join(path, ".git", "index"));
  await assert.rejects(generate(), /resolve.*conflict|unresolved.*conflict/i);
  assert.deepEqual(await readFile(join(path, ".git", "index")), index);
});

test("message generation bounds long paths and large change lists without inventing details", async (t) => {
  const { path, generate } = await fixture(t);
  const directory = `docs/${"long-directory-".repeat(10)}`;
  await mkdir(join(path, directory), { recursive: true });
  for (let i = 0; i < 80; i++)
    await writeFile(
      join(path, directory, `guide-${i}.md`),
      "Sensitive document contents\n",
    );
  await git(path, "add", "--all");
  const message = await generate();
  assert.equal(message.fileCount, 80);
  assert.match(message.summary, /^Add documentation/);
  assert.ok(message.summary.length <= 72);
  assert.ok(message.description.length <= 4096);
  assert.match(message.description, /more staged files/);
  assert.doesNotMatch(JSON.stringify(message), /Sensitive document contents/);
});

test("message generation rejects an oversized staged change list without returning a partial message", async (t) => {
  const { path, generate } = await fixture(t, { "seed.txt": "seed\n" });
  const blob = await git(path, "rev-parse", "HEAD:seed.txt");
  const entries = Array.from(
    { length: 5000 },
    (_, index) =>
      `100644 ${blob}\t${"long-file-name-".repeat(10)}${index}.txt\0`,
  ).join("");
  const update = exec("git", ["update-index", "-z", "--index-info"], {
    cwd: path,
  });
  update.child.stdin.end(entries);
  await update;
  const beforeIndex = await readFile(join(path, ".git", "index"));
  await assert.rejects(generate(), /too many staged|smaller set/i);
  assert.deepEqual(await readFile(join(path, ".git", "index")), beforeIndex);
});

test("message generation escapes control characters in paths and does not follow staged symlinks", async (t) => {
  const { base, path, generate } = await fixture(t);
  const name = "change\n- forged change\t.txt";
  await writeFile(join(path, name), "content\n");
  await writeFile(join(path, "--dangerous-looking.txt"), "content\n");
  const outside = join(base, "outside.txt");
  await writeFile(outside, "DO_NOT_READ_SYMLINK_TARGET");
  await symlink(outside, join(path, "link.txt"));
  await git(path, "add", "--all");
  const message = await generate();
  assert.equal(message.fileCount, 3);
  assert.match(message.description, /change\\n- forged change\\t\.txt/);
  assert.match(message.description, /Add --dangerous-looking\.txt/);
  assert.match(message.description, /Add link\.txt/);
  assert.equal(message.description.split("\n").length, 3);
  assert.doesNotMatch(JSON.stringify(message), /DO_NOT_READ_SYMLINK_TARGET/);
});

test("message generation never invokes configured external diff or textconv programs", async (t) => {
  const { path, generate } = await fixture(t, {
    ".gitattributes": "*.private diff=probe\n",
    "data.private": "Original data\n",
  });
  const marker = join(path, ".git", "driver-ran");
  const driver = join(path, ".git", "driver.cjs");
  await writeFile(
    driver,
    `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed');\n`,
  );
  await chmod(driver, 0o755);
  await git(path, "config", "diff.external", JSON.stringify(driver));
  await git(path, "config", "diff.probe.textconv", JSON.stringify(driver));
  await git(path, "config", "color.diff", "always");
  await writeFile(join(path, "data.private"), "Staged sensitive data\n");
  await git(path, "add", "--", "data.private");
  const message = await generate();
  assert.equal(message.summary, "Update data.private");
  await assert.rejects(access(marker), { code: "ENOENT" });
});

test("message generation includes staged submodule updates despite ignore settings", async (t) => {
  const { path, generate } = await fixture(t, { "README.md": "Initial\n" });
  const first = await git(path, "rev-parse", "HEAD");
  await git(
    path,
    "update-index",
    "--add",
    "--cacheinfo",
    `160000,${first},vendor/module`,
  );
  await git(path, "commit", "-m", "Add module entry");
  const next = await git(path, "rev-parse", "HEAD");
  await git(
    path,
    "update-index",
    "--cacheinfo",
    `160000,${next},vendor/module`,
  );
  await git(path, "config", "diff.ignoreSubmodules", "all");
  const message = await generate();
  assert.equal(message.fileCount, 1);
  assert.equal(message.description, "- Update vendor/module");
});
