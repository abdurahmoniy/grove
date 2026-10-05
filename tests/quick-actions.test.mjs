import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  normalizeQuickActions,
  normalizeSyncTarget,
  resolveSyncRemote,
  isValidSyncBranch,
} from "../src/lib/quickActions.ts";

const defaults = {
  visible: { fetch: true, pull: true, push: true, sync: true },
  confirmSync: false,
};
const snapshot = (names, upstream = "") => ({
  remotes: names.map((name) => ({ name, url: `https://example.test/${name}` })),
  upstream,
});

test("restores independent quick-action defaults from missing or malformed persisted data", () => {
  for (const value of [
    undefined,
    null,
    false,
    4,
    [],
    "broken json",
    "null",
    '"text"',
  ]) {
    assert.deepEqual(normalizeQuickActions(value), defaults);
  }
  const first = normalizeQuickActions(null);
  first.visible.fetch = false;
  assert.deepEqual(normalizeQuickActions(null), defaults);
});

test("preserves explicit boolean choices while completing older partial preferences", () => {
  assert.deepEqual(
    normalizeQuickActions(
      JSON.stringify({
        visible: { fetch: false, sync: false },
        confirmSync: true,
      }),
    ),
    {
      visible: { fetch: false, pull: true, push: true, sync: false },
      confirmSync: true,
    },
  );
  assert.deepEqual(
    normalizeQuickActions({
      visible: { fetch: "false", pull: 0, push: null, sync: false },
      confirmSync: "true",
      extra: true,
    }),
    {
      visible: { fetch: true, pull: true, push: true, sync: false },
      confirmSync: false,
    },
  );
  assert.deepEqual(
    normalizeQuickActions({ visible: [false, false], confirmSync: false }),
    defaults,
  );
  assert.deepEqual(
    normalizeQuickActions({ visible: '{"fetch":false}' }),
    defaults,
  );
});

test("normalizes repository targets without silently replacing incomplete or invalid string choices", () => {
  for (const value of [undefined, null, [], "not json", "null"]) {
    assert.deepEqual(normalizeSyncTarget(value), {
      remote: "",
      branch: "main",
    });
  }
  assert.deepEqual(normalizeSyncTarget({ remote: 1, branch: true }), {
    remote: "",
    branch: "main",
  });
  assert.deepEqual(
    normalizeSyncTarget('{"remote":"team/upstream","branch":"release/2026"}'),
    { remote: "team/upstream", branch: "release/2026" },
  );
  assert.deepEqual(normalizeSyncTarget({ remote: "removed", branch: "" }), {
    remote: "removed",
    branch: "",
  });
  assert.deepEqual(normalizeSyncTarget({ branch: "refs/heads/main" }), {
    remote: "",
    branch: "refs/heads/main",
  });
});

test("automatic sync prefers origin then the longest upstream remote prefix then the first configured remote", () => {
  const automatic = { remote: "", branch: "main" };
  assert.equal(
    resolveSyncRemote(snapshot(["team", "origin"], "team/main"), automatic),
    "origin",
  );
  assert.equal(
    resolveSyncRemote(
      snapshot(["team", "team/upstream", "fork"], "team/upstream/release/main"),
      automatic,
    ),
    "team/upstream",
  );
  assert.equal(
    resolveSyncRemote(snapshot(["first", "second"], "removed/main"), automatic),
    "first",
  );
  assert.equal(
    resolveSyncRemote(snapshot(["a", "ab"], "ab/main"), automatic),
    "ab",
  );
  assert.equal(
    resolveSyncRemote(snapshot(["a", "fallback"], "another/main"), automatic),
    "a",
  );
});

test("explicit sync remotes never silently fall back when removed", () => {
  const data = snapshot(["origin", "team/upstream"], "origin/main");
  assert.equal(
    resolveSyncRemote(data, { remote: "team/upstream", branch: "main" }),
    "team/upstream",
  );
  assert.equal(
    resolveSyncRemote(data, { remote: "removed", branch: "main" }),
    "",
  );
  assert.equal(
    resolveSyncRemote(null, { remote: "origin", branch: "main" }),
    "",
  );
  assert.equal(
    resolveSyncRemote(snapshot([]), { remote: "", branch: "main" }),
    "",
  );
});

test("sync branch validation matches Git short branch restrictions including @ and nested names", () => {
  const names = [
    "main",
    "@",
    "feature/new-ui",
    "release/v1.2",
    "team/@home",
    "日本語",
    "with\u00a0nbsp",
    "",
    "+main",
    "-main",
    "refs/heads/main",
    "a..b",
    "a@{b",
    "a~b",
    "a^b",
    "a:b",
    "a?b",
    "a*b",
    "a[b",
    "a\\b",
    "a b",
    "a\tb",
    "a\nb",
    "a\u007fb",
    ".main",
    "a/.hidden",
    "a.lock",
    "a.lock/b",
    "/main",
    "main/",
    "a//b",
    "main.",
  ];
  for (const name of names) {
    const git = spawnSync("git", ["check-ref-format", `refs/heads/${name}`]);
    assert.ifError(git.error);
    const expected =
      git.status === 0 && !/^[+-]/.test(name) && !name.startsWith("refs/");
    assert.equal(isValidSyncBranch(name), expected, JSON.stringify(name));
  }
});
