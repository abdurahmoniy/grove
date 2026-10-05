import { useEffect, useMemo, useRef, useState } from "react";
import {
  Columns2,
  WrapText,
  AlignLeft,
  FileCode2,
  Copy,
  CheckCheck,
  Expand,
  Check,
  PencilLine,
} from "lucide-react";
import type { DiffData } from "../types";
import { FileIcon, IconButton, Loading } from "./ui";
import { parseDiff, type DiffLine as Line } from "../lib/diff";
function Code({ text }: { text: string }) {
  return (
    <>
      {text
        .split(
          /('[^']*'|"[^"]*"|\b(?:import|from|export|function|const|let|return|if|else|async|await|true|false|null)\b|\/\/.*$)/g,
        )
        .map((part, i) => (
          <span
            key={i}
            className={
              /^['"]/.test(part)
                ? "token-string"
                : /^(import|from|export|function|const|let|return|if|else|async|await|true|false|null)$/.test(
                      part,
                    )
                  ? "token-keyword"
                  : part.startsWith("//")
                    ? "token-comment"
                    : ""
            }
          >
            {part}
          </span>
        ))}
    </>
  );
}
export default function DiffViewer({
  file,
  diff,
  loading,
  error,
  staged,
  onStage,
  onFull,
  onResolve,
  compact = false,
}: {
  file: string | null;
  diff: DiffData | null;
  loading?: boolean;
  error?: string;
  staged?: boolean;
  onStage?: () => void;
  onFull?: () => void;
  onResolve?: () => void;
  compact?: boolean;
}) {
  const [split, setSplit] = useState(() => {
    try {
      return localStorage.getItem("grove:diffLayout") === "split";
    } catch {
      return false;
    }
  });
  const [wrap, setWrap] = useState(() => {
    try {
      return localStorage.getItem("grove:diffWrap") === "true";
    } catch {
      return false;
    }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem("grove:diffLayout", split ? "split" : "unified");
      localStorage.setItem("grove:diffWrap", String(wrap));
    } catch {}
  }, [split, wrap]);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      scrollRef.current.scrollLeft = 0;
    }
    setCopied(false);
  }, [file, staged]);
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => parseDiff(diff?.text || ""), [diff]);
  const additions = lines.filter((l) => l.type === "add").length;
  const deletions = lines.filter((l) => l.type === "delete").length;
  const pairs = useMemo(() => {
    const result: { left?: Line; right?: Line; hunk?: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.type === "hunk") result.push({ hunk: line.text });
      else if (line.type === "context")
        result.push({ left: line, right: line });
      else {
        const removed: Line[] = [];
        const added: Line[] = [];
        while (
          i < lines.length &&
          (lines[i].type === "delete" || lines[i].type === "add")
        ) {
          (lines[i].type === "delete" ? removed : added).push(lines[i]);
          i++;
        }
        i--;
        for (let j = 0; j < Math.max(removed.length, added.length); j++)
          result.push({ left: removed[j], right: added[j] });
      }
    }
    return result;
  }, [lines]);
  if (!file)
    return (
      <div className="diff-empty">
        <div className="diff-empty-symbol">
          <FileCode2 size={30} strokeWidth={1.3} />
        </div>
        <h3>Select a file to review</h3>
        <p>Review its diff, then check the files you want to commit.</p>
      </div>
    );
  return (
    <section
      className={`diff-panel ${compact ? "compact" : ""} ${wrap ? "wrap-lines" : ""}`}
      aria-label="File diff"
    >
      <div className="diff-heading">
        <div className="diff-filename">
          <FileIcon path={file} />
          <div className="diff-file-label">
            <strong>{file.split("/").pop()}</strong>
            <span title={file}>
              {file.includes("/")
                ? file.slice(0, file.lastIndexOf("/"))
                : "Repository root"}
            </span>
          </div>
          <span className="diff-stats">
            <span>+{additions}</span>
            <span>−{deletions}</span>
          </span>
        </div>
        <div className="diff-heading-actions">
          {onResolve && (
            <button className="button small" onClick={onResolve}>
              <PencilLine size={13} />
              Resolve
            </button>
          )}
          {onStage && (
            <button className="button small" onClick={onStage}>
              <Check size={13} />
              {staged ? "Unstage file" : "Stage file"}
            </button>
          )}
          <IconButton
            label={copied ? "File path copied" : "Copy file path"}
            onClick={() => {
              navigator.clipboard
                .writeText(file)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
                .catch(() => {});
            }}
          >
            {copied ? <CheckCheck size={15} /> : <Copy size={15} />}
          </IconButton>
        </div>
      </div>
      <div className="diff-subheading">
        <span className="diff-scope">
          {staged === undefined
            ? "Committed changes"
            : staged
              ? "Staged changes"
              : "Working changes"}
        </span>
        <div className="diff-view-controls">
          <IconButton
            label="Wrap long lines"
            aria-pressed={wrap}
            className={wrap ? "active" : ""}
            onClick={() => setWrap(!wrap)}
          >
            <WrapText size={16} />
          </IconButton>
          <div className="segmented" aria-label="Diff display">
            <button
              aria-label="Unified diff"
              aria-pressed={!split}
              className={!split ? "active" : ""}
              onClick={() => setSplit(false)}
            >
              <AlignLeft size={14} />
              <span>Unified</span>
            </button>
            <button
              aria-label="Split diff"
              aria-pressed={split}
              className={split ? "active" : ""}
              onClick={() => setSplit(true)}
            >
              <Columns2 size={14} />
              <span>Split</span>
            </button>
          </div>
        </div>
      </div>
      <div
        className="diff-scroll"
        ref={scrollRef}
        tabIndex={0}
        aria-label="Diff content"
      >
        {loading ? (
          <Loading label="Reading changes" />
        ) : error ? (
          <div className="inline-error" role="alert">
            {error}
          </div>
        ) : diff?.binary ? (
          <div className="diff-empty">
            <FileCode2 size={28} />
            <h3>Binary file changed</h3>
            <p>A text diff is not available for this file.</p>
          </div>
        ) : !lines.length ? (
          <div className="diff-empty">
            <Check size={26} />
            <h3>No text changes</h3>
            <p>
              {diff?.text ||
                "This file may only have permission or metadata changes."}
            </p>
          </div>
        ) : split ? (
          <div className="split-diff">
            {pairs.map((pair, i) =>
              pair.hunk ? (
                <div key={i} className="diff-hunk">
                  {pair.hunk}
                </div>
              ) : (
                <div key={i} className="split-row">
                  {(["left", "right"] as const).map((side) => {
                    const line = pair[side];
                    return (
                      <div
                        key={side}
                        className={`split-cell ${line?.type || "blank"}`}
                      >
                        <span className="line-number">
                          {side === "left" ? line?.old : line?.next}
                        </span>
                        <span className="line-sign">
                          {line?.type === "add"
                            ? "+"
                            : line?.type === "delete"
                              ? "−"
                              : " "}
                        </span>
                        <code>{line && <Code text={line.text} />}</code>
                      </div>
                    );
                  })}
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="unified-diff">
            {lines.map((line, i) =>
              line.type === "hunk" ? (
                <div key={i} className="diff-hunk">
                  <span>···</span>
                  {line.text}
                </div>
              ) : (
                <div key={i} className={`code-line ${line.type}`}>
                  <span className="line-number">{line.old}</span>
                  <span className="line-number">{line.next}</span>
                  <span className="line-sign">
                    {line.type === "add"
                      ? "+"
                      : line.type === "delete"
                        ? "−"
                        : ""}
                  </span>
                  <code>
                    <Code text={line.text} />
                  </code>
                </div>
              ),
            )}
          </div>
        )}
        {diff?.truncated &&
          (onFull ? (
            <button className="load-full" onClick={onFull}>
              <Expand size={14} />
              Diff preview shortened. Load expanded diff
            </button>
          ) : (
            <p className="large-diff-note">
              This diff exceeds the 16 MiB display limit. Inspect the remainder
              using Git or your editor.
            </p>
          ))}
      </div>
      <footer className="diff-footer">
        <span>
          <span className="tiny-dot" />
          {staged ? "Staged changes" : "Working tree"}
        </span>
        <span>
          {file.split(".").pop()?.toUpperCase()}
          <span className="footer-separator" />
          UTF-8
        </span>
      </footer>
    </section>
  );
}
