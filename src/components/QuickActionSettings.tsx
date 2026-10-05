import { useId, useRef, useState } from "react";
import { ArrowRight, Check, GitBranch } from "lucide-react";
import type { Project, Snapshot } from "../types";
import { isValidSyncBranch, resolveSyncRemote } from "../lib/quickActions";
import type {
  QuickActionId,
  QuickActionPreferences,
  RepositorySyncPreferences,
} from "../lib/quickActions";

interface Props {
  snapshot: Snapshot | null;
  project: Project | null;
  preferences: QuickActionPreferences;
  target: RepositorySyncPreferences;
  onPreferencesChange: (next: QuickActionPreferences) => void;
  onTargetChange: (next: RepositorySyncPreferences) => void;
}

const actions: { id: QuickActionId; label: string; description: string }[] = [
  {
    id: "fetch",
    label: "Fetch",
    description: "Check remotes for new commits.",
  },
  {
    id: "pull",
    label: "Pull",
    description: "Choose a remote branch to pull into your current branch.",
  },
  {
    id: "push",
    label: "Push",
    description: "Choose the branch and destination for your commits.",
  },
  {
    id: "sync",
    label: "Sync",
    description: "Bring your saved remote branch into the current branch.",
  },
];

export default function QuickActionSettings({
  snapshot,
  project,
  preferences,
  target,
  onPreferencesChange,
  onTargetChange,
}: Props) {
  const id = useId();
  const [draft, setDraft] = useState({ ...target });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const remoteRef = useRef<HTMLSelectElement>(null);
  const branchRef = useRef<HTMLInputElement>(null);
  const resolvedRemote = resolveSyncRemote(snapshot, draft);
  const automaticRemote = resolveSyncRemote(snapshot, { ...draft, remote: "" });
  const remotes = snapshot?.remotes || [];
  const missingRemote =
    !!draft.remote && !remotes.some((remote) => remote.name === draft.remote);
  const suggestions = Array.from(
    new Set(
      (snapshot?.branches || [])
        .filter(
          (branch) =>
            branch.remote &&
            remotes
              .filter((remote) => branch.name.startsWith(`${remote.name}/`))
              .sort((a, b) => b.name.length - a.name.length)[0]?.name ===
              resolvedRemote,
        )
        .map((branch) => branch.name.slice(resolvedRemote.length + 1))
        .filter((branch) => branch !== "HEAD"),
    ),
  );
  const dirty =
    draft.remote !== target.remote || draft.branch !== target.branch;
  const updateDraft = (next: RepositorySyncPreferences) => {
    setDraft(next);
    setSaved(false);
    setError("");
  };

  return (
    <div className="quick-action-settings">
      <section
        className="settings-section"
        aria-labelledby={`${id}-actions-heading`}
      >
        <h3 id={`${id}-actions-heading`}>Quick actions</h3>
        <p className="settings-help">
          Choose the shortcuts shown in the repository toolbar. These choices
          apply to every repository.
        </p>
        <div className="quick-action-toggles">
          {actions.map((action) => (
            <div className="setting-row quick-action-toggle" key={action.id}>
              <div>
                <strong id={`${id}-${action.id}-label`}>{action.label}</strong>
                <p id={`${id}-${action.id}-help`}>{action.description}</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  aria-labelledby={`${id}-${action.id}-label`}
                  aria-describedby={`${id}-${action.id}-help`}
                  checked={preferences.visible[action.id]}
                  onChange={(event) =>
                    onPreferencesChange({
                      ...preferences,
                      visible: {
                        ...preferences.visible,
                        [action.id]: event.target.checked,
                      },
                    })
                  }
                />
                <span />
              </label>
            </div>
          ))}
        </div>
        <div className="setting-row">
          <div>
            <strong id={`${id}-confirm-label`}>Review before syncing</strong>
            <p id={`${id}-confirm-help`}>
              Show the selected branches before running Sync.
            </p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              aria-labelledby={`${id}-confirm-label`}
              aria-describedby={`${id}-confirm-help`}
              checked={preferences.confirmSync}
              onChange={(event) =>
                onPreferencesChange({
                  ...preferences,
                  confirmSync: event.target.checked,
                })
              }
            />
            <span />
          </label>
        </div>
      </section>
      <section
        className="settings-section"
        aria-labelledby={`${id}-target-heading`}
      >
        <h3 id={`${id}-target-heading`}>
          Sync source{project ? ` · ${project.name}` : ""}
        </h3>
        {project ? (
          <>
            <p className="settings-help">
              Choose the remote branch Sync brings into your current branch.
              This setting is saved for this repository.
            </p>
            <form
              className="sync-target-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                setSaved(false);
                if (!resolvedRemote) {
                  setError(
                    missingRemote
                      ? "This remote is no longer configured. Choose another remote or Automatic."
                      : "Add a remote in More → Remotes before saving a sync source.",
                  );
                  remoteRef.current?.focus();
                  return;
                }
                if (!isValidSyncBranch(draft.branch)) {
                  setError(
                    "Enter a valid branch name such as main or release/stable. Full refs and refspecs are not accepted.",
                  );
                  branchRef.current?.focus();
                  return;
                }
                onTargetChange({ ...draft });
                setError("");
                setSaved(true);
              }}
            >
              <div className="sync-target-fields">
                <label className="field-label" htmlFor={`${id}-target-remote`}>
                  Remote
                  <select
                    id={`${id}-target-remote`}
                    ref={remoteRef}
                    value={draft.remote}
                    disabled={!snapshot}
                    aria-invalid={missingRemote}
                    aria-describedby={`${id}-automatic-help${error && !resolvedRemote ? ` ${id}-target-error` : ""}`}
                    onChange={(event) =>
                      updateDraft({ ...draft, remote: event.target.value })
                    }
                  >
                    <option value="">
                      Automatic{automaticRemote ? ` · ${automaticRemote}` : ""}
                    </option>
                    {missingRemote && (
                      <option value={draft.remote}>
                        {draft.remote} (unavailable)
                      </option>
                    )}
                    {remotes.map((remote) => (
                      <option key={remote.name} value={remote.name}>
                        {remote.name}
                      </option>
                    ))}
                  </select>
                  <span className="field-help" id={`${id}-automatic-help`}>
                    Automatic uses origin, then the current upstream’s remote,
                    then the first configured remote.
                  </span>
                </label>
                <label className="field-label" htmlFor={`${id}-target-branch`}>
                  Remote branch
                  <input
                    id={`${id}-target-branch`}
                    ref={branchRef}
                    value={draft.branch}
                    list={`${id}-branch-suggestions`}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="main"
                    disabled={!snapshot}
                    aria-invalid={!!error && !isValidSyncBranch(draft.branch)}
                    aria-describedby={`${id}-target-help${error && !isValidSyncBranch(draft.branch) ? ` ${id}-target-error` : ""}`}
                    onChange={(event) =>
                      updateDraft({ ...draft, branch: event.target.value })
                    }
                  />
                  <datalist id={`${id}-branch-suggestions`}>
                    {suggestions.map((branch) => (
                      <option key={branch} value={branch} />
                    ))}
                  </datalist>
                  <span className="field-help" id={`${id}-target-help`}>
                    Use a short branch name, such as main. Suggestions come from
                    the last fetch.
                  </span>
                </label>
              </div>
              <div className="sync-target-preview" aria-label="Sync route">
                <GitBranch size={15} aria-hidden="true" />
                <span>
                  {resolvedRemote || "remote"}/{draft.branch || "branch"}
                </span>
                <ArrowRight size={15} aria-hidden="true" />
                <span>
                  {snapshot?.detached
                    ? "Current branch (detached HEAD)"
                    : snapshot?.branch || "Current branch"}
                </span>
              </div>
              <p className="settings-help">
                Sync is fast-forward only. It does not push or check out another
                branch. If histories have diverged, Git stops without merging.
              </p>
              {missingRemote && !error && (
                <p className="sync-warning">
                  The saved remote is unavailable. Choose another remote to
                  enable Sync.
                </p>
              )}
              {error && (
                <p
                  className="inline-error"
                  id={`${id}-target-error`}
                  role="alert"
                >
                  {error}
                </p>
              )}
              <div className="sync-target-actions">
                <button
                  type="submit"
                  className="button primary"
                  disabled={!snapshot || (!dirty && !error)}
                >
                  Save sync source
                </button>
                <span className="sync-target-status" role="status">
                  {saved ? (
                    <>
                      <Check size={14} aria-hidden="true" />
                      Saved for {project.name}
                    </>
                  ) : dirty ? (
                    "Unsaved changes"
                  ) : (
                    ""
                  )}
                </span>
              </div>
            </form>
          </>
        ) : (
          <p className="settings-help">
            Open a repository to choose its Sync source.
          </p>
        )}
      </section>
    </div>
  );
}
