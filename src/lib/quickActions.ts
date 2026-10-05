import type { Snapshot } from "../types";

export type QuickActionId = "fetch" | "pull" | "push" | "sync";
export interface QuickActionPreferences {
  visible: Record<QuickActionId, boolean>;
  confirmSync: boolean;
}
export interface RepositorySyncPreferences {
  remote: string;
  branch: string;
}

export const DEFAULT_QUICK_ACTIONS: QuickActionPreferences = {
  visible: { fetch: true, pull: true, push: true, sync: true },
  confirmSync: false,
};
export const DEFAULT_SYNC_TARGET: RepositorySyncPreferences = {
  remote: "",
  branch: "main",
};

function savedRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeQuickActions(value: unknown): QuickActionPreferences {
  const saved = savedRecord(value);
  const visible =
    saved.visible &&
    typeof saved.visible === "object" &&
    !Array.isArray(saved.visible)
      ? (saved.visible as Record<string, unknown>)
      : {};
  return {
    visible: {
      fetch: typeof visible.fetch === "boolean" ? visible.fetch : true,
      pull: typeof visible.pull === "boolean" ? visible.pull : true,
      push: typeof visible.push === "boolean" ? visible.push : true,
      sync: typeof visible.sync === "boolean" ? visible.sync : true,
    },
    confirmSync:
      typeof saved.confirmSync === "boolean" ? saved.confirmSync : false,
  };
}

export function normalizeSyncTarget(value: unknown): RepositorySyncPreferences {
  const saved = savedRecord(value);
  return {
    remote: typeof saved.remote === "string" ? saved.remote : "",
    branch: typeof saved.branch === "string" ? saved.branch : "main",
  };
}

export function resolveSyncRemote(
  snapshot: Snapshot | null,
  target: RepositorySyncPreferences,
): string {
  const remotes = snapshot?.remotes || [];
  if (target.remote)
    return remotes.some((remote) => remote.name === target.remote)
      ? target.remote
      : "";
  if (remotes.some((remote) => remote.name === "origin")) return "origin";
  return (
    remotes
      .filter((remote) => snapshot?.upstream.startsWith(`${remote.name}/`))
      .sort((a, b) => b.name.length - a.name.length)[0]?.name ||
    remotes[0]?.name ||
    ""
  );
}

export function isValidSyncBranch(name: string): boolean {
  return (
    !!name &&
    !/^[+-]/.test(name) &&
    !name.startsWith("refs/") &&
    !name.endsWith(".") &&
    !name.includes("..") &&
    !name.includes("@{") &&
    !/[~^:?*\[\\]/.test(name) &&
    !Array.from(name).some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    ) &&
    !name
      .split("/")
      .some((part) => !part || part.startsWith(".") || part.endsWith(".lock"))
  );
}
