import { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  Terminal,
  Plus,
  Download,
  Check,
  AlertTriangle,
} from "lucide-react";
import type { ActionArgs, DiffData, Project, Snapshot } from "./types";
import { errorMessage, isDesktop, request } from "./api";
import {
  isValidSyncBranch,
  normalizeQuickActions,
  normalizeSyncTarget,
  resolveSyncRemote,
} from "./lib/quickActions";
import type {
  QuickActionPreferences,
  RepositorySyncPreferences,
} from "./lib/quickActions";
import WorkspaceHeader from "./components/WorkspaceHeader";
import CommitComposer from "./components/CommitComposer";
import type { View } from "./components/Sidebar";
import Changes, {
  isConflict,
  isStaged,
  isUnstaged,
} from "./components/Changes";
import type { CommitDraft } from "./components/Changes";
import DiffViewer from "./components/DiffViewer";
import History from "./components/History";
import Resources from "./components/Resources";
import type { ActivityEntry } from "./components/Resources";
import ActionDialog from "./components/ActionDialog";
import SyncDialog from "./components/SyncDialog";
import StashInspector from "./components/StashInspector";
import { EmptyState, Loading, Logo, Modal, Toast } from "./components/ui";

const viewLabels: Record<View, string> = {
  changes: "Changes",
  history: "History",
  branches: "Branches",
  stashes: "Stashes",
  tags: "Tags",
  remotes: "Remotes",
  activity: "Activity log",
  settings: "Preferences",
};
function preference(key: string, fallback: string) {
  try {
    return localStorage.getItem(`grove:${key}`) || fallback;
  } catch {
    return fallback;
  }
}
function ResizeHandle({
  label,
  width,
  onResize,
  min,
  max,
}: {
  label: string;
  width: number;
  onResize: (width: number) => void;
  min: number;
  max: number;
}) {
  const start = useRef({ x: 0, width });
  return (
    <div
      className="resize-handle"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuetext={`${width} pixels`}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onResize(
            Math.max(
              min,
              Math.min(max, width + (e.key === "ArrowLeft" ? -10 : 10)),
            ),
          );
        }
      }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          onResize(
            Math.max(
              min,
              Math.min(max, start.current.width + e.clientX - start.current.x),
            ),
          );
      }}
    />
  );
}
export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [view, setView] = useState<View>("changes");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current !== view)
      headingRef.current?.focus({ preventScroll: true });
    previousView.current = view;
  }, [view]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<{
    path: string;
    staged: boolean;
  } | null>(null);
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState("");
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState("");
  const [operation, setOperation] = useState<{
    action: string;
    args: ActionArgs;
  } | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const [help, setHelp] = useState(false);
  const [stashInspect, setStashInspect] = useState<string | null>(null);
  const closeStashInspect = useCallback(() => setStashInspect(null), []);
  const [editor, setEditor] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CommitDraft>>(() => {
    try {
      return JSON.parse(preference("drafts", "{}"));
    } catch {
      return {};
    }
  });
  const navigate = (next: View) => setView(next);
  useEffect(() => {
    try {
      localStorage.setItem("grove:drafts", JSON.stringify(drafts));
    } catch {}
  }, [drafts]);
  const [filesWidth, setFilesWidth] = useState(() => {
    const saved = Number(preference("filesWidth", "320"));
    return Number.isFinite(saved) ? Math.max(280, Math.min(480, saved)) : 320;
  });
  const [fontSize, setFontSize] = useState(preference("fontSize", "13"));
  const [compact, setCompact] = useState(
    preference("compact", "false") === "true",
  );
  const [quickActions, setQuickActions] = useState(() =>
    normalizeQuickActions(preference("quickActions", "{}")),
  );
  const [syncTargets, setSyncTargets] = useState<Record<string, unknown>>(
    () => {
      try {
        const saved: unknown = JSON.parse(preference("syncTargets", "{}"));
        return saved && typeof saved === "object" && !Array.isArray(saved)
          ? (saved as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    },
  );
  const syncTarget = normalizeSyncTarget(
    project ? syncTargets[project.path] : undefined,
  );
  const syncRemote = resolveSyncRemote(snapshot, syncTarget);
  const syncDisabledReason = busy
    ? "Wait for the current operation to finish"
    : !snapshot || !project
      ? "Open a repository to sync"
      : snapshot.detached
        ? "Switch to a local branch before syncing"
        : snapshot.operation
          ? `Finish the ${snapshot.operation} operation before syncing`
          : !isValidSyncBranch(syncTarget.branch)
            ? "Choose a valid default branch in Preferences → Quick actions"
            : !syncRemote
              ? "Choose a configured sync remote in Preferences → Quick actions"
              : "";
  const syncHint = `Fast-forward ${snapshot?.branch || "the current branch"} from ${syncRemote}/${syncTarget.branch}. Stops if branches have diverged.`;
  const saveQuickActions = (next: QuickActionPreferences) => {
    const value = normalizeQuickActions(next);
    setQuickActions(value);
    try {
      localStorage.setItem("grove:quickActions", JSON.stringify(value));
    } catch {
      setToast({
        message:
          "Quick actions updated for this session, but could not be saved.",
        error: true,
      });
    }
  };
  const saveSyncTarget = (next: RepositorySyncPreferences) => {
    if (!project) return;
    const value = { ...syncTargets, [project.path]: normalizeSyncTarget(next) };
    setSyncTargets(value);
    try {
      localStorage.setItem("grove:syncTargets", JSON.stringify(value));
    } catch {
      setToast({
        message:
          "Sync target updated for this session, but could not be saved.",
        error: true,
      });
    }
  };
  const openOperation = useCallback((action: string, args: ActionArgs = {}) => {
    if (action === "stash-inspect") {
      setStashInspect(args.ref || "stash@{0}");
      return;
    }
    setOperation({ action, args });
  }, []);
  const closeOperation = useCallback(() => setOperation(null), []);
  const closeHelp = useCallback(() => setHelp(false), []);
  const closeEditor = useCallback(() => setEditor(null), []);

  const refresh = useCallback(
    async (quiet = false) => {
      if (!project) return;
      const path = project.path;
      try {
        const data = await request<Snapshot>("snapshot", { path });
        if (projectRef.current?.path !== path) return;
        setSnapshot(data);
        setLoadError("");
        setRevision((n) => n + 1);
        setSelected((previous) => {
          const existing = data.files.find((f) => f.path === previous?.path);
          if (
            existing &&
            previous &&
            (previous.staged ? isStaged(existing) : isUnstaged(existing))
          )
            return previous;
          if (existing)
            return { path: existing.path, staged: isStaged(existing) };
          const first = data.files.find(isUnstaged) || data.files[0];
          return first
            ? { path: first.path, staged: !isUnstaged(first) }
            : null;
        });
      } catch (err) {
        if (projectRef.current?.path === path && !quiet) {
          setLoadError(errorMessage(err));
          setToast({ message: errorMessage(err), error: true });
        }
      }
    },
    [project],
  );
  useEffect(() => {
    let cancelled = false;
    request<Project[]>("projects")
      .then((data) => {
        if (!cancelled) {
          setProjects(data);
          setProject(data[0] || null);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!project) {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    setSnapshot(null);
    setSelected(null);
    setDiff(null);
    void refresh().finally(() => {
      if (projectRef.current?.path === project.path) setLoading(false);
    });
  }, [project, refresh]);
  useEffect(() => {
    const onFocus = () => {
      if (!busy) void refresh(true);
    };
    window.addEventListener("focus", onFocus);
    const unsubscribe = window.grove?.onChange?.(onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      unsubscribe?.();
    };
  }, [refresh, busy]);
  useEffect(() => {
    let cancelled = false;
    if (!project || !selected) {
      setDiff(null);
      return;
    }
    setDiffLoading(true);
    setDiffError("");
    request<DiffData>("diff", {
      path: project.path,
      file: selected.path,
      staged: selected.staged,
      full,
    })
      .then((data) => {
        if (!cancelled) setDiff(data);
      })
      .catch((err) => {
        if (!cancelled) setDiffError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, selected, revision, full]);
  useEffect(() => {
    setFull(false);
  }, [selected?.path]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const openRepository = useCallback(async () => {
    try {
      const opened = await request<Project | null>("open");
      if (opened) {
        setProjects(await request<Project[]>("projects"));
        setProject(opened);
        setView("changes");
      }
    } catch (e) {
      setToast({ message: errorMessage(e), error: true });
    }
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        !(e.metaKey || e.ctrlKey) ||
        document.querySelector('.modal[role="dialog"]') ||
        operation ||
        editor ||
        help ||
        stashInspect
      )
        return;
      if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openRepository();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        void refresh();
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (project) openOperation("command");
      } else if (["1", "2", "3"].includes(e.key) && project) {
        e.preventDefault();
        setView(
          e.key === "1" ? "changes" : e.key === "2" ? "history" : "branches",
        );
      } else if (e.key.toLowerCase() === "f" && view === "changes") {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>(
            '[aria-label="Filter changed files"]',
          )
          ?.focus();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [
    openRepository,
    refresh,
    project,
    openOperation,
    view,
    operation,
    editor,
    help,
    stashInspect,
  ]);

  const run = useCallback(
    async (
      action: string,
      args: ActionArgs = {},
      options: { inlineErrors?: boolean } = {},
    ) => {
      const path = project?.path;
      if (!path && action !== "clone" && action !== "init")
        throw new Error("Open a repository first.");
      setBusy(action);
      const record = (output: string, error: boolean) =>
        setActivity((entries) =>
          [
            {
              id: Date.now(),
              action,
              output,
              error,
              date: new Date().toISOString(),
              repository: path || args.name || "New repository",
            },
            ...entries,
          ].slice(0, 150),
        );
      try {
        if (action === "clone" || action === "init") {
          const opened = await request<Project | null>(
            action,
            args as Record<string, unknown>,
          );
          if (opened) {
            setProjects(await request<Project[]>("projects"));
            setProject(opened);
            setView("changes");
            record(`Opened ${opened.path}`, false);
            setToast({ message: `${opened.name} is ready.` });
          }
        } else {
          const output = await request<string>("action", {
            path,
            action,
            args,
          });
          record(output, false);
          if (action === "commit" || action === "amend")
            setDrafts((current) => ({
              ...current,
              [path!]: { summary: "", description: "", amend: false },
            }));
          setToast({
            message:
              action === "commit"
                ? "Commit created."
                : action === "stage"
                  ? "Changes staged for your next commit."
                  : action === "unstage"
                    ? "Changes moved to your working tree."
                    : `${action.replaceAll("-", " ")} completed. Details are in the activity log.`,
          });
          if (action === "command") setView("activity");
        }
      } catch (err) {
        record(errorMessage(err), true);
        if (!options.inlineErrors)
          setToast({ message: errorMessage(err), error: true });
        throw err;
      } finally {
        await refresh();
        setBusy("");
      }
    },
    [project, refresh],
  );
  const quickAction = (action: string, args: ActionArgs = {}) => {
    if (!busy) void run(action, args).catch(() => {});
  };
  const syncWithDefault = () => {
    if (syncDisabledReason) return;
    const args = { remote: syncRemote, remoteBranch: syncTarget.branch };
    if (quickActions.confirmSync) openOperation("pull", args);
    else quickAction("pull", args);
  };
  const currentConflict = snapshot?.files.find(
    (f) => f.path === selected?.path && isConflict(f),
  );
  const notifyPreference = (key: string, value: string | boolean) => {
    try {
      localStorage.setItem(`grove:${key}`, String(value));
    } catch {}
    if (key === "fontSize") setFontSize(String(value));
    else setCompact(Boolean(value));
  };
  const isChanges = view === "changes";
  return (
    <div
      className={`app ${compact ? "compact-mode" : ""} workbench ${isDesktop ? "desktop" : "browser"}`}
      style={
        {
          "--files-width": `${filesWidth}px`,
          "--code-size": `${fontSize}px`,
        } as React.CSSProperties
      }
    >
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <div className="titlebar">
        <div className="window-space">
          {!isDesktop && (
            <div className="window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        <div className="titlebar-center">
          <span>Grove</span>
          <span>{project?.name || "Local Git client"}</span>
        </div>
        <div className="titlebar-right" aria-hidden="true" />
      </div>
      <div className="app-body">
        <main className="workspace" aria-label="Repository workspace">
          <WorkspaceHeader
            projects={projects}
            project={project}
            snapshot={snapshot}
            busy={!!busy}
            view={view}
            setView={navigate}
            selectProject={(next) => {
              if (!busy) {
                setProject(next);
                navigate("changes");
              }
            }}
            onOpen={() => void openRepository()}
            onOperation={openOperation}
            onQuickAction={quickAction}
            onRefresh={() => void refresh()}
            onHelp={() => setHelp(true)}
            quickActions={quickActions}
            syncBranch={syncTarget.branch}
            syncHint={syncHint}
            syncDisabledReason={syncDisabledReason}
            onDefaultSync={syncWithDefault}
          />
          <h1 className="sr-only" ref={headingRef} tabIndex={-1}>
            {viewLabels[view]}
          </h1>
          {snapshot?.operation && (
            <div className="operation-banner" role="status">
              <AlertTriangle size={16} />
              <span>
                <strong>{snapshot.operation} in progress.</strong> Resolve
                conflicts, stage the files, then continue.
              </span>
              <button
                className="button small"
                disabled={!!busy}
                onClick={() => quickAction("continue")}
              >
                Continue
              </button>
              <button
                className="button small"
                disabled={!!busy}
                onClick={() => openOperation("abort")}
              >
                Abort
              </button>
            </div>
          )}
          <div
            className="workspace-content"
            id="workspace-content"
            tabIndex={-1}
          >
            {loading ? (
              <Loading />
            ) : !project && !["settings", "activity"].includes(view) ? (
              <div className="welcome">
                <div className="welcome-art">
                  <div className="welcome-orbit orbit-one" />
                  <div className="welcome-orbit orbit-two" />
                  <div className="welcome-logo">
                    <Logo size={56} />
                  </div>
                  <span className="orbit-dot one" />
                  <span className="orbit-dot two" />
                </div>
                <h2>Your code, ready to review.</h2>
                <p>
                  Open a local Git repository or clone one from a remote.
                  <br />
                  Your existing Git identity and credentials are used.
                </p>
                <div className="welcome-buttons">
                  <button
                    className="button primary"
                    onClick={() => void openRepository()}
                  >
                    <FolderOpen size={16} />
                    Open repository
                  </button>
                  <button
                    className="button"
                    onClick={() => openOperation("clone")}
                  >
                    <Download size={16} />
                    Clone repository
                  </button>
                </div>
                <button
                  className="text-button welcome-init"
                  onClick={() => quickAction("init")}
                >
                  <Plus size={13} />
                  Start fresh with a new repository
                </button>
                {loadError && <p className="inline-error">{loadError}</p>}
                <div className="welcome-features">
                  <span>
                    <Check size={13} />
                    Your files stay local
                  </span>
                  <span>
                    <Check size={13} />
                    Your existing Git setup
                  </span>
                  <span>
                    <Check size={13} />
                    Built for focus
                  </span>
                </div>
              </div>
            ) : loadError && !snapshot ? (
              <EmptyState
                title="We couldn’t open this repository"
                description={loadError}
              >
                <button className="button" onClick={() => void refresh()}>
                  Try again
                </button>
              </EmptyState>
            ) : isChanges && snapshot ? (
              <div className="changes-workspace">
                <Changes
                  key={project?.path}
                  snapshot={snapshot}
                  selected={selected}
                  onSelect={(path, staged) => setSelected({ path, staged })}
                  busy={!!busy}
                  onAction={(action, files) =>
                    action === "discard" || action === "stash-save"
                      ? openOperation(action, { files })
                      : quickAction(action, { files })
                  }
                />
                <ResizeHandle
                  label="Resize changed files"
                  width={filesWidth}
                  onResize={(width) => {
                    setFilesWidth(width);
                    try {
                      localStorage.setItem("grove:filesWidth", String(width));
                    } catch {}
                  }}
                  min={280}
                  max={480}
                />
                <DiffViewer
                  file={selected?.path || null}
                  staged={selected?.staged}
                  diff={diff}
                  loading={diffLoading}
                  error={diffError}
                  onStage={
                    selected && !busy
                      ? () =>
                          quickAction(selected.staged ? "unstage" : "stage", {
                            files: [selected.path],
                          })
                      : undefined
                  }
                  onFull={full ? undefined : () => setFull(true)}
                  onResolve={
                    currentConflict
                      ? () => setEditor(currentConflict.path)
                      : undefined
                  }
                />
              </div>
            ) : view === "history" && project ? (
              <History
                path={project.path}
                revision={revision}
                onOperation={openOperation}
              />
            ) : (
              <Resources
                onOperation={openOperation}
                view={view}
                snapshot={snapshot}
                activity={activity}
                projects={projects}
                onForget={async (path) => {
                  try {
                    await request("forget", { path });
                    const remaining = await request<Project[]>("projects");
                    setProjects(remaining);
                    if (project?.path === path)
                      setProject(remaining[0] || null);
                  } catch (e) {
                    setToast({ message: errorMessage(e), error: true });
                  }
                }}
                onPreference={notifyPreference}
                fontSize={fontSize}
                compact={compact}
                project={project}
                quickActions={quickActions}
                syncTarget={syncTarget}
                onQuickActionsChange={saveQuickActions}
                onSyncTargetChange={saveSyncTarget}
              />
            )}
          </div>
          {isChanges && snapshot && project && !loading && (
            <CommitComposer
              key={project.path}
              snapshot={snapshot}
              busy={!!busy}
              draft={
                drafts[project.path] || {
                  summary: "",
                  description: "",
                  amend: false,
                }
              }
              onDraftChange={(draft) =>
                setDrafts((current) => ({ ...current, [project.path]: draft }))
              }
              onCommit={async (message, amend) => {
                if (amend) {
                  openOperation("amend", { message });
                  return false;
                }
                try {
                  await run("commit", { message });
                  return true;
                } catch {
                  return false;
                }
              }}
            />
          )}
        </main>
      </div>
      <footer className="statusbar">
        <div>
          <Logo size={13} />
          <span>
            {isDesktop
              ? "Local Git"
              : "Interactive demo · no local files are changed"}
          </span>
        </div>
        <div>
          <span className="operation-status" role="status">
            {busy ? "Working…" : ""}
          </span>
          <button disabled={!project} onClick={() => openOperation("command")}>
            <Terminal size={12} />
            Git command<kbd>⌘K</kbd>
          </button>
        </div>
      </footer>
      {operation &&
        (operation.action === "pull" || operation.action === "push" ? (
          <SyncDialog
            action={operation.action}
            initial={operation.args}
            snapshot={snapshot}
            path={project?.path || ""}
            onClose={closeOperation}
            onSubmit={(action, args) =>
              run(action, args, { inlineErrors: true })
            }
          />
        ) : (
          <ActionDialog
            action={operation.action}
            initial={operation.args}
            snapshot={snapshot}
            path={project?.path || ""}
            onClose={closeOperation}
            onSubmit={run}
          />
        ))}
      {stashInspect && project && (
        <StashInspector
          path={project.path}
          reference={stashInspect}
          onClose={closeStashInspect}
        />
      )}
      {editor && project && (
        <ConflictEditor
          path={project.path}
          file={editor}
          onClose={closeEditor}
          onSaved={async () => {
            await run("stage", { files: [editor] });
            setEditor(null);
          }}
        />
      )}
      {help && (
        <Modal
          title="Keyboard shortcuts"
          subtitle="Move through your workspace without leaving the keyboard."
          onClose={closeHelp}
        >
          <div className="shortcut-list">
            {[
              ["Open repository", "⌘ O"],
              ["Refresh repository", "⌘ R"],
              ["Find a changed file", "⌘ F"],
              ["Open Git command", "⌘ K"],
              ["Changes / History / Branches", "⌘ 1 / 2 / 3"],
              ["Commit from summary or description", "⌘ ↵"],
              ["Previous / next file", "↑ / ↓"],
              ["Close a dialog", "Esc"],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
            <p>
              Use Ctrl instead of ⌘ on Windows and Linux. Drag panel dividers to
              find your balance.
            </p>
            {!isDesktop && (
              <div className="demo-notice">
                You’re exploring the interactive demo. Launch the desktop app
                with <code>npm run desktop</code> to open your local Git
                repositories.
              </div>
            )}
          </div>
        </Modal>
      )}
      {toast && (
        <Toast
          message={toast.message}
          error={toast.error}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

function ConflictEditor({
  path,
  file,
  onClose,
  onSaved,
}: {
  path: string;
  file: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    request<string>("readFile", { path, file })
      .then((data) => {
        if (!cancelled) setContent(data);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, file]);
  const markers = /^(<<<<<<< |=======\r?$|>>>>>>> )/m.test(content);
  return (
    <Modal
      wide
      title="Resolve conflict"
      subtitle={file}
      onClose={busy ? () => {} : onClose}
    >
      <div className="conflict-editor">
        {loading ? (
          <Loading />
        ) : (
          <>
            <p>
              Edit the result below. Remove the conflict markers and keep the
              changes you want.
            </p>
            <textarea
              aria-label="Resolved file content"
              spellCheck={false}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            {markers && (
              <span className="warning-text">
                Conflict markers still remain in this file.
              </span>
            )}
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
          </>
        )}
      </div>
      <div className="modal-actions">
        <button className="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={busy || loading || markers || !!error}
          onClick={async () => {
            setBusy(true);
            try {
              await request("writeFile", { path, file, content });
              await onSaved();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Check size={14} />
          {busy ? "Saving…" : "Save & mark resolved"}
        </button>
      </div>
    </Modal>
  );
}
