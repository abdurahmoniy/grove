import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Search,
  GitCommitHorizontal,
  Archive,
  CornerDownLeft,
  Check,
  Undo2,
} from "lucide-react";
import type { FileChange, Snapshot } from "../types";
import { FileIcon, IconButton, StatusMark } from "./ui";
export const isStaged = (f: FileChange) => f.index !== " " && f.index !== "?";
export const isUnstaged = (f: FileChange) => f.worktree !== " ";
export const isConflict = (f: FileChange) =>
  f.index === "U" ||
  f.worktree === "U" ||
  ["AA", "DD"].includes(f.index + f.worktree);
export interface CommitDraft {
  summary: string;
  description: string;
  amend: boolean;
}
interface Props {
  snapshot: Snapshot;
  selected: { path: string; staged: boolean } | null;
  onSelect: (path: string, staged: boolean) => void;
  onAction: (action: string, files?: string[]) => void;
  onCommit: (message: string, amend: boolean) => Promise<boolean>;
  busy: boolean;
  draft: CommitDraft;
  onDraftChange: (draft: CommitDraft) => void;
}
export default function Changes({
  snapshot,
  selected,
  onSelect,
  onAction,
  onCommit,
  busy,
  draft,
  onDraftChange,
}: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState({
    staged: false,
    unstaged: false,
  });
  const { summary, description, amend } = draft;
  const setSummary = (summary: string) => onDraftChange({ ...draft, summary });
  const setDescription = (description: string) =>
    onDraftChange({ ...draft, description });
  const setAmend = (amend: boolean) => onDraftChange({ ...draft, amend });
  const staged = snapshot.files.filter(isStaged);
  const unstaged = snapshot.files.filter(isUnstaged);
  const submit = async () => {
    if (!summary.trim() || busy || (!staged.length && !amend)) return;
    if (
      await onCommit([summary, description].filter(Boolean).join("\n\n"), amend)
    )
      onDraftChange({ summary: "", description: "", amend: false });
  };
  return (
    <section className="changes-panel" aria-label="Changed files">
      <div className="file-search">
        <Search size={15} />
        <input
          aria-label="Filter changed files"
          placeholder="Filter files…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <kbd>⌘F</kbd>
      </div>
      <div className="file-groups">
        {(
          [
            {
              id: "unstaged",
              label: "Unstaged changes",
              files: unstaged,
              stage: false,
            },
            {
              id: "staged",
              label: "Staged changes",
              files: staged,
              stage: true,
            },
          ] as const
        ).map((group) => (
          <div key={group.id} className="file-group">
            <div className="file-group-heading">
              <button
                onClick={() =>
                  setCollapsed({
                    ...collapsed,
                    [group.id]: !collapsed[group.id],
                  })
                }
                aria-expanded={!collapsed[group.id]}
              >
                {collapsed[group.id] ? (
                  <ChevronRight size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
                <strong>{group.label}</strong>
                <span>{group.files.length}</span>
              </button>
              <button
                disabled={!group.files.length || busy}
                className="text-button"
                onClick={() =>
                  onAction(
                    group.stage ? "unstage" : "stage",
                    group.files.map((f) => f.path),
                  )
                }
              >
                {group.stage ? <Minus size={12} /> : <Plus size={12} />}
                {group.stage ? "Unstage all" : "Stage all"}
              </button>
            </div>
            {!collapsed[group.id] && (
              <div>
                {group.files
                  .filter((f) =>
                    f.path.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((f) => (
                    <div
                      className={`file-row ${selected?.path === f.path && selected.staged === group.stage ? "selected" : ""}`}
                      key={f.path}
                    >
                      <button
                        className="file-select"
                        onClick={() => onSelect(f.path, group.stage)}
                      >
                        <FileIcon path={f.path} />
                        <span className="file-row-name">
                          <span>{f.path.split("/").pop()}</span>
                          <small>
                            {f.path.includes("/")
                              ? f.path.slice(0, f.path.lastIndexOf("/"))
                              : "Repository root"}
                          </small>
                        </span>
                        <StatusMark
                          status={
                            isConflict(f)
                              ? "U"
                              : group.stage
                                ? f.index
                                : f.worktree
                          }
                        />
                      </button>
                      <div className="file-row-actions">
                        {!group.stage && (
                          <IconButton
                            disabled={busy}
                            label={`Discard ${f.path}`}
                            onClick={() => onAction("discard", [f.path])}
                          >
                            <Undo2 size={13} />
                          </IconButton>
                        )}
                        <IconButton
                          disabled={busy}
                          label={`${group.stage ? "Unstage" : "Stage"} ${f.path}`}
                          onClick={() =>
                            onAction(group.stage ? "unstage" : "stage", [
                              f.path,
                            ])
                          }
                        >
                          {group.stage ? (
                            <Minus size={13} />
                          ) : (
                            <Plus size={13} />
                          )}
                        </IconButton>
                      </div>
                    </div>
                  ))}
                {!group.files.length && (
                  <p className="group-empty">
                    {group.stage
                      ? "Stage changes to include in your commit."
                      : "All caught up. A clean working tree."}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="commit-composer">
        <div className="composer-heading">
          <GitCommitHorizontal size={17} />
          <strong>Commit</strong>
          <span>{staged.length} staged</span>
        </div>
        <div className="commit-fields">
          <input
            aria-label="Commit summary"
            placeholder="Commit message"
            value={summary}
            maxLength={500}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <details
          className="commit-options"
          open={description || amend ? true : undefined}
        >
          <summary>
            Commit options <ChevronDown size={13} />
          </summary>
          <textarea
            aria-label="Commit description"
            placeholder="Add a description… (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="composer-hint">
            <span>Summary length</span>
            <span className={summary.length > 72 ? "warning-text" : ""}>
              {summary.length}/72
            </span>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={amend}
              onChange={(e) => setAmend(e.target.checked)}
            />
            Amend previous commit
          </label>
          <button
            className="stash-shortcut"
            disabled={busy || !snapshot.files.length}
            onClick={() => onAction("stash-save")}
          >
            <Archive size={13} />
            Not ready? Stash your changes
          </button>
        </details>
        <button
          className="button primary commit-button"
          disabled={busy || !summary.trim() || (!staged.length && !amend)}
          onClick={() => void submit()}
        >
          <Check size={16} />
          <span>
            {amend
              ? "Amend last commit"
              : `Commit ${staged.length ? `${staged.length} file${staged.length === 1 ? "" : "s"}` : "changes"}`}
          </span>
          <kbd>
            ⌘<CornerDownLeft size={10} />
          </kbd>
        </button>
      </div>
    </section>
  );
}
