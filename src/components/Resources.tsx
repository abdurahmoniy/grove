import { useState } from "react";
import {
  GitBranch,
  Plus,
  Pencil,
  Trash2,
  GitMerge,
  GitPullRequest,
  Archive,
  Download,
  Tag,
  Globe2,
  Check,
  Terminal,
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import type { ActionArgs, Snapshot, Project } from "../types";
import type { View } from "./Sidebar";
import type {
  QuickActionPreferences,
  RepositorySyncPreferences,
} from "../lib/quickActions";
import QuickActionSettings from "./QuickActionSettings";
import { Badge, EmptyState, IconButton, timeAgo } from "./ui";
export interface ActivityEntry {
  id: number;
  action: string;
  output: string;
  error: boolean;
  date: string;
  repository: string;
}
export default function Resources({
  view,
  snapshot,
  onOperation,
  activity,
  projects,
  onForget,
  onPreference,
  fontSize,
  compact,
  project,
  quickActions,
  syncTarget,
  onQuickActionsChange,
  onSyncTargetChange,
}: {
  view: View;
  snapshot: Snapshot | null;
  onOperation: (action: string, args?: ActionArgs) => void;
  activity: ActivityEntry[];
  projects: Project[];
  onForget: (path: string) => void;
  onPreference: (key: string, value: string | boolean) => void;
  fontSize: string;
  compact: boolean;
  project: Project | null;
  quickActions: QuickActionPreferences;
  syncTarget: RepositorySyncPreferences;
  onQuickActionsChange: (next: QuickActionPreferences) => void;
  onSyncTargetChange: (next: RepositorySyncPreferences) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (view === "activity")
    return (
      <div className="resource-page activity-page">
        <div className="resource-intro">
          <h2>A little history of your actions</h2>
          <p>
            Git output, operation details, and anything that needs your
            attention.
          </p>
        </div>
        {!activity.length ? (
          <EmptyState
            title="A quiet start"
            description="Your Git operations and their output will appear here."
          />
        ) : (
          <div className="activity-list">
            {activity.map((entry) => (
              <div
                className={`activity-entry ${entry.error ? "failed" : ""}`}
                key={entry.id}
              >
                <button
                  onClick={() =>
                    setExpanded(expanded === entry.id ? null : entry.id)
                  }
                >
                  <span className="activity-icon">
                    {entry.error ? "!" : <Check size={16} />}
                  </span>
                  <span>
                    <strong>{entry.action.replaceAll("-", " ")}</strong>
                    <small>{entry.repository}</small>
                  </span>
                  <Badge tone={entry.error ? "red" : "green"}>
                    {entry.error ? "Failed" : "Completed"}
                  </Badge>
                  <time>{timeAgo(entry.date)}</time>
                </button>
                {expanded === entry.id && (
                  <pre>{entry.output || "Completed successfully."}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  if (view === "settings")
    return (
      <div className="resource-page preferences">
        <div className="resource-intro">
          <h2>Workspace preferences</h2>
          <p>
            Customize quick actions, sync defaults, and your review workspace.
          </p>
        </div>
        <QuickActionSettings
          key={project?.path || "no-repository"}
          snapshot={snapshot}
          project={project}
          preferences={quickActions}
          target={syncTarget}
          onPreferencesChange={onQuickActionsChange}
          onTargetChange={onSyncTargetChange}
        />
        <section className="settings-section">
          <h3>Appearance</h3>
          <div className="setting-row">
            <div>
              <strong>Code font size</strong>
              <p>Applies to unified and split diffs.</p>
            </div>
            <select
              aria-label="Code font size"
              value={fontSize}
              onChange={(e) => onPreference("fontSize", e.target.value)}
            >
              <option value="11">Small · 11 px</option>
              <option value="12">Medium · 12 px</option>
              <option value="13">Default · 13 px</option>
              <option value="14">Large · 14 px</option>
              <option value="16">Extra large · 16 px</option>
            </select>
          </div>
          <div className="setting-row">
            <div>
              <strong>Compact file list</strong>
              <p>Show more files in the same space.</p>
            </div>
            <label className="switch">
              <input
                aria-label="Compact file list"
                type="checkbox"
                checked={compact}
                onChange={(e) => onPreference("compact", e.target.checked)}
              />
              <span />
            </label>
          </div>
        </section>
        <section className="settings-section">
          <h3>Commit identity</h3>
          <div className="setting-row">
            <div>
              <strong>{snapshot?.user.name || "No name configured"}</strong>
              <p>
                {snapshot?.user.email ||
                  "Configure a Git name and email before committing."}
              </p>
            </div>
            <button
              className="button"
              disabled={!snapshot}
              onClick={() => onOperation("command")}
            >
              <Terminal size={14} />
              Git configuration
            </button>
          </div>
          <p className="settings-help">
            Grove uses your existing Git identity, SSH keys, and credential
            helper. You can configure a repository with{" "}
            <code>git config user.name "Your name"</code> and{" "}
            <code>git config user.email "you@example.com"</code>.
          </p>
        </section>
        <section className="settings-section">
          <h3>Recent repositories</h3>
          {projects.map((project) => (
            <div className="setting-row" key={project.path}>
              <div>
                <strong>{project.name}</strong>
                <p>{project.path}</p>
              </div>
              <button className="button" onClick={() => onForget(project.path)}>
                Remove from list
              </button>
            </div>
          ))}
        </section>
        <div className="about-grove">
          <strong>grove.</strong>
          <span>Version 1.0.0</span>
          <span>Built for the work in progress.</span>
        </div>
      </div>
    );
  if (!snapshot)
    return (
      <EmptyState
        title="Open a repository"
        description="Your branches, remotes, tags, and stashes will appear here."
      />
    );
  const addAction =
    view === "branches"
      ? "branch-create"
      : view === "stashes"
        ? "stash-save"
        : view === "tags"
          ? "tag-create"
          : "remote-add";
  const items =
    view === "branches"
      ? snapshot.branches
      : view === "stashes"
        ? snapshot.stashes
        : view === "tags"
          ? snapshot.tags
          : snapshot.remotes;
  return (
    <div className="resource-page">
      <div className="resource-intro with-action">
        <div>
          <h2>
            {view === "branches"
              ? "Room for your next idea"
              : view === "stashes"
                ? "Pick up where you left off"
                : view === "tags"
                  ? "Milestones worth keeping"
                  : "Stay connected"}
          </h2>
          <p>
            {view === "branches"
              ? "Explore, switch, and bring your work together."
              : view === "stashes"
                ? "Your saved work, ready when you are."
                : view === "tags"
                  ? "Named points in your project’s history."
                  : "The places your repository calls home."}
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => onOperation(addAction)}
        >
          <Plus size={15} />
          {view === "branches"
            ? "New branch"
            : view === "stashes"
              ? "Save stash"
              : view === "tags"
                ? "New tag"
                : "Add remote"}
        </button>
      </div>
      {!items.length ? (
        <EmptyState
          title={`No ${view} yet`}
          description="Create one using the button above."
        />
      ) : (
        <div className="resource-list">
          {view === "branches" &&
            snapshot.branches.map((b) => (
              <div className="resource-row" key={b.name}>
                <div className={`resource-icon ${b.current ? "green" : ""}`}>
                  <GitBranch size={20} />
                </div>
                <div className="resource-name">
                  <strong>
                    {b.name}
                    {b.current && <Badge tone="green">Current</Badge>}
                    {b.remote && <Badge>Remote</Badge>}
                  </strong>
                  <code>{b.hash.slice(0, 7)}</code>
                </div>
                <div className="resource-actions">
                  {b.remote ? (
                    <button
                      type="button"
                      className="button small"
                      disabled={
                        snapshot.detached ||
                        !!snapshot.operation ||
                        !snapshot.remotes.some((remote) =>
                          b.name.startsWith(`${remote.name}/`),
                        )
                      }
                      aria-label={`Pull from ${b.name} into ${snapshot.branch}`}
                      onClick={() => {
                        const remote = [...snapshot.remotes]
                          .sort((a, b) => b.name.length - a.name.length)
                          .find((remote) =>
                            b.name.startsWith(`${remote.name}/`),
                          );
                        if (remote)
                          onOperation("pull", {
                            remote: remote.name,
                            remoteBranch: b.name.slice(remote.name.length + 1),
                          });
                      }}
                    >
                      <ArrowDown size={13} aria-hidden="true" />
                      Pull…
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button small"
                      disabled={
                        !snapshot.remotes.length || !!snapshot.operation
                      }
                      aria-label={`Push ${b.name} to a remote branch`}
                      onClick={() =>
                        onOperation("push", {
                          localBranch: b.name,
                          setUpstream: false,
                        })
                      }
                    >
                      <ArrowUp size={13} aria-hidden="true" />
                      Push…
                    </button>
                  )}
                  {!b.current && (
                    <button
                      className="button small"
                      onClick={() => onOperation("checkout", { ref: b.name })}
                    >
                      Switch
                      <ArrowUpRight size={12} />
                    </button>
                  )}
                  {!b.current && (
                    <IconButton
                      label={`Merge ${b.name}`}
                      onClick={() => onOperation("merge", { ref: b.name })}
                    >
                      <GitMerge size={16} />
                    </IconButton>
                  )}
                  {!b.current && (
                    <IconButton
                      label={`Rebase onto ${b.name}`}
                      onClick={() => onOperation("rebase", { ref: b.name })}
                    >
                      <GitPullRequest size={16} />
                    </IconButton>
                  )}
                  {!b.remote && (
                    <IconButton
                      label={`Rename ${b.name}`}
                      onClick={() =>
                        onOperation("branch-rename", { name: b.name })
                      }
                    >
                      <Pencil size={15} />
                    </IconButton>
                  )}
                  {!b.current && !b.remote && (
                    <IconButton
                      label={`Delete ${b.name}`}
                      onClick={() =>
                        onOperation("branch-delete", { name: b.name })
                      }
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  )}
                </div>
              </div>
            ))}
          {view === "stashes" &&
            snapshot.stashes.map((stash) => (
              <div className="resource-row" key={stash.ref}>
                <div className="resource-icon amber">
                  <Archive size={20} />
                </div>
                <div className="resource-name">
                  <strong>{stash.message}</strong>
                  <code>{stash.ref}</code>
                </div>
                <div className="resource-actions">
                  <button
                    className="button small"
                    onClick={() =>
                      onOperation("stash-inspect", { ref: stash.ref })
                    }
                  >
                    Inspect
                  </button>
                  <button
                    className="button small"
                    onClick={() =>
                      onOperation("stash-apply", { ref: stash.ref })
                    }
                  >
                    <Download size={13} />
                    Apply
                  </button>
                  <button
                    className="button small"
                    onClick={() => onOperation("stash-pop", { ref: stash.ref })}
                  >
                    Pop
                  </button>
                  <IconButton
                    label={`Delete ${stash.ref}`}
                    onClick={() =>
                      onOperation("stash-drop", { ref: stash.ref })
                    }
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>
            ))}
          {view === "tags" &&
            snapshot.tags.map((tag) => (
              <div className="resource-row" key={tag}>
                <div className="resource-icon purple">
                  <Tag size={20} />
                </div>
                <div className="resource-name">
                  <strong>{tag}</strong>
                  <small>Local tag</small>
                </div>
                <div className="resource-actions">
                  <button
                    className="button small"
                    onClick={() => onOperation("checkout", { ref: tag })}
                  >
                    Check out
                  </button>
                  <IconButton
                    label={`Delete ${tag}`}
                    onClick={() => onOperation("tag-delete", { name: tag })}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>
            ))}
          {view === "remotes" &&
            snapshot.remotes.map((remote) => (
              <div className="resource-row" key={remote.name}>
                <div className="resource-icon blue">
                  <Globe2 size={20} />
                </div>
                <div className="resource-name">
                  <strong>{remote.name}</strong>
                  <code>{remote.url}</code>
                </div>
                <div className="resource-actions">
                  <button
                    className="button small"
                    onClick={() => onOperation("push", { remote: remote.name })}
                  >
                    Push
                  </button>
                  <IconButton
                    label={`Remove ${remote.name}`}
                    onClick={() =>
                      onOperation("remote-remove", { name: remote.name })
                    }
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
