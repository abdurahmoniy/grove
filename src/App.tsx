import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  RefreshCw,
  MoreHorizontal,
  FolderOpen,
  GitBranch,
  Terminal,
  Plus,
  GitMerge,
  Archive,
  Tag,
  Copy,
  Command,
  CircleHelp,
  FolderGit2,
  Download,
  Check,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { ActionArgs, DiffData, Project, Snapshot } from "./types";
import { errorMessage, isDesktop, request } from "./api";
import Sidebar from "./components/Sidebar";
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
import StashInspector from "./components/StashInspector";
import {
  Badge,
  EmptyState,
  IconButton,
  Loading,
  Logo,
  Modal,
  Toast,
} from "./components/ui";

const viewLabels: Record<View, string> = {
  changes: "Local changes",
  history: "Commit history",
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
  const [menu, setMenu] = useState<"repo" | "add" | null>(null);
  const [help, setHelp] = useState(false);
  const [stashInspect, setStashInspect] = useState<string | null>(null);
  const closeStashInspect = useCallback(() => setStashInspect(null), []);
  const [editor, setEditor] = useState<string | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(window.innerWidth <= 760);
  const [drafts, setDrafts] = useState<Record<string, CommitDraft>>(() => {
    try {
      return JSON.parse(preference("drafts", "{}"));
    } catch {
      return {};
    }
  });
  const navigate = (next: View) => {
    setView(next);
    if (window.innerWidth <= 760) setSidebarHidden(true);
  };
  useEffect(() => {
    try {
      localStorage.setItem("grove:drafts", JSON.stringify(drafts));
    } catch {}
  }, [drafts]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const resize = () => setSidebarHidden(media.matches);
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  const [sidebarWidth, setSidebarWidth] = useState(232);
  const [filesWidth, setFilesWidth] = useState(330);
  const [fontSize, setFontSize] = useState(preference("fontSize", "12"));
  const [compact, setCompact] = useState(
    preference("compact", "false") === "true",
  );
  const openOperation = useCallback((action: string, args: ActionArgs = {}) => {
    setMenu(null);
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
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const openRepository = useCallback(async () => {
    setMenu(null);
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
    async (action: string, args: ActionArgs = {}) => {
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
                ? "Committed. A little progress, saved."
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
      className={`app ${compact ? "compact-mode" : ""} ${sidebarHidden ? "sidebar-hidden" : ""} ${isDesktop ? "desktop" : "browser"}`}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          "--files-width": `${filesWidth}px`,
          "--code-size": `${fontSize}px`,
        } as React.CSSProperties
      }
    >
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
          <ChevronDown size={10} />
          <span>Your workspace</span>
        </div>
        <div className="titlebar-right">
          <span className="local-dot" />
          LOCAL FIRST
          <IconButton label="Keyboard shortcuts" onClick={() => setHelp(true)}>
            <Command size={13} />
          </IconButton>
        </div>
      </div>
      <div className="app-body">
        {!sidebarHidden && (
          <>
            <Sidebar
              projects={projects}
              project={project}
              snapshot={snapshot}
              view={view}
              setView={navigate}
              selectProject={(p) => {
                if (!busy) {
                  setProject(p);
                  navigate("changes");
                }
              }}
              onOpen={() => void openRepository()}
              onAdd={() => setMenu(menu === "add" ? null : "add")}
            />
            <ResizeHandle
              label="Resize sidebar"
              width={sidebarWidth}
              onResize={setSidebarWidth}
              min={200}
              max={310}
            />
          </>
        )}
        {!sidebarHidden && (
          <div
            className="sidebar-scrim"
            onClick={() => setSidebarHidden(true)}
          />
        )}
        <main className="workspace">
          <header className="repo-toolbar">
            <div className="repo-breadcrumb">
              <IconButton
                label={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
                onClick={() => setSidebarHidden(!sidebarHidden)}
              >
                {sidebarHidden ? (
                  <PanelLeftOpen size={17} />
                ) : (
                  <PanelLeftClose size={17} />
                )}
              </IconButton>
              <span className="repo-breadcrumb-icon">
                <FolderGit2 size={19} />
              </span>
              <strong>{project?.name || "Your workspace"}</strong>
              {project && (
                <>
                  <span className="breadcrumb-slash">/</span>
                  <button
                    className="branch-selector"
                    disabled={busy !== ""}
                    onClick={() => setView("branches")}
                  >
                    <GitBranch size={14} />
                    {snapshot?.branch || "Loading…"}
                    <ChevronDown size={13} />
                  </button>
                  {snapshot?.detached && (
                    <Badge tone="amber">Detached HEAD</Badge>
                  )}
                </>
              )}
            </div>
            <div className="sync-actions">
              <button
                className="button toolbar-button"
                disabled={!snapshot?.upstream || !!busy}
                title={
                  !snapshot?.upstream
                    ? "Set an upstream with Push first"
                    : "Pull with fast-forward only"
                }
                onClick={() => quickAction("pull")}
              >
                <ArrowDown size={14} />
                <span>Pull</span>
                {!!snapshot?.behind && <small>{snapshot.behind}</small>}
              </button>
              <button
                className="button toolbar-button push-button"
                disabled={!snapshot || !snapshot.remotes.length || !!busy}
                onClick={() => openOperation("push")}
              >
                <ArrowUp size={14} />
                <span>Push</span>
                {!!snapshot?.ahead && <small>{snapshot.ahead}</small>}
              </button>
              <span className="toolbar-divider" />
              <IconButton
                label="Repository actions"
                disabled={!snapshot || !!busy}
                onClick={() => setMenu(menu === "repo" ? null : "repo")}
              >
                <MoreHorizontal size={20} />
              </IconButton>
            </div>
          </header>
          <div className="workspace-heading">
            <div>
              <h1>
                {project || ["settings", "activity"].includes(view)
                  ? viewLabels[view]
                  : "Good things start here."}
              </h1>
              <p>
                {view === "changes"
                  ? snapshot?.files.length
                    ? `${snapshot.files.length} changed file${snapshot.files.length === 1 ? "" : "s"}. Review and commit your work.`
                    : "Your working tree is clean."
                  : view === "history"
                    ? "Browse commits and inspect changes."
                    : view === "branches"
                      ? "Switch, create, and manage branches."
                      : view === "activity"
                        ? "Everything that happens in your workspace."
                        : view === "settings"
                          ? "Adjust Grove to your preferences."
                          : `Manage your repository’s ${view}.`}
              </p>
            </div>
            <div className="heading-right">
              {project && (
                <>
                  <span className="repository-location" title={project.path}>
                    <span className="tiny-dot" />
                    {isDesktop ? "Local repository" : "Sample repository"}
                  </span>
                  <button
                    className="button subtle"
                    disabled={!!busy}
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={13} className={busy ? "spin" : ""} />
                    <span>{busy ? "Working…" : "Refresh"}</span>
                    <kbd>⌘R</kbd>
                  </button>
                </>
              )}
            </div>
          </div>
          {snapshot?.operation && (
            <div className="operation-banner">
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
          <div className="workspace-content">
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
                <h2>Your next chapter starts here.</h2>
                <p>
                  A calm, considered space for your repositories.
                  <br />
                  Open a project and see the bigger picture.
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
                  draft={
                    drafts[project!.path] || {
                      summary: "",
                      description: "",
                      amend: false,
                    }
                  }
                  onDraftChange={(draft) =>
                    setDrafts((current) => ({
                      ...current,
                      [project!.path]: draft,
                    }))
                  }
                  snapshot={snapshot}
                  selected={selected}
                  onSelect={(path, staged) => setSelected({ path, staged })}
                  busy={!!busy}
                  onAction={(action, files) =>
                    action === "discard" || action === "stash-save"
                      ? openOperation(action, { files })
                      : quickAction(action, { files })
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
                <ResizeHandle
                  label="Resize changed files"
                  width={filesWidth}
                  onResize={setFilesWidth}
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
              />
            )}
          </div>
        </main>
      </div>
      <footer className="statusbar">
        <div>
          <Logo size={13} />
          <span>
            {isDesktop
              ? "Connected to local Git"
              : "Interactive demo · no local files are changed"}
          </span>
          {snapshot && (
            <>
              <span className="footer-separator" />
              <GitBranch size={12} />
              <span>{snapshot.branch}</span>
            </>
          )}
        </div>
        <div>
          {snapshot && (
            <>
              <span>
                {snapshot.files.length
                  ? `${snapshot.files.length} changed`
                  : "Working tree clean"}
              </span>
              <span className="footer-separator" />
              <ArrowUp size={11} />
              {snapshot.ahead}
              <ArrowDown size={11} />
              {snapshot.behind}
              <span className="footer-separator" />
            </>
          )}
          <button disabled={!project} onClick={() => openOperation("command")}>
            <Terminal size={12} />
            Git command<kbd>⌘K</kbd>
          </button>
          <IconButton label="Help and shortcuts" onClick={() => setHelp(true)}>
            <CircleHelp size={13} />
          </IconButton>
        </div>
      </footer>
      {menu && (
        <>
          <div className="menu-dismiss" onClick={() => setMenu(null)} />
          <div
            className={`dropdown-menu ${menu === "add" ? "add-menu" : "repo-menu"}`}
          >
            {menu === "add" ? (
              <>
                <span className="menu-label">YOUR NEXT PROJECT</span>
                <button onClick={() => void openRepository()}>
                  <FolderOpen size={15} />
                  Open repository<kbd>⌘O</kbd>
                </button>
                <button onClick={() => openOperation("clone")}>
                  <Copy size={15} />
                  Clone repository
                </button>
                <button
                  onClick={() => {
                    setMenu(null);
                    quickAction("init");
                  }}
                >
                  <Plus size={15} />
                  Initialize repository
                </button>
              </>
            ) : (
              <>
                <span className="menu-label">REPOSITORY ACTIONS</span>
                <button
                  onClick={() => {
                    setMenu(null);
                    quickAction("fetch");
                  }}
                >
                  <RefreshCw size={15} />
                  Fetch from remote
                </button>
                <div className="menu-rule" />
                <button onClick={() => openOperation("branch-create")}>
                  <GitBranch size={15} />
                  Create branch
                </button>
                <button onClick={() => openOperation("merge")}>
                  <GitMerge size={15} />
                  Merge branch…
                </button>
                <button onClick={() => openOperation("rebase")}>
                  <GitBranch size={15} />
                  Rebase branch…
                </button>
                <div className="menu-rule" />
                <button onClick={() => openOperation("stash-save")}>
                  <Archive size={15} />
                  Stash changes…
                </button>
                <button onClick={() => openOperation("tag-create")}>
                  <Tag size={15} />
                  Create tag…
                </button>
                <div className="menu-rule" />
                <button onClick={() => openOperation("command")}>
                  <Terminal size={15} />
                  Git command<kbd>⌘K</kbd>
                </button>
              </>
            )}
          </div>
        </>
      )}
      {operation && (
        <ActionDialog
          action={operation.action}
          initial={operation.args}
          snapshot={snapshot}
          path={project?.path || ""}
          onClose={closeOperation}
          onSubmit={run}
        />
      )}
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
          title="A few helpful shortcuts"
          subtitle="Less reaching. More making."
          onClose={closeHelp}
        >
          <div className="shortcut-list">
            {[
              ["Open repository", "⌘ O"],
              ["Refresh repository", "⌘ R"],
              ["Find a changed file", "⌘ F"],
              ["Open Git command", "⌘ K"],
              ["Commit from description", "⌘ ↵"],
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
