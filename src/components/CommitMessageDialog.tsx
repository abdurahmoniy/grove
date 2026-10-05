import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, LoaderCircle, RotateCcw, WandSparkles } from "lucide-react";
import { errorMessage, request } from "../api";
import type { GeneratedCommitMessage } from "../types";
import { Modal } from "./ui";

interface Props {
  repositoryPath: string;
  replacesDraft: boolean;
  busy: boolean;
  onApply: (message: { summary: string; description: string }) => void;
  onClose: () => void;
}

export default function CommitMessageDialog({
  repositoryPath,
  replacesDraft,
  busy,
  onApply,
  onClose,
}: Props) {
  const fieldId = useId();
  const summaryRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const focusOrigin = useRef<Element | null>(null);
  const restoreFocus = useRef(false);
  const requestId = useRef(0);
  const requesting = useRef(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const [phase, setPhase] = useState<"generating" | "checking" | "idle">(
    "generating",
  );
  const [generated, setGenerated] = useState<GeneratedCommitMessage | null>(
    null,
  );
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const pending = phase !== "idle";
  const close = () => {
    requestId.current++;
    onClose();
  };

  const generate = useCallback(async () => {
    if (requesting.current) return;
    focusOrigin.current = document.activeElement;
    if (busyRef.current) {
      restoreFocus.current = true;
      setPhase("idle");
      setError("Wait for the current Git operation to finish, then try again.");
      return;
    }
    const id = ++requestId.current;
    requesting.current = true;
    setPhase("generating");
    setError("");
    try {
      const message = await request<GeneratedCommitMessage>(
        "generateCommitMessage",
        { path: repositoryPath },
      );
      if (id !== requestId.current) return;
      setGenerated(message);
      setSummary(message.summary);
      setDescription(message.description);
      setStale(false);
    } catch (failure) {
      if (id === requestId.current) setError(errorMessage(failure));
    } finally {
      if (id === requestId.current) {
        requesting.current = false;
        restoreFocus.current = true;
        setPhase("idle");
      }
    }
  }, [repositoryPath]);

  useEffect(() => {
    void generate();
    return () => {
      // Requests are read-only. Closing or changing repositories invalidates
      // their results, including an in-flight apply check.
      requestId.current++;
      requesting.current = false;
    };
  }, [generate]);

  useEffect(() => {
    if (phase !== "idle" || !restoreFocus.current) return;
    restoreFocus.current = false;
    // Disabling a focused request button can leave focus on the document.
    // Restore it after the request unless the user moved to another control.
    const active = document.activeElement;
    if (active === document.body || active === focusOrigin.current)
      (error ? errorRef.current : summaryRef.current)?.focus();
  }, [phase, generated, error]);

  const apply = async () => {
    if (
      !generated ||
      !summary.trim() ||
      stale ||
      requesting.current ||
      busyRef.current
    )
      return;
    const id = ++requestId.current;
    focusOrigin.current = document.activeElement;
    requesting.current = true;
    setPhase("checking");
    setError("");
    try {
      const current = await request<GeneratedCommitMessage>(
        "generateCommitMessage",
        { path: repositoryPath },
      );
      if (id !== requestId.current) return;
      if (current.stagedFingerprint !== generated.stagedFingerprint) {
        setStale(true);
        setError(
          "Your staged changes have changed. Regenerate the message before using it.",
        );
        return;
      }
      if (busyRef.current) {
        setError(
          "Wait for the current Git operation to finish, then try again.",
        );
        return;
      }
      onApply({ summary: summary.trim(), description: description.trim() });
    } catch (failure) {
      if (id === requestId.current) setError(errorMessage(failure));
    } finally {
      if (id === requestId.current) {
        requesting.current = false;
        restoreFocus.current = true;
        setPhase("idle");
      }
    }
  };

  return (
    <Modal
      title="Generate commit message"
      subtitle="A starting point from your staged files. Review and edit it below."
      onClose={close}
    >
      <div className="commit-generator">
        <div className="commit-generator-content">
          <div className="commit-generator-context">
            <span>
              <WandSparkles size={14} aria-hidden="true" /> Local generator
            </span>
            {generated && (
              <span>
                {generated.fileCount} staged{" "}
                {generated.fileCount === 1 ? "file" : "files"}
              </span>
            )}
          </div>
          <p className="commit-generator-note">
            Uses file names and change types. No code is sent anywhere.
          </p>
          <div
            className="commit-generator-status"
            role="status"
            aria-live="polite"
          >
            {pending && (
              <>
                <LoaderCircle size={15} className="spin" aria-hidden="true" />
                {phase === "checking"
                  ? "Checking staged changes…"
                  : "Reading staged changes…"}
              </>
            )}
            {!pending && generated && !error && (
              <span className="sr-only">Message ready to edit.</span>
            )}
          </div>
          {generated && (
            <div className="commit-generator-fields" aria-busy={pending}>
              <div className="commit-generator-label">
                <label
                  className="commit-field-label"
                  htmlFor={`${fieldId}-summary`}
                >
                  Summary
                </label>
                <span
                  className={summary.length > 72 ? "over-recommended" : ""}
                  aria-hidden="true"
                >
                  {summary.length}/72
                </span>
              </div>
              <input
                ref={summaryRef}
                id={`${fieldId}-summary`}
                value={summary}
                maxLength={500}
                readOnly={pending}
                aria-describedby={`${fieldId}-length`}
                onChange={(event) => setSummary(event.target.value)}
              />
              <p id={`${fieldId}-length`} className="commit-generator-hint">
                Aim for 72 characters or fewer.
              </p>
              <label
                className="commit-field-label"
                htmlFor={`${fieldId}-description`}
              >
                Description <span>(optional)</span>
              </label>
              <textarea
                id={`${fieldId}-description`}
                value={description}
                rows={5}
                readOnly={pending}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          )}
          {error && (
            <p
              ref={errorRef}
              tabIndex={-1}
              className="commit-generator-error"
              role="alert"
            >
              {error}
            </p>
          )}
          {replacesDraft && (
            <p className="commit-generator-replace">
              Using this message replaces your current summary and description.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button commit-regenerate"
            disabled={pending || busy}
            title="Create a new preview from the current staged changes"
            onClick={() => void generate()}
          >
            <RotateCcw size={14} aria-hidden="true" />
            {generated ? "Regenerate" : "Try again"}
          </button>
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            disabled={pending || busy || !generated || !summary.trim() || stale}
            onClick={() => void apply()}
          >
            {phase === "checking" ? (
              <LoaderCircle size={15} className="spin" aria-hidden="true" />
            ) : (
              <Check size={15} aria-hidden="true" />
            )}
            {replacesDraft ? "Replace draft" : "Use message"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
