import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Search,
  Check,
  Undo2,
  X,
} from "lucide-react";
import type { FileChange, Snapshot } from "../types";
import { FileIcon, IconButton, StatusMark } from "./ui";
export type { CommitDraft } from "./CommitComposer";

export const isStaged = (f: FileChange) => f.index !== " " && f.index !== "?";
export const isUnstaged = (f: FileChange) => f.worktree !== " ";
export const isConflict = (f: FileChange) =>
  f.index === "U" ||
  f.worktree === "U" ||
  ["AA", "DD"].includes(f.index + f.worktree);

const statusLabels: Record<string, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  R: "Renamed",
  C: "Copied",
  T: "File type changed",
  U: "Conflict",
  "?": "Untracked",
  "!": "Ignored",
};

interface PendingStageFocus {
  path: string;
  staged: boolean;
  source: HTMLInputElement;
  index: number;
  snapshot: Snapshot;
  waited: boolean;
}

interface Props {
  snapshot: Snapshot;
  selected: { path: string; staged: boolean } | null;
  onSelect: (path: string, staged: boolean) => void;
  onAction: (action: string, files?: string[]) => void;
  busy: boolean;
}

export default function Changes({
  snapshot,
  selected,
  onSelect,
  onAction,
  busy,
}: Props) {
  const fieldId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLDivElement>(null);
  const pendingStageFocus = useRef<PendingStageFocus | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState({
    staged: false,
    unstaged: false,
  });
  const staged = snapshot.files.filter(isStaged);
  const unstaged = snapshot.files.filter(isUnstaged);
  const query = search.trim().toLowerCase();
  const matchesSearch = (file: FileChange) =>
    file.path.toLowerCase().includes(query);
  const matchingCount = snapshot.files.filter(matchesSearch).length;

  useEffect(() => {
    const cancelOnPointer = () => {
      pendingStageFocus.current = null;
    };
    const cancelOnFocusMove = (event: FocusEvent) => {
      const pending = pendingStageFocus.current;
      if (
        pending &&
        event.target !== pending.source &&
        event.target !== document.body
      ) {
        pendingStageFocus.current = null;
      }
    };
    document.addEventListener("pointerdown", cancelOnPointer, true);
    document.addEventListener("focusin", cancelOnFocusMove);
    return () => {
      document.removeEventListener("pointerdown", cancelOnPointer, true);
      document.removeEventListener("focusin", cancelOnFocusMove);
    };
  }, []);

  useLayoutEffect(() => {
    const pending = pendingStageFocus.current;
    if (!pending) return;
    if (pending.snapshot.root !== snapshot.root) {
      pendingStageFocus.current = null;
      return;
    }
    if (busy) {
      pending.waited = true;
      return;
    }
    if (!pending.waited && pending.snapshot === snapshot) return;
    if (
      document.activeElement !== document.body &&
      document.activeElement !== pending.source
    ) {
      pendingStageFocus.current = null;
      return;
    }
    const checkboxes = Array.from(
      filesRef.current?.querySelectorAll<HTMLInputElement>(
        ".file-stage-checkbox input",
      ) || [],
    );
    const destination = checkboxes.find(
      (checkbox) =>
        checkbox.dataset.path === pending.path &&
        checkbox.checked !== pending.staged,
    );
    const original = checkboxes.find(
      (checkbox) =>
        checkbox.dataset.path === pending.path &&
        checkbox.checked === pending.staged,
    );
    const visible = checkboxes.filter(
      (checkbox) => !checkbox.closest("[hidden]"),
    );
    const target =
      destination ||
      original ||
      visible[Math.min(pending.index, visible.length - 1)] ||
      checkboxes[0];
    if (target?.closest("[hidden]")) {
      setCollapsed((current) => ({
        ...current,
        [target.checked ? "staged" : "unstaged"]: false,
      }));
      return;
    }
    pendingStageFocus.current = null;
    (target || searchRef.current)?.focus();
  }, [busy, snapshot, collapsed]);

  const navigateFiles = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
      return;
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      filesRef.current?.querySelectorAll<HTMLButtonElement>(".file-select") ||
        [],
    ).filter((button) => !button.closest("[hidden]"));
    const index = buttons.indexOf(event.currentTarget);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : Math.max(
              0,
              Math.min(
                buttons.length - 1,
                index + (event.key === "ArrowDown" ? 1 : -1),
              ),
            );
    event.preventDefault();
    buttons[next]?.focus();
    buttons[next]?.click();
  };

  return (
    <section className="changes-panel" aria-label="Changed files">
      <div className="changes-heading">
        <h2>Changed files</h2>
        <span className="badge">{snapshot.files.length}</span>
      </div>
      <div className="file-search">
        <Search size={15} aria-hidden="true" />
        <input
          ref={searchRef}
          aria-label="Filter changed files"
          placeholder="Filter by name or path…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && search) {
              event.preventDefault();
              setSearch("");
            }
          }}
        />
        {search ? (
          <IconButton
            label="Clear file filter"
            onClick={() => {
              setSearch("");
              searchRef.current?.focus();
            }}
          >
            <X size={14} />
          </IconButton>
        ) : (
          <kbd aria-hidden="true">⌘F</kbd>
        )}
      </div>
      {query && (
        <p className="file-filter-summary" role="status">
          {matchingCount} of {snapshot.files.length} files match
        </p>
      )}
      <div className="file-groups" ref={filesRef}>
        {!snapshot.files.length ? (
          <div className="changes-empty-state" role="status">
            <Check size={22} aria-hidden="true" />
            <strong>No local changes</strong>
            <p>Files you edit will appear here.</p>
          </div>
        ) : (
          (
            [
              {
                id: "unstaged",
                label: "Unstaged",
                files: unstaged,
                stage: false,
              },
              { id: "staged", label: "Staged", files: staged, stage: true },
            ] as const
          ).map((group) => {
            const visibleFiles = group.files.filter(matchesSearch);
            const action = group.stage ? "unstage" : "stage";
            return (
              <div key={group.id} className="file-group">
                <div className="file-group-heading">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((current) => ({
                        ...current,
                        [group.id]: !current[group.id],
                      }))
                    }
                    aria-expanded={!collapsed[group.id]}
                    aria-controls={`${fieldId}-${group.id}`}
                  >
                    {collapsed[group.id] ? (
                      <ChevronRight size={13} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={13} aria-hidden="true" />
                    )}
                    <strong>{group.label}</strong>
                    <span>
                      {query ? visibleFiles.length : group.files.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!visibleFiles.length || busy}
                    className="text-button"
                    onClick={() =>
                      onAction(
                        action,
                        visibleFiles.map((file) => file.path),
                      )
                    }
                  >
                    {group.stage ? (
                      <Minus size={12} aria-hidden="true" />
                    ) : (
                      <Plus size={12} aria-hidden="true" />
                    )}
                    {group.stage ? "Unstage" : "Stage"}{" "}
                    {query ? "filtered" : "all"}
                  </button>
                </div>
                <div id={`${fieldId}-${group.id}`} hidden={collapsed[group.id]}>
                  {visibleFiles.map((file) => {
                    const isSelected =
                      selected?.path === file.path &&
                      selected.staged === group.stage;
                    const status = isConflict(file)
                      ? "U"
                      : group.stage
                        ? file.index
                        : file.worktree;
                    const accessibleName = [
                      file.path,
                      statusLabels[status] || "Changed",
                      file.originalPath ? `from ${file.originalPath}` : "",
                      group.stage ? "staged" : "unstaged",
                    ]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <div
                        className={`file-row ${isSelected ? "selected" : ""}`}
                        key={file.path}
                      >
                        <label
                          className="file-stage-checkbox"
                          title={`${group.stage ? "Unstage" : "Stage"} ${file.path}`}
                        >
                          <input
                            type="checkbox"
                            checked={group.stage}
                            disabled={busy}
                            data-path={file.path}
                            aria-label={`${group.stage ? "Unstage" : "Stage"} ${file.path}`}
                            onClick={(event) => {
                              if (
                                event.detail !== 0 ||
                                document.activeElement !== event.currentTarget
                              )
                                return;
                              const checkboxes = Array.from(
                                filesRef.current?.querySelectorAll<HTMLInputElement>(
                                  ".file-stage-checkbox input",
                                ) || [],
                              ).filter(
                                (checkbox) => !checkbox.closest("[hidden]"),
                              );
                              pendingStageFocus.current = {
                                path: file.path,
                                staged: group.stage,
                                source: event.currentTarget,
                                index: checkboxes.indexOf(event.currentTarget),
                                snapshot,
                                waited: false,
                              };
                            }}
                            onChange={() => onAction(action, [file.path])}
                          />
                        </label>
                        <button
                          type="button"
                          className="file-select"
                          title={
                            file.originalPath
                              ? `${file.originalPath} → ${file.path}`
                              : file.path
                          }
                          aria-label={accessibleName}
                          aria-current={isSelected ? true : undefined}
                          onClick={() => onSelect(file.path, group.stage)}
                          onKeyDown={navigateFiles}
                        >
                          <FileIcon path={file.path} />
                          <span className="file-row-name">
                            <span>{file.path.split("/").pop()}</span>
                            <small>
                              {file.path.includes("/")
                                ? file.path.slice(0, file.path.lastIndexOf("/"))
                                : "Repository root"}
                            </small>
                          </span>
                          <StatusMark status={status} />
                        </button>
                        {!group.stage && (
                          <div className="file-row-actions file-row-actions-visible">
                            <IconButton
                              disabled={busy}
                              label={`Discard ${file.path}`}
                              onClick={() => onAction("discard", [file.path])}
                            >
                              <Undo2 size={14} />
                            </IconButton>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!group.files.length && (
                    <p className="group-empty">
                      {group.stage
                        ? "Check a file to include it in your commit."
                        : "All changes are staged."}
                    </p>
                  )}
                  {!!group.files.length && !visibleFiles.length && (
                    <p className="group-empty file-filter-empty">
                      No {group.stage ? "staged" : "unstaged"} files match.
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {!!snapshot.files.length && (
        <p className="file-list-hint">Check to stage · ↑ ↓ to review</p>
      )}
    </section>
  );
}
