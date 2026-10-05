import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  FolderGit2,
  GitBranch,
  Globe2,
  LoaderCircle,
} from "lucide-react";
import { errorMessage } from "../api";
import type { ActionArgs, Snapshot } from "../types";
import { isValidSyncBranch } from "../lib/quickActions";
import { Modal } from "./ui";

interface Props {
  action: "pull" | "push";
  initial?: ActionArgs;
  snapshot: Snapshot | null;
  path: string;
  onClose: () => void;
  onSubmit: (action: string, args: ActionArgs) => Promise<void>;
}

export default function SyncDialog({
  action,
  initial = {},
  snapshot,
  path,
  onClose,
  onSubmit,
}: Props) {
  const id = useId();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const isPush = action === "push";
  const remotes = snapshot?.remotes || [];
  const localBranches = (snapshot?.branches || []).filter(
    (branch) => !branch.remote,
  );
  const remoteFor = (reference: string) =>
    remotes
      .filter((remote) => reference.startsWith(`${remote.name}/`))
      .sort((a, b) => b.name.length - a.name.length)[0];
  const upstreamRemote = remoteFor(snapshot?.upstream || "");
  const defaultRemoteBranch = (localBranch: string, remote: string) =>
    !snapshot?.detached &&
    localBranch === snapshot?.branch &&
    remote === upstreamRemote?.name
      ? snapshot.upstream.slice(remote.length + 1)
      : localBranch;
  const [selection, setSelection] = useState(() => {
    const remote =
      initial.remote ||
      upstreamRemote?.name ||
      remotes.find((item) => item.name === "origin")?.name ||
      remotes[0]?.name ||
      "";
    const localBranch =
      (isPush ? initial.localBranch : undefined) ||
      (!snapshot?.detached ? snapshot?.branch : "") ||
      "";
    return {
      remote,
      localBranch,
      remoteBranch:
        initial.remoteBranch ?? defaultRemoteBranch(localBranch, remote),
      setUpstream: initial.setUpstream === true,
    };
  });
  const { remote, localBranch, remoteBranch, setUpstream } = selection;
  const selectedRemote = remotes.find((item) => item.name === remote);
  const remoteUrls = selectedRemote
    ? isPush && selectedRemote.pushUrls?.length
      ? selectedRemote.pushUrls
      : [selectedRemote.url]
    : [];
  const remoteBranches = Array.from(
    new Set(
      (snapshot?.branches || [])
        .filter(
          (branch) => branch.remote && remoteFor(branch.name)?.name === remote,
        )
        .map((branch) => branch.name.slice(remote.length + 1))
        .filter((name) => name !== "HEAD"),
    ),
  );
  const localEndpoint = isPush ? localBranch : snapshot?.branch || "";
  const remoteEndpoint = `${remote || "remote"}/${remoteBranch || "branch"}`;
  const branchIssue = !remoteBranch
    ? `Enter the remote ${isPush ? "destination" : "source"} branch.`
    : !isValidSyncBranch(remoteBranch)
      ? "Use a valid Git branch name without spaces or special ref characters."
      : "";
  const blocked = !snapshot
    ? "Repository information is unavailable. Close this dialog and refresh the repository."
    : !remotes.length
      ? "Add a remote in More → Remotes before syncing this repository."
      : !selectedRemote
        ? "Choose a configured remote."
        : snapshot.operation
          ? `Finish or abort the ${snapshot.operation} operation before syncing.`
          : !isPush && snapshot.detached
            ? "Switch to a local branch before pulling."
            : isPush &&
                !localBranches.some((branch) => branch.name === localBranch)
              ? "Choose an existing local branch with a commit to push."
              : !localEndpoint
                ? "A local branch is required for this operation."
                : "";
  const knownRemoteBranch = remoteBranches.includes(remoteBranch);
  const canSubmit = !busy && !blocked && !branchIssue;
  const close = () => {
    if (!submitting.current) onClose();
  };

  return (
    <Modal
      title={isPush ? "Push commits" : "Pull commits"}
      subtitle={
        isPush
          ? "Choose which local branch to send and where it goes."
          : "Choose the remote branch to bring into your current branch."
      }
      onClose={close}
    >
      <form
        className="sync-form"
        aria-busy={busy}
        aria-describedby={error ? `${id}-error` : undefined}
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current || !canSubmit) return;
          submitting.current = true;
          setBusy(true);
          setError("");
          try {
            await onSubmit(action, {
              remote,
              remoteBranch,
              ...(isPush ? { localBranch, setUpstream } : {}),
            });
            onClose();
          } catch (cause) {
            setError(errorMessage(cause));
          } finally {
            submitting.current = false;
            setBusy(false);
          }
        }}
      >
        <div className="modal-fields sync-fields">
          <div className="operation-repo" title={path}>
            <FolderGit2 size={16} aria-hidden="true" />
            <span>{path}</span>
          </div>
          <label className="field-label" htmlFor={`${id}-remote`}>
            Remote
            <select
              id={`${id}-remote`}
              value={remote}
              disabled={busy || !remotes.length}
              required
              aria-describedby={
                remoteUrls.length ? `${id}-remote-url` : undefined
              }
              onChange={(event) => {
                const next = event.target.value;
                setSelection((current) => ({
                  ...current,
                  remote: next,
                  remoteBranch: defaultRemoteBranch(current.localBranch, next),
                }));
              }}
            >
              {!selectedRemote && (
                <option value="">
                  {remotes.length ? "Choose a remote" : "No remotes configured"}
                </option>
              )}
              {remotes.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            {!!remoteUrls.length && (
              <span className="field-help" id={`${id}-remote-url`}>
                {isPush && remoteUrls.length > 1 && (
                  <span className="sync-remote-url">
                    Push sends to all {remoteUrls.length} configured
                    destinations:
                  </span>
                )}
                {remoteUrls.map((url, index) => (
                  <span key={`${index}-${url}`} className="sync-remote-url">
                    {url}
                  </span>
                ))}
              </span>
            )}
          </label>
          {isPush ? (
            <label className="field-label" htmlFor={`${id}-local-branch`}>
              Local source branch
              <select
                id={`${id}-local-branch`}
                value={localBranch}
                disabled={busy || !localBranches.length}
                required
                onChange={(event) => {
                  const next = event.target.value;
                  setSelection((current) => ({
                    ...current,
                    localBranch: next,
                    remoteBranch: defaultRemoteBranch(next, current.remote),
                  }));
                }}
              >
                {!localBranches.some(
                  (branch) => branch.name === localBranch,
                ) && (
                  <option value="">
                    {localBranches.length
                      ? "Choose a local branch"
                      : "No local branches with commits"}
                  </option>
                )}
                {localBranches.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name}
                    {branch.current ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field-label" htmlFor={`${id}-remote-branch`}>
            Remote {isPush ? "destination" : "source"} branch
            <input
              id={`${id}-remote-branch`}
              value={remoteBranch}
              list={`${id}-remote-branches`}
              placeholder={
                isPush ? "Branch to create or update" : "Branch to pull from"
              }
              autoComplete="off"
              spellCheck={false}
              disabled={busy || !selectedRemote}
              required
              aria-invalid={!!remoteBranch && !!branchIssue}
              aria-describedby={`${id}-branch-help${remoteBranch && branchIssue ? ` ${id}-branch-error` : ""}`}
              onChange={(event) =>
                setSelection((current) => ({
                  ...current,
                  remoteBranch: event.target.value,
                }))
              }
            />
            <datalist id={`${id}-remote-branches`}>
              {remoteBranches.map((branch) => (
                <option key={branch} value={branch} />
              ))}
            </datalist>
            <span className="field-help" id={`${id}-branch-help`}>
              Enter the branch name without the “{remote || "remote"}/” prefix.
              Suggestions reflect the last fetch.
            </span>
            {remoteBranch && branchIssue && (
              <span className="danger-copy" id={`${id}-branch-error`}>
                {branchIssue}
              </span>
            )}
          </label>
          {!isPush && (
            <label className="field-label" htmlFor={`${id}-local-branch`}>
              Current local destination
              <input
                id={`${id}-local-branch`}
                value={snapshot?.detached ? "Detached HEAD" : localEndpoint}
                readOnly
                disabled={busy}
                aria-describedby={`${id}-pull-note`}
              />
            </label>
          )}
          <div
            className="sync-route"
            role="group"
            aria-label={isPush ? "Push route" : "Pull route"}
          >
            <div className="sync-endpoint">
              <span className="sync-route-label">
                From · {isPush ? "Local" : "Remote"}
              </span>
              <strong>
                {isPush ? (
                  <GitBranch size={15} aria-hidden="true" />
                ) : (
                  <Globe2 size={15} aria-hidden="true" />
                )}
                {isPush ? localEndpoint || "Choose a branch" : remoteEndpoint}
              </strong>
            </div>
            <ArrowRight
              size={20}
              className="sync-direction"
              aria-hidden="true"
            />
            <div className="sync-endpoint">
              <span className="sync-route-label">
                To · {isPush ? "Remote" : "Local"}
              </span>
              <strong>
                {isPush ? (
                  <Globe2 size={15} aria-hidden="true" />
                ) : (
                  <GitBranch size={15} aria-hidden="true" />
                )}
                {isPush
                  ? remoteEndpoint
                  : snapshot?.detached
                    ? "Detached HEAD"
                    : localEndpoint || "Choose a branch"}
              </strong>
            </div>
          </div>
          {isPush ? (
            <>
              <p className="sync-note">
                Only commits on the selected local branch are sent. Staged and
                uncommitted changes stay on your computer.
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={setUpstream}
                  disabled={busy || !localBranch || !selectedRemote}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      setUpstream: event.target.checked,
                    }))
                  }
                />
                <span>
                  Set{" "}
                  <strong>{localBranch || "the selected local branch"}</strong>{" "}
                  to track <strong>{remoteEndpoint}</strong>
                </span>
              </label>
            </>
          ) : (
            <p className="sync-note" id={`${id}-pull-note`}>
              Pull uses fast-forward only. It updates your current branch
              without checking out another branch. If histories have diverged,
              Git will stop so you can choose how to merge or rebase.
            </p>
          )}
          {!!remoteBranch &&
            !branchIssue &&
            selectedRemote &&
            !knownRemoteBranch && (
              <p className="sync-warning">
                This branch is not in the last fetched list; it may already
                exist remotely.{" "}
                {isPush
                  ? "Push can create it if it does not exist."
                  : "Git will check the remote when you pull."}
              </p>
            )}
          {blocked && (
            <p className="sync-warning" role="status">
              {blocked}
            </p>
          )}
          {error && (
            <div
              ref={errorRef}
              tabIndex={-1}
              className="inline-error"
              id={`${id}-error`}
              role="alert"
            >
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={!canSubmit}
          >
            {busy && (
              <LoaderCircle size={15} className="spin" aria-hidden="true" />
            )}
            {busy
              ? isPush
                ? "Pushing…"
                : "Pulling…"
              : isPush
                ? "Push commits"
                : "Pull commits"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
