import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  Check,
  GitBranch,
  LoaderCircle,
  AlignLeft,
  WandSparkles,
} from "lucide-react";
import type { Snapshot } from "../types";
import { isConflict, isStaged } from "./Changes";
import { Modal } from "./ui";
import CommitMessageDialog from "./CommitMessageDialog";

export interface CommitDraft {
  summary: string;
  description: string;
  amend: boolean;
}

interface Props {
  snapshot: Snapshot;
  onCommit: (message: string, amend: boolean) => Promise<boolean>;
  busy: boolean;
  draft: CommitDraft;
  onDraftChange: (draft: CommitDraft) => void;
}

export default function CommitComposer({
  snapshot,
  onCommit,
  busy,
  draft,
  onDraftChange,
}: Props) {
  const fieldId = useId();
  const submittingRef = useRef(false);
  const summaryRef = useRef<HTMLInputElement>(null);
  const focusSummaryAfterApply = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  useEffect(() => {
    if (!generatorOpen && focusSummaryAfterApply.current) {
      summaryRef.current?.focus();
      focusSummaryAfterApply.current = false;
    }
  }, [generatorOpen]);
  const { summary, description, amend } = draft;
  const stagedCount = snapshot.files.filter(isStaged).length;
  const conflictCount = snapshot.files.filter(isConflict).length;
  const pending = busy || submitting;
  const canCommit =
    !pending &&
    !conflictCount &&
    Boolean(summary.trim()) &&
    (stagedCount > 0 || amend);
  const guidance = pending
    ? "Waiting for Git…"
    : conflictCount
      ? `Resolve ${conflictCount} conflict${conflictCount === 1 ? "" : "s"} before committing.`
      : !stagedCount && !amend
        ? "Check files above to stage them."
        : !summary.trim()
          ? "Add a summary to commit."
          : amend
            ? "Updates your previous commit."
            : "Only staged changes will be included.";

  const submit = async () => {
    if (!canCommit || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setDetailsOpen(false);
    try {
      if (
        await onCommit(
          [summary.trim(), description.trim()].filter(Boolean).join("\n\n"),
          amend,
        )
      ) {
        onDraftChange({ summary: "", description: "", amend: false });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const handleCommitShortcut = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key === "Enter" &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <>
      <section
        className="commit-bar"
        aria-label="Create a commit"
        aria-busy={submitting}
      >
        <div className="commit-bar-inner">
          <div className="commit-bar-heading">
            <label htmlFor={`${fieldId}-summary`}>Commit summary</label>
            <span
              id={`${fieldId}-staged`}
              className={`commit-staged-count ${stagedCount ? "has-staged" : ""}`}
            >
              {stagedCount} staged
              <span className="sr-only"> files</span>
            </span>
            <span
              className="commit-target"
              title={
                snapshot.detached
                  ? "Commit on detached HEAD"
                  : `Commit to ${snapshot.branch}`
              }
            >
              <GitBranch size={12} aria-hidden="true" />
              <span>
                {snapshot.detached ? "Detached HEAD" : snapshot.branch}
              </span>
            </span>
            {amend && <span className="commit-amend-state">Amend</span>}
            <p
              id={`${fieldId}-guidance`}
              className={conflictCount ? "has-conflicts" : ""}
              aria-live="polite"
            >
              {guidance}
            </p>
          </div>
          <div className="commit-bar-controls">
            <div className="commit-bar-field">
              <input
                ref={summaryRef}
                id={`${fieldId}-summary`}
                aria-describedby={`${fieldId}-staged ${fieldId}-guidance`}
                placeholder="Describe what changed…"
                value={summary}
                maxLength={500}
                readOnly={pending}
                onChange={(event) =>
                  onDraftChange({ ...draft, summary: event.target.value })
                }
                onKeyDown={handleCommitShortcut}
              />
            </div>
            <button
              type="button"
              className="button commit-generate-button"
              disabled={pending || !stagedCount || !!conflictCount}
              aria-haspopup="dialog"
              aria-label="Generate commit message"
              title={
                conflictCount
                  ? "Resolve conflicts before generating a message"
                  : !stagedCount
                    ? "Stage files to generate a commit message"
                    : "Generate a message from staged changes"
              }
              onClick={() => setGeneratorOpen(true)}
            >
              <WandSparkles size={15} aria-hidden="true" />
              Generate
            </button>
            <button
              type="button"
              className={`button commit-details-button ${description || amend ? "has-details" : ""}`}
              disabled={pending}
              aria-haspopup="dialog"
              aria-label={
                description
                  ? "Commit details, description added"
                  : "Commit details"
              }
              title="Add a description or amend the previous commit"
              onClick={() => setDetailsOpen(true)}
            >
              <AlignLeft size={15} aria-hidden="true" />
              Details
              {description && (
                <span className="commit-details-dot" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="button primary commit-submit"
              disabled={!canCommit}
              aria-describedby={`${fieldId}-staged ${fieldId}-guidance`}
              aria-keyshortcuts="Meta+Enter Control+Enter"
              title="Commit staged changes (⌘/Ctrl+Enter)"
              onClick={() => void submit()}
            >
              {submitting ? (
                <LoaderCircle size={16} className="spin" aria-hidden="true" />
              ) : (
                <Check size={16} aria-hidden="true" />
              )}
              <span>
                {submitting ? "Committing…" : amend ? "Amend commit" : "Commit"}
              </span>
              <kbd aria-hidden="true">⌘↵</kbd>
            </button>
          </div>
        </div>
      </section>
      {generatorOpen && (
        <CommitMessageDialog
          repositoryPath={snapshot.root}
          busy={pending}
          replacesDraft={Boolean(summary.trim() || description.trim())}
          onClose={() => setGeneratorOpen(false)}
          onApply={(message) => {
            onDraftChange({ ...draft, ...message });
            focusSummaryAfterApply.current = true;
            setGeneratorOpen(false);
          }}
        />
      )}
      {detailsOpen && (
        <Modal
          title="Commit details"
          subtitle="Add context or update your previous commit."
          onClose={() => setDetailsOpen(false)}
        >
          <div className="commit-details-form">
            <label
              className="commit-field-label"
              htmlFor={`${fieldId}-description`}
            >
              Description <span>(optional)</span>
            </label>
            <textarea
              id={`${fieldId}-description`}
              aria-label="Commit description"
              placeholder="Why was this change needed?"
              rows={5}
              value={description}
              disabled={pending}
              onChange={(event) =>
                onDraftChange({ ...draft, description: event.target.value })
              }
              onKeyDown={handleCommitShortcut}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={amend}
                disabled={pending}
                onChange={(event) =>
                  onDraftChange({ ...draft, amend: event.target.checked })
                }
              />
              Amend previous commit
            </label>
            <p className="commit-details-note">
              Amending replaces your most recent commit. You’ll review a
              confirmation before it runs.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => setDetailsOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
