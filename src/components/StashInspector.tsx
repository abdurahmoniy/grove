import { useEffect, useState } from "react";
import { request, errorMessage } from "../api";
import { Loading, Modal } from "./ui";
export default function StashInspector({
  path,
  reference,
  onClose,
}: {
  path: string;
  reference: string;
  onClose: () => void;
}) {
  const [patch, setPatch] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    request<string>("action", {
      path,
      action: "command",
      args: {
        argv: [
          "stash",
          "show",
          "--include-untracked",
          "--patch",
          "--no-ext-diff",
          "--no-textconv",
          reference,
        ],
      },
    })
      .then((output) => {
        if (!cancelled) setPatch(output);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [path, reference]);
  return (
    <Modal
      wide
      title="Saved changes"
      subtitle={`${reference} · ${path}`}
      onClose={onClose}
    >
      <div className="stash-inspector">
        {error ? (
          <div className="inline-error">{error}</div>
        ) : patch === null ? (
          <Loading label="Reading stash" />
        ) : patch ? (
          <>
            <pre className="stash-patch">
              {patch
                .slice(0, 512000)
                .split("\n")
                .map((line, i) => (
                  <span
                    key={i}
                    className={
                      line.startsWith("+")
                        ? "patch-add"
                        : line.startsWith("-")
                          ? "patch-delete"
                          : line.startsWith("@@") || line.startsWith("diff ")
                            ? "patch-hunk"
                            : ""
                    }
                  >
                    {line}
                    {"\n"}
                  </span>
                ))}
            </pre>
            {patch.length > 512000 && (
              <p className="large-diff-note">
                Showing the first 500 KiB. Use the Git command panel to inspect
                the remaining content.
              </p>
            )}
          </>
        ) : (
          <p className="group-empty">No text changes in this stash.</p>
        )}
      </div>
      <div className="modal-actions">
        <button className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
