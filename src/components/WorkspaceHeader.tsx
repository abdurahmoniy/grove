import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  Activity,
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Globe2,
  Layers2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Tag,
  Terminal,
  X,
} from "lucide-react";
import type { ActionArgs, Project, Snapshot } from "../types";
import type { View } from "./Sidebar";
import type { QuickActionPreferences } from "../lib/quickActions";
import ActionMenu from "./ActionMenu";
import { IconButton, Logo, Modal } from "./ui";

interface Props {
  projects: Project[];
  project: Project | null;
  snapshot: Snapshot | null;
  busy: boolean;
  view: View;
  setView: (view: View) => void;
  selectProject: (project: Project) => void;
  onOpen: () => void;
  onOperation: (action: string, args?: ActionArgs) => void;
  onQuickAction: (action: string) => void;
  onRefresh: () => void;
  onHelp: () => void;
  quickActions: QuickActionPreferences;
  syncBranch: string;
  syncHint: string;
  syncDisabledReason: string;
  onDefaultSync: () => void;
}

export default function WorkspaceHeader({
  projects,
  project,
  snapshot,
  busy,
  view,
  setView,
  selectProject,
  onOpen,
  onOperation,
  onQuickAction,
  onRefresh,
  onHelp,
  quickActions,
  syncBranch,
  syncHint,
  syncDisabledReason,
  onDefaultSync,
}: Props) {
  const [picker, setPicker] = useState<"repositories" | "branches" | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [syncMenu, setSyncMenu] = useState<"pull" | "push" | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const hasRemote = !!snapshot?.remotes.length;
  const canSync = !!snapshot && hasRemote && !busy;
  const publish = hasRemote && !snapshot?.upstream;
  const remoteHint = busy
    ? "Wait for the current operation to finish"
    : !snapshot
      ? "Open a repository to sync"
      : !hasRemote
        ? "Add a remote in More → Remotes to sync"
        : "";
  const moreViews = ["tags", "remotes", "activity"];
  const moreLabel =
    view === "tags"
      ? "Tags"
      : view === "remotes"
        ? "Remotes"
        : view === "activity"
          ? "Activity"
          : "More";
  const filteredProjects = projects.filter((item) =>
    `${item.name} ${item.path}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const filteredBranches = (snapshot?.branches || []).filter((item) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const openPicker = (next: "repositories" | "branches") => {
    setQuery("");
    setMoreOpen(false);
    setSyncMenu(null);
    setPicker(next);
  };
  const closePicker = () => setPicker(null);
  const navigate = (next: View) => {
    setMoreOpen(false);
    setSyncMenu(null);
    setView(next);
  };
  const syncOperation = (action: string, args?: ActionArgs) => {
    setSyncMenu(null);
    onOperation(action, args);
  };
  const syncDefault = () => {
    setSyncMenu(null);
    setMoreOpen(false);
    onDefaultSync();
  };
  const handlePickerKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      pickerRef.current?.querySelectorAll<HTMLButtonElement>(
        ".picker-item:not(:disabled)",
      ) || [],
    );
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0 && document.activeElement !== searchRef.current) return;
    event.preventDefault();
    const next = current + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) searchRef.current?.focus();
    else items[Math.min(next, items.length - 1)]?.focus();
  };

  return (
    <header className="workspace-header">
      <div className="workspace-masthead">
        <div className="workspace-identity">
          <span className="workspace-brand" aria-label="Grove">
            <Logo size={24} />
            <span>grove</span>
          </span>
          <span className="workspace-separator" aria-hidden="true" />
          <button
            type="button"
            className="repository-switcher"
            disabled={busy}
            aria-label={`Switch repository${project ? `, current repository ${project.name}` : ""}`}
            aria-haspopup="dialog"
            aria-expanded={picker === "repositories"}
            title={project?.path || "Open or choose a repository"}
            onClick={() => openPicker("repositories")}
          >
            <FolderGit2 size={18} aria-hidden="true" />
            <strong>{project?.name || "Choose repository"}</strong>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {project && (
            <button
              type="button"
              className={`workspace-branch ${snapshot?.detached ? "detached" : ""}`}
              disabled={!snapshot || busy}
              aria-haspopup="dialog"
              aria-expanded={picker === "branches"}
              aria-label={`Switch branch${snapshot ? `, current ${snapshot.detached ? "detached HEAD at " : ""}${snapshot.branch}` : ""}`}
              title={
                snapshot?.detached
                  ? `Detached HEAD at ${snapshot.branch}`
                  : snapshot?.branch || "Loading branches"
              }
              onClick={() => openPicker("branches")}
            >
              <GitBranch size={15} aria-hidden="true" />
              <span>
                {snapshot?.detached
                  ? "Detached HEAD"
                  : snapshot?.branch || "Loading…"}
              </span>
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="workspace-sync" aria-label="Sync repository">
          {quickActions.visible.fetch && (
            <button
              type="button"
              className="button toolbar-button fetch-button"
              disabled={!canSync}
              title={remoteHint || "Check for new commits on your remotes"}
              onClick={() => onQuickAction("fetch")}
            >
              <RefreshCw size={15} aria-hidden="true" />
              <span>Fetch</span>
            </button>
          )}
          {quickActions.visible.pull && (
            <div className="sync-button-group sync-pull-group">
              <button
                type="button"
                className="button toolbar-button"
                disabled={
                  !canSync ||
                  !snapshot?.upstream ||
                  !!snapshot?.detached ||
                  !!snapshot?.operation
                }
                title={
                  remoteHint ||
                  (!snapshot?.upstream
                    ? "Choose Pull from… using the arrow beside Pull"
                    : "Pull commits with fast-forward only")
                }
                aria-label={`Pull${snapshot?.behind ? ` ${snapshot.behind} incoming commits` : " commits"}`}
                onClick={() => onQuickAction("pull")}
              >
                <ArrowDown size={15} aria-hidden="true" />
                <span>Pull</span>
                {!!snapshot?.behind && <small>{snapshot.behind}</small>}
              </button>
              <button
                type="button"
                className="button toolbar-button sync-options-button"
                disabled={!snapshot || busy}
                aria-label="Pull options"
                title="Pull from another branch or sync with your default branch"
                aria-haspopup="menu"
                aria-expanded={syncMenu === "pull"}
                aria-controls={
                  syncMenu === "pull" ? "grove-action-menu" : undefined
                }
                onClick={() => {
                  setMoreOpen(false);
                  setSyncMenu(syncMenu === "pull" ? null : "pull");
                }}
              >
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          )}
          {quickActions.visible.push && (
            <div className="sync-button-group sync-push-group">
              <button
                type="button"
                className="button toolbar-button push-button"
                disabled={
                  !canSync || !!snapshot?.detached || !!snapshot?.operation
                }
                title={
                  remoteHint ||
                  (snapshot?.detached
                    ? "Switch to a branch before pushing"
                    : publish
                      ? "Push this branch and set its upstream"
                      : "Push local commits to the remote")
                }
                aria-label={
                  publish
                    ? "Publish branch"
                    : `Push${snapshot?.ahead ? ` ${snapshot.ahead} outgoing commits` : " commits"}`
                }
                onClick={() =>
                  onOperation(
                    "push",
                    publish ? { setUpstream: true } : undefined,
                  )
                }
              >
                <ArrowUp size={15} aria-hidden="true" />
                <span>{publish ? "Publish" : "Push"}</span>
                {!!snapshot?.ahead && <small>{snapshot.ahead}</small>}
              </button>
              <button
                type="button"
                className="button toolbar-button sync-options-button"
                disabled={!snapshot || busy}
                aria-label="Push options"
                title="Push to another branch, merge, and rebase"
                aria-haspopup="menu"
                aria-expanded={syncMenu === "push"}
                aria-controls={
                  syncMenu === "push" ? "grove-action-menu" : undefined
                }
                onClick={() => {
                  setMoreOpen(false);
                  setSyncMenu(syncMenu === "push" ? null : "push");
                }}
              >
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          )}
          {quickActions.visible.sync && (
            <button
              type="button"
              className="button toolbar-button default-sync-button"
              disabled={!!syncDisabledReason}
              aria-label={`Sync with ${syncBranch || "default branch"}`}
              title={syncDisabledReason || syncHint}
              onClick={syncDefault}
            >
              <RefreshCw size={15} aria-hidden="true" />
              <span>
                Sync with <strong>{syncBranch || "default branch"}</strong>
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="workspace-navigation">
        <nav className="workspace-tabs" aria-label="Repository views">
          {[
            {
              id: "changes",
              label: "Changes",
              icon: Layers2,
              count: snapshot?.files.length,
            },
            { id: "history", label: "History", icon: GitCommitHorizontal },
            { id: "branches", label: "Branches", icon: GitBranch },
            {
              id: "stashes",
              label: "Stashes",
              icon: Archive,
              count: snapshot?.stashes.length,
            },
          ].map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? "active" : ""}
              aria-current={view === item.id ? "page" : undefined}
              disabled={!project}
              onClick={() => navigate(item.id as View)}
            >
              <item.icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
              {!!item.count && (
                <span className="workspace-tab-count">{item.count}</span>
              )}
            </button>
          ))}
          <button
            type="button"
            className={moreViews.includes(view) ? "active" : ""}
            aria-current={moreViews.includes(view) ? "page" : undefined}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-controls={moreOpen ? "grove-action-menu" : undefined}
            onClick={() => {
              setSyncMenu(null);
              setMoreOpen(!moreOpen);
            }}
          >
            <MoreHorizontal size={17} aria-hidden="true" />
            <span>{moreLabel}</span>
            <ChevronDown size={12} aria-hidden="true" />
          </button>
        </nav>
        <div className="workspace-utilities">
          <IconButton
            label="Refresh repository"
            title="Refresh repository (⌘R / Ctrl+R)"
            disabled={!project || busy}
            onClick={onRefresh}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="Preferences"
            className={view === "settings" ? "active" : ""}
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Help and keyboard shortcuts" onClick={onHelp}>
            <CircleHelp size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      {syncMenu === "pull" && (
        <ActionMenu label="Pull actions" onClose={() => setSyncMenu(null)}>
          <button
            disabled={!canSync || !!snapshot?.detached || !!snapshot?.operation}
            onClick={() => syncOperation("pull")}
          >
            <ArrowDown size={16} aria-hidden="true" />
            Pull from…
          </button>
          <button
            disabled={!!syncDisabledReason}
            title={syncDisabledReason || syncHint}
            onClick={syncDefault}
          >
            <RefreshCw size={16} aria-hidden="true" />
            <span className="menu-action-label">
              Sync with {syncBranch || "default branch"}
            </span>
          </button>
          <div className="menu-rule" />
          <button onClick={() => navigate("settings")}>
            <Settings2 size={16} aria-hidden="true" />
            Configure quick actions…
          </button>
        </ActionMenu>
      )}
      {syncMenu === "push" && (
        <ActionMenu label="Push actions" onClose={() => setSyncMenu(null)}>
          <button
            disabled={!canSync || !!snapshot?.operation}
            onClick={() => syncOperation("push", { setUpstream: false })}
          >
            <ArrowUp size={16} aria-hidden="true" />
            Push to…
          </button>
          <div className="menu-rule" />
          <button
            disabled={
              !snapshot || busy || !!snapshot.operation || snapshot.detached
            }
            onClick={() => syncOperation("merge")}
          >
            <GitMerge size={16} aria-hidden="true" />
            Merge branch…
          </button>
          <button
            disabled={
              !snapshot || busy || !!snapshot.operation || snapshot.detached
            }
            onClick={() => syncOperation("rebase")}
          >
            <GitPullRequest size={16} aria-hidden="true" />
            Rebase onto…
          </button>
          <div className="menu-rule" />
          <button onClick={() => navigate("remotes")}>
            <Globe2 size={16} aria-hidden="true" />
            Manage remotes
          </button>
          <button onClick={() => navigate("settings")}>
            <Settings2 size={16} aria-hidden="true" />
            Configure quick actions…
          </button>
        </ActionMenu>
      )}
      {moreOpen && (
        <ActionMenu
          label="More repository tools"
          onClose={() => setMoreOpen(false)}
        >
          {!quickActions.visible.fetch && (
            <button
              disabled={!canSync}
              onClick={() => {
                setMoreOpen(false);
                onQuickAction("fetch");
              }}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Fetch
            </button>
          )}
          {!quickActions.visible.pull && (
            <button
              disabled={
                !canSync || !!snapshot?.detached || !!snapshot?.operation
              }
              onClick={() => {
                setMoreOpen(false);
                onOperation("pull");
              }}
            >
              <ArrowDown size={16} aria-hidden="true" />
              Pull from…
            </button>
          )}
          {!quickActions.visible.push && (
            <button
              disabled={!canSync || !!snapshot?.operation}
              onClick={() => {
                setMoreOpen(false);
                onOperation("push", { setUpstream: false });
              }}
            >
              <ArrowUp size={16} aria-hidden="true" />
              Push to…
            </button>
          )}
          {!quickActions.visible.sync && (
            <button
              disabled={!!syncDisabledReason}
              title={syncDisabledReason || syncHint}
              onClick={syncDefault}
            >
              <RefreshCw size={16} aria-hidden="true" />
              <span className="menu-action-label">
                Sync with {syncBranch || "default branch"}
              </span>
            </button>
          )}
          <button onClick={() => navigate("settings")}>
            <Settings2 size={16} aria-hidden="true" />
            Configure quick actions…
          </button>
          <div className="menu-rule" />
          <button
            disabled={!project}
            aria-current={view === "tags" ? "page" : undefined}
            onClick={() => navigate("tags")}
          >
            <Tag size={16} aria-hidden="true" />
            Tags
          </button>
          <button
            disabled={!project}
            aria-current={view === "remotes" ? "page" : undefined}
            onClick={() => navigate("remotes")}
          >
            <Globe2 size={16} aria-hidden="true" />
            Remotes
          </button>
          <button
            aria-current={view === "activity" ? "page" : undefined}
            onClick={() => navigate("activity")}
          >
            <Activity size={16} aria-hidden="true" />
            Activity log
          </button>
          <div className="menu-rule" />
          <button
            disabled={!snapshot || busy}
            onClick={() => {
              setMoreOpen(false);
              onOperation("command");
            }}
          >
            <Terminal size={16} aria-hidden="true" />
            Git command<kbd>⌘K</kbd>
          </button>
        </ActionMenu>
      )}
      {picker && (
        <Modal
          title={
            picker === "repositories" ? "Switch repository" : "Switch branch"
          }
          onClose={closePicker}
        >
          <div
            className="workspace-picker"
            ref={pickerRef}
            onKeyDown={handlePickerKeys}
          >
            <div className="picker-search">
              <Search size={17} aria-hidden="true" />
              <input
                ref={searchRef}
                aria-label={
                  picker === "repositories"
                    ? "Search repositories"
                    : "Search branches"
                }
                placeholder={
                  picker === "repositories"
                    ? "Search repositories…"
                    : "Search branches…"
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                spellCheck={false}
              />
              {query && (
                <IconButton
                  label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                >
                  <X size={15} aria-hidden="true" />
                </IconButton>
              )}
            </div>
            <div className="picker-list">
              {picker === "repositories" ? (
                <>
                  <p className="picker-section-label">Your repositories</p>
                  {filteredProjects.map((item) => (
                    <button
                      type="button"
                      key={item.path}
                      className={`picker-item ${project?.path === item.path ? "selected" : ""}`}
                      disabled={busy}
                      aria-current={
                        project?.path === item.path ? true : undefined
                      }
                      title={item.path}
                      onClick={() => {
                        closePicker();
                        if (project?.path !== item.path) selectProject(item);
                      }}
                    >
                      <FolderGit2 size={20} aria-hidden="true" />
                      <span className="picker-item-copy">
                        <strong>{item.name}</strong>
                        <span>{item.path}</span>
                      </span>
                      {project?.path === item.path && (
                        <Check size={17} aria-label="Current repository" />
                      )}
                    </button>
                  ))}
                  {!filteredProjects.length && (
                    <p className="picker-empty" role="status">
                      {projects.length
                        ? "No repositories match your search."
                        : "Open a repository to get started."}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {[false, true].map((remote) => {
                    const branches = filteredBranches.filter(
                      (item) => item.remote === remote,
                    );
                    return branches.length ? (
                      <div key={String(remote)}>
                        <p className="picker-section-label">
                          {remote ? "Remote branches" : "Local branches"}
                        </p>
                        {branches.map((item) => (
                          <button
                            type="button"
                            key={item.name}
                            className={`picker-item ${item.current ? "selected" : ""}`}
                            disabled={busy}
                            aria-current={item.current ? true : undefined}
                            title={item.name}
                            onClick={() => {
                              closePicker();
                              if (!item.current)
                                onOperation("checkout", { ref: item.name });
                            }}
                          >
                            {remote ? (
                              <Globe2 size={18} aria-hidden="true" />
                            ) : (
                              <GitBranch size={18} aria-hidden="true" />
                            )}
                            <span className="picker-item-copy">
                              <strong>{item.name}</strong>
                              <span>
                                {item.current
                                  ? "Current branch"
                                  : item.hash.slice(0, 7)}
                              </span>
                            </span>
                            {item.current && (
                              <Check size={17} aria-hidden="true" />
                            )}
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })}
                  {!filteredBranches.length && (
                    <p className="picker-empty" role="status">
                      {query
                        ? "No branches match your search."
                        : "Branches appear after your first commit."}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="picker-footer">
              {picker === "repositories" ? (
                <>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => {
                      closePicker();
                      onOpen();
                    }}
                  >
                    <FolderOpen size={16} aria-hidden="true" />
                    Open repository
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      closePicker();
                      onOperation("clone");
                    }}
                  >
                    <Copy size={15} aria-hidden="true" />
                    Clone
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      closePicker();
                      onQuickAction("init");
                    }}
                  >
                    <Plus size={16} aria-hidden="true" />
                    New
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="button primary"
                    disabled={!snapshot || busy}
                    onClick={() => {
                      closePicker();
                      onOperation("branch-create");
                    }}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Create branch
                  </button>
                  <button
                    className="button"
                    onClick={() => {
                      closePicker();
                      setView("branches");
                    }}
                  >
                    Manage branches
                  </button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </header>
  );
}
