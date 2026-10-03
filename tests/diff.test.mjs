import test from "node:test";
import assert from "node:assert/strict";
import { parseDiff } from "../src/lib/diff.ts";

const counts = (lines) => ({
  additions: lines.filter((line) => line.type === "add").length,
  deletions: lines.filter((line) => line.type === "delete").length,
});

test("keeps changed source lines that resemble unified diff file headers", () => {
  const lines = parseDiff(
    "diff --git a/code.js b/code.js\n--- a/code.js\n+++ b/code.js\n@@ -1,2 +1,2 @@\n--- old comment\n-old value\n+++ counter;\n+new value\n",
  );
  assert.deepEqual(lines, [
    { type: "hunk", text: "@@ -1,2 +1,2 @@" },
    { type: "delete", text: "-- old comment", old: 1 },
    { type: "delete", text: "old value", old: 2 },
    { type: "add", text: "++ counter;", next: 1 },
    { type: "add", text: "new value", next: 2 },
  ]);
  assert.deepEqual(counts(lines), { additions: 2, deletions: 2 });
});

test("uses hunk ranges to stop counting trailing metadata and restart for the next file", () => {
  const lines = parseDiff(
    [
      "diff --git a/one b/one",
      "--- a/one",
      "+++ b/one",
      "@@ -4 +9 @@",
      "-before",
      "+after",
      "--- a/two",
      "+++ b/two",
      "@@ -20,2 +30,2 @@ function example",
      " same",
      "-removed",
      "+added",
      "diff --git a/three b/three",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/three",
      "@@ -0,0 +1 @@",
      "+third file",
      "",
    ].join("\n"),
  );
  assert.deepEqual(lines, [
    { type: "hunk", text: "@@ -4 +9 @@" },
    { type: "delete", text: "before", old: 4 },
    { type: "add", text: "after", next: 9 },
    { type: "hunk", text: "@@ -20,2 +30,2 @@ function example" },
    { type: "context", text: "same", old: 20, next: 30 },
    { type: "delete", text: "removed", old: 21 },
    { type: "add", text: "added", next: 31 },
    { type: "hunk", text: "@@ -0,0 +1 @@" },
    { type: "add", text: "third file", next: 1 },
  ]);
  assert.deepEqual(counts(lines), { additions: 3, deletions: 2 });
});

test("handles zero-length old or new ranges and multiple hunks with exact numbering", () => {
  assert.deepEqual(
    parseDiff(
      "@@ -0,0 +1,2 @@\n+first\n+second\n@@ -10,2 +0,0 @@\n-ten\n-eleven\n@@ -40 +50 @@\n shared\n",
    ),
    [
      { type: "hunk", text: "@@ -0,0 +1,2 @@" },
      { type: "add", text: "first", next: 1 },
      { type: "add", text: "second", next: 2 },
      { type: "hunk", text: "@@ -10,2 +0,0 @@" },
      { type: "delete", text: "ten", old: 10 },
      { type: "delete", text: "eleven", old: 11 },
      { type: "hunk", text: "@@ -40 +50 @@" },
      { type: "context", text: "shared", old: 40, next: 50 },
    ],
  );
});

test("preserves empty changed lines, blank context, and meaningful source whitespace", () => {
  assert.deepEqual(
    parseDiff("@@ -2,3 +4,3 @@\n \n-\n+\n \tkept whitespace  \n"),
    [
      { type: "hunk", text: "@@ -2,3 +4,3 @@" },
      { type: "context", text: "", old: 2, next: 4 },
      { type: "delete", text: "", old: 3 },
      { type: "add", text: "", next: 5 },
      { type: "context", text: "\tkept whitespace  ", old: 4, next: 6 },
    ],
  );
});

test("supports suppressed blank context prefixes without inventing a line at the end of a truncated patch", () => {
  assert.deepEqual(parseDiff("@@ -1,2 +1,2 @@\n\n same\n"), [
    { type: "hunk", text: "@@ -1,2 +1,2 @@" },
    { type: "context", text: "", old: 1, next: 1 },
    { type: "context", text: "same", old: 2, next: 2 },
  ]);
  assert.deepEqual(parseDiff("@@ -1,2 +1,2 @@\n same\n"), [
    { type: "hunk", text: "@@ -1,2 +1,2 @@" },
    { type: "context", text: "same", old: 1, next: 1 },
  ]);
});

test("retains no-newline annotations without changing line numbers or addition/deletion totals", () => {
  const lines = parseDiff(
    "@@ -7 +9 @@\n-old without newline\n\\ No newline at end of file\n+new without newline\n\\ No newline at end of file\n",
  );
  assert.deepEqual(lines, [
    { type: "hunk", text: "@@ -7 +9 @@" },
    { type: "delete", text: "old without newline", old: 7 },
    { type: "hunk", text: "\\ No newline at end of file" },
    { type: "add", text: "new without newline", next: 9 },
    { type: "hunk", text: "\\ No newline at end of file" },
  ]);
  assert.deepEqual(counts(lines), { additions: 1, deletions: 1 });
});

test("keeps metadata-like source content inside hunks", () => {
  const source = [
    "diff --git is text",
    "index 123 is text",
    "--- a/not-a-header",
    "+++ b/not-a-header",
    "@@ -1 +1 @@",
    "rename from a source string",
  ];
  const patch = `@@ -1,0 +1,${source.length} @@\n${source.map((line) => `+${line}`).join("\n")}\n`;
  assert.deepEqual(
    parseDiff(patch).slice(1),
    source.map((text, index) => ({ type: "add", text, next: index + 1 })),
  );
});

test("does not interpret combined conflict hunks as ordinary two-way additions or deletions", () => {
  const lines = parseDiff(
    "@@ -1 +1 @@\n-old\n+new\ndiff --cc conflict.txt\nindex abc,def..000\n--- a/conflict.txt\n+++ b/conflict.txt\n@@@ -1,1 -1,1 +1,5 @@@\n++<<<<<<< HEAD\n +ours\n++=======\n+ theirs\n++>>>>>>> branch\n",
  );
  assert.deepEqual(counts(lines), { additions: 1, deletions: 1 });
  assert.ok(
    lines.some((line) => line.type === "hunk" && line.text.startsWith("@@@")),
  );
});

test("ignores non-patch input and never extends a completed hunk using stray prefixed lines", () => {
  assert.deepEqual(parseDiff("Binary files a/image and b/image differ\n"), []);
  assert.deepEqual(parseDiff(""), []);
  assert.deepEqual(
    parseDiff("@@ -1 +1 @@\n same\n+stray addition\n-stray deletion\n"),
    [
      { type: "hunk", text: "@@ -1 +1 @@" },
      { type: "context", text: "same", old: 1, next: 1 },
    ],
  );
});
