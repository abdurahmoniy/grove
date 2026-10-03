import { useCallback, useState } from "react";
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
    description: "Give your next idea a little room to grow.",
    button: "Create & switch",
    fields: [
      {
        key: "name",
        label: "Branch name",
        placeholder: "feature/your-next-idea",
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
    description: "Set your changes aside and return to a clean working tree.",
    button: "Stash changes",
    fields: [
      {
        key: "message",
        label: "Stash message",
        placeholder: "What are you working on?",
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
    description: "Mark a meaningful point in your project’s history.",
    button: "Create tag",
    fields: [
      { key: "name", label: "Tag name", placeholder: "v1.3.0" },
      { key: "ref", label: "Reference", placeholder: "HEAD", optional: true },
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
      { key: "name", label: "Name", placeholder: "origin" },
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
  push: {
    title: "Push changes",
    description: "Send your committed work to a remote repository.",
    button: "Push changes",
    fields: [{ key: "remote", label: "Remote", placeholder: "origin" }],
  },
  clone: {
    title: "Clone a repository",
    description: "Get a local copy. You’ll choose a destination folder next.",
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
  const definition = definitions[action] || {
    title: action,
    description: "Run this operation in the current repository.",
    button: "Continue",
  };
  const [args, setArgs] = useState<ActionArgs>({
    mode: "mixed",
    includeUntracked: true,
    remote:
      snapshot?.remotes
        .filter((remote) => snapshot.upstream.startsWith(remote.name + "/"))
        .sort((a, b) => b.name.length - a.name.length)[0]?.name ||
      snapshot?.remotes[0]?.name ||
      "origin",
    setUpstream: !snapshot?.upstream,
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
        onSubmit={async (e) => {
          e.preventDefault();
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
            <label className="field-label" key={field.key}>
              {field.label}
              {field.optional && <span className="optional">optional</span>}
              {field.multiline ? (
                <textarea
                  value={String(args[field.key] || "")}
                  required={!field.optional}
                  onChange={(e) =>
                    setArgs({ ...args, [field.key]: e.target.value })
                  }
                />
              ) : (
                <input
                  value={String(args[field.key] || "")}
                  required={!field.optional}
                  placeholder={field.placeholder}
                  list={field.key === "ref" ? "git-refs" : undefined}
                  onChange={(e) =>
                    setArgs({ ...args, [field.key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
          <datalist id="git-refs">
            {snapshot?.branches.map((b) => (
              <option key={b.name} value={b.name} />
            ))}
          </datalist>
          {action === "reset" && (
            <label className="field-label">
              Reset mode
              <select
                value={args.mode}
                onChange={(e) => setArgs({ ...args, mode: e.target.value })}
              >
                <option value="soft">Soft — keep changes staged</option>
                <option value="mixed">Mixed — keep changes unstaged</option>
                <option value="hard">Hard — discard all tracked changes</option>
              </select>
              {args.mode === "hard" && (
                <span className="danger-copy">
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
                onChange={(e) =>
                  setArgs({ ...args, includeUntracked: e.target.checked })
                }
              />
              Include untracked files
            </label>
          )}
          {action === "push" && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={args.setUpstream}
                onChange={(e) =>
                  setArgs({ ...args, setUpstream: e.target.checked })
                }
              />
              Set as upstream for this branch
            </label>
          )}
          {action === "command" && (
            <label className="field-label">
              Command
              <textarea
                className="command-input"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                spellCheck={false}
              />
              <span className="field-help">
                Git arguments only. Shell operators and pipelines are not
                interpreted.
              </span>
            </label>
          )}
          {args.files && (
            <div className="affected-files">
              {args.files.map((file) => (
                <code key={file}>{file}</code>
              ))}
            </div>
          )}
          {definition.destructive && (
            <div className="destructive-note">
              <AlertTriangle size={16} />
              <span>
                Review the repository and selection before continuing.
              </span>
            </div>
          )}
          {error && (
            <div className="inline-error" role="alert">
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
            {busy && <LoaderCircle size={14} className="spin" />}
            {busy ? "Working…" : definition.button}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function GitRepoIcon() {
  return <Terminal size={14} />;
}
