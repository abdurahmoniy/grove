import { useCallback, useId, useState } from "react";
import { AlertTriangle, Terminal, LoaderCircle } from "lucide-react";
import type { ActionArgs, Snapshot } from "../types";
import { errorMessage } from "../api";
import { Modal } from "./ui";
type Field = {
  key: keyof ActionArgs;
  label: string;
  placeholder?: string;
  optional?: boolean;
  multiline?: boolean;
};
type Definition = {
  title: string;
  description: string;
  button: string;
  fields?: Field[];
  destructive?: boolean;
};
const definitions: Record<string, Definition> = {
  "branch-create": {
    title: "Create a branch",
    description:
      "Create a local branch from the current commit and switch to it.",
    button: "Create & switch",
    fields: [
      {
        key: "name",
        label: "Branch name",
        placeholder: "feature/new-navigation",
      },
    ],
  },
  "branch-rename": {
    title: "Rename branch",
    description: "Choose a new name for this local branch.",
    button: "Rename branch",
    fields: [
      { key: "name", label: "Current name" },
      { key: "newName", label: "New name" },
    ],
  },
  "branch-delete": {
    title: "Delete branch",
    description:
      "Deletes the local branch only. Git will refuse if it has unmerged commits.",
    button: "Delete branch",
    fields: [{ key: "name", label: "Branch name" }],
    destructive: true,
  },
  checkout: {
    title: "Switch branch",
    description:
      "Your working tree will switch to this reference. Tags and commits create a detached HEAD.",
    button: "Switch branch",
    fields: [{ key: "ref", label: "Branch or reference" }],
  },
  merge: {
    title: "Merge into current branch",
    description: "Bring another branch’s changes into your current branch.",
    button: "Merge branch",
    fields: [{ key: "ref", label: "Branch to merge", placeholder: "main" }],
  },
  rebase: {
    title: "Rebase current branch",
    description:
      "Replay your commits onto another branch. This rewrites commit history; use on work you haven’t shared.",
    button: "Start rebase",
    fields: [{ key: "ref", label: "Rebase onto", placeholder: "main" }],
    destructive: true,
  },
  "cherry-pick": {
    title: "Cherry-pick commit",
    description: "Apply this commit’s changes to the current branch.",
    button: "Cherry-pick",
    fields: [{ key: "ref", label: "Commit" }],
  },
  revert: {
    title: "Revert commit",
    description:
      "Create a new commit that undoes this commit’s changes, preserving history.",
    button: "Revert commit",
    fields: [{ key: "ref", label: "Commit" }],
  },
  reset: {
    title: "Reset current branch",
    description:
      "Move the current branch to the selected commit. Choose how to handle your changes below.",
    button: "Reset branch",
    fields: [{ key: "ref", label: "Commit or branch", placeholder: "HEAD~1" }],
    destructive: true,
  },
  discard: {
    title: "Discard local changes",
    description:
      "Unstaged edits in the selected files will be lost. Selected untracked files will be deleted. This cannot be undone.",
    button: "Discard changes",
    destructive: true,
  },
  amend: {
    title: "Amend the last commit",
    description:
      "Replace the latest commit with the staged changes and this message. This rewrites that commit’s history.",
    button: "Amend commit",
    fields: [{ key: "message", label: "Commit message", multiline: true }],
    destructive: true,
  },
  "stash-save": {
    title: "Save a stash",
    description: "Save your changes in a stash to restore later.",
    button: "Stash changes",
    fields: [
      {
        key: "message",
        label: "Stash message",
        placeholder: "Describe the changes you are saving",
        optional: true,
      },
    ],
  },
  "stash-apply": {
    title: "Apply stash",
    description: "Restore these changes and keep the saved stash.",
    button: "Apply stash",
    fields: [{ key: "ref", label: "Stash" }],
  },
  "stash-pop": {
    title: "Pop stash",
    description: "Restore these changes and remove the stash when successful.",
    button: "Pop stash",
    fields: [{ key: "ref", label: "Stash" }],
  },
  "stash-drop": {
    title: "Delete stash",
    description: "Permanently remove these saved changes.",
    button: "Delete stash",
    fields: [{ key: "ref", label: "Stash" }],
    destructive: true,
  },
  "tag-create": {
    title: "Create a tag",
    description:
      "Create a local tag. By default, it points to the current commit.",
    button: "Create tag",
    fields: [
      { key: "name", label: "Tag name", placeholder: "v1.3.0" },
      {
        key: "ref",
        label: "Commit or branch",
        placeholder: "HEAD",
        optional: true,
      },
    ],
  },
  "tag-delete": {
    title: "Delete local tag",
    description: "Remove this tag locally. Remote tags remain unchanged.",
    button: "Delete tag",
    fields: [{ key: "name", label: "Tag" }],
    destructive: true,
  },
  "remote-add": {
    title: "Add a remote",
    description: "Connect this repository to a remote Git server.",
    button: "Add remote",
    fields: [
      { key: "name", label: "Remote name", placeholder: "origin" },
      {
        key: "url",
        label: "Repository URL",
        placeholder: "git@github.com:you/project.git",
      },
    ],
  },
  "remote-remove": {
    title: "Remove remote",
    description:
      "Remove this remote’s local configuration and tracking branches.",
    button: "Remove remote",
    fields: [{ key: "name", label: "Remote name" }],
    destructive: true,
  },
  clone: {
    title: "Clone a repository",
    description:
      "Copy a remote repository to your computer. Choose its destination folder next.",
    button: "Choose destination & clone",
    fields: [
      {
        key: "url",
        label: "Repository URL",
        placeholder: "https://github.com/you/project.git",
      },
      { key: "name", label: "New folder name", placeholder: "my-project" },
    ],
  },
  command: {
    title: "Git command",
    description:
      "Run a Git command in this repository. Commands can change files and history; review before running.",
    button: "Run command",
  },
  abort: {
    title: "Abort current operation",
    description:
      "Cancel the current merge, rebase, cherry-pick, or revert and return to the previous state.",
    button: "Abort operation",
    destructive: true,
  },
};
export function parseCommand(input: string): string[] {
  const result: string[] = [];
  let token = "";
  let quote = "";
  let escaped = false;
  let started = false;
  for (const ch of input.trim()) {
    if (escaped) {
      token += ch;
      escaped = false;
      started = true;
    } else if (ch === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (ch === quote) quote = "";
      else token += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) {
        result.push(token);
        token = "";
        started = false;
      }
    } else {
      token += ch;
      started = true;
    }
  }
  if (quote || escaped)
    throw new Error(
      "Close the quoted text or finish the escape in your command.",
    );
  if (started) result.push(token);
  if (result[0] === "git") result.shift();
  if (!result.length) throw new Error("Enter a Git command.");
  return result;
}
export default function ActionDialog({
  action,
  initial = {},
  snapshot,
  path,
  onClose,
  onSubmit,
}: {
  action: string;
  initial?: ActionArgs;
  snapshot: Snapshot | null;
  path: string;
  onClose: () => void;
  onSubmit: (action: string, args: ActionArgs) => Promise<void>;
}) {
  const formId = useId();
  const definition = definitions[action] || {
    title: action,
    description: "Run this operation in the current repository.",
    button: "Continue",
  };
  const [args, setArgs] = useState<ActionArgs>({
    mode: "mixed",
    includeUntracked: true,
    ...initial,
  });
  const [command, setCommand] = useState("git status --short");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  return (
    <Modal
      title={definition.title}
      subtitle={definition.description}
      onClose={close}
    >
      <form
        aria-busy={busy}
        aria-describedby={error ? `${formId}-error` : undefined}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError("");
          setBusy(true);
          try {
            await onSubmit(
              action,
              action === "command" ? { argv: parseCommand(command) } : args,
            );
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-fields">
          <div className="operation-repo">
            <GitRepoIcon />
            <span>{path || "New local repository"}</span>
          </div>
          {definition.fields?.map((field) => (
            <label
              className="field-label"
              key={field.key}
              htmlFor={`${formId}-${field.key}`}
            >
              {field.label}
              {field.optional && <span className="optional">optional</span>}
              {field.multiline ? (
                <textarea
                  id={`${formId}-${field.key}`}
                  value={String(args[field.key] || "")}
                  required={!field.optional}
                  disabled={busy}
                  onChange={(e) =>
                    setArgs({ ...args, [field.key]: e.target.value })
                  }
                />
              ) : (
                <input
                  id={`${formId}-${field.key}`}
                  value={String(args[field.key] || "")}
                  required={!field.optional}
                  disabled={busy}
                  placeholder={field.placeholder}
                  list={field.key === "ref" ? `${formId}-git-refs` : undefined}
                  onChange={(e) =>
                    setArgs({ ...args, [field.key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
          <datalist id={`${formId}-git-refs`}>
            {snapshot?.branches.map((b) => (
              <option key={b.name} value={b.name} />
            ))}
          </datalist>
          {action === "reset" && (
            <label className="field-label" htmlFor={`${formId}-mode`}>
              <span id={`${formId}-mode-label`}>Reset mode</span>
              <select
                id={`${formId}-mode`}
                aria-labelledby={`${formId}-mode-label`}
                aria-describedby={
                  args.mode === "hard" ? `${formId}-reset-warning` : undefined
                }
                value={args.mode}
                disabled={busy}
                onChange={(e) => setArgs({ ...args, mode: e.target.value })}
              >
                <option value="soft">Soft — keep changes staged</option>
                <option value="mixed">Mixed — keep changes unstaged</option>
                <option value="hard">Hard — discard all tracked changes</option>
              </select>
              {args.mode === "hard" && (
                <span className="danger-copy" id={`${formId}-reset-warning`}>
                  All tracked changes will be permanently lost.
                </span>
              )}
            </label>
          )}
          {action === "stash-save" && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={args.includeUntracked}
                disabled={busy}
                onChange={(e) =>
                  setArgs({ ...args, includeUntracked: e.target.checked })
                }
              />
              Include untracked files
            </label>
          )}
          {action === "command" && (
            <label className="field-label" htmlFor={`${formId}-command`}>
              <span id={`${formId}-command-label`}>Command</span>
              <textarea
                id={`${formId}-command`}
                aria-labelledby={`${formId}-command-label`}
                aria-describedby={`${formId}-command-help`}
                className="command-input"
                value={command}
                disabled={busy}
                required
                onChange={(e) => setCommand(e.target.value)}
                spellCheck={false}
              />
              <span className="field-help" id={`${formId}-command-help`}>
                Git arguments only. Shell operators and pipelines are not
                interpreted.
              </span>
            </label>
          )}
          {args.files && (
            <div
              className="affected-files"
              role="group"
              aria-labelledby={`${formId}-files-label`}
            >
              <strong id={`${formId}-files-label`}>
                Selected files ({args.files.length})
              </strong>
              {args.files.map((file) => (
                <code key={file}>{file}</code>
              ))}
            </div>
          )}
          {definition.destructive && (
            <div className="destructive-note">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                Review the repository and selection before continuing.
              </span>
            </div>
          )}
          {error && (
            <div className="inline-error" role="alert" id={`${formId}-error`}>
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`button ${definition.destructive ? "danger" : "primary"}`}
            disabled={busy}
          >
            {busy && (
              <LoaderCircle size={14} className="spin" aria-hidden="true" />
            )}
            {busy ? "Working…" : definition.button}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function GitRepoIcon() {
  return <Terminal size={14} aria-hidden="true" />;
}
