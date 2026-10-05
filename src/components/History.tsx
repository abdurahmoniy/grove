import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  GitBranch,
  GitCommitHorizontal,
  Copy,
  ChevronRight,
  ChevronDown,
  Undo2,
  GitPullRequestArrow,
  RotateCcw,
  ArrowDown,
  Tag,
} from "lucide-react";
import { request, errorMessage } from "../api";
import type { ActionArgs, Commit, CommitDetails, DiffData } from "../types";
import {
  Avatar,
  Badge,
  EmptyState,
  FileIcon,
  IconButton,
  Loading,
  timeAgo,
} from "./ui";
import DiffViewer from "./DiffViewer";

const colors = ["#a9d5b4", "#b79ad7", "#e6b27e", "#79b4c7", "#d28e9b"];
function buildGraph(commits: Commit[]) {
  let lanes: string[] = [];
  return commits.map((commit) => {
    if (!lanes.includes(commit.hash)) lanes.push(commit.hash);
    const lane = lanes.indexOf(commit.hash);
    const before = [...lanes];
    const after = lanes.filter((hash) => hash !== commit.hash);
    commit.parents.forEach((parent, index) => {
      if (!after.includes(parent))
        after.splice(Math.min(lane + index, after.length), 0, parent);
    });
    const paths = before.flatMap((hash, i) =>
      hash === commit.hash
        ? commit.parents.map((parent) => ({
            from: i,
            to: after.indexOf(parent),
            starts: true,
            color: colors[i % colors.length],
          }))
        : [
            {
              from: i,
              to: after.indexOf(hash),
              starts: false,
              color: colors[i % colors.length],
            },
          ],
    );
    lanes = after;
    return { lane, paths, color: colors[lane % colors.length] };
  });
}
export default function History({
  path,
  revision,
  onOperation,
}: {
  path: string;
  revision: number;
  onOperation: (action: string, args?: ActionArgs) => void;
}) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState<CommitDetails | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => setFull(false), [file, selected]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const queryScope = useRef("");
  queryScope.current = JSON.stringify([path, search, revision]);
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setHasMore(false);
    setLoadingMore(false);
    const timer = setTimeout(() => {
      request<Commit[]>("history", { path, limit: 80, search })
        .then((data) => {
          if (cancelled) return;
          setCommits(data);
          setHasMore(data.length === 80);
          setSelected((previous) =>
            data.some((c) => c.hash === previous)
              ? previous
              : data[0]?.hash || null,
          );
          setError("");
        })
        .catch((e) => {
          if (!cancelled) setError(errorMessage(e));
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path, search, revision]);
  useEffect(() => {
    let cancelled = false;
    setDetails(null);
    setFile(null);
    if (selected)
      request<CommitDetails>("commitDetails", { path, hash: selected })
        .then((data) => {
          if (!cancelled) setDetails(data);
        })
        .catch((e) => {
          if (!cancelled) setError(errorMessage(e));
        });
    return () => {
      cancelled = true;
    };
  }, [path, selected]);
  useEffect(() => {
    let cancelled = false;
    setDiff(null);
    if (file && selected)
      request<DiffData>("diff", { path, file, commit: selected, full })
        .then((data) => {
          if (!cancelled) setDiff(data);
        })
        .catch((e) => {
          if (!cancelled) setError(errorMessage(e));
        });
    return () => {
      cancelled = true;
    };
  }, [path, file, selected, full]);
  const graph = useMemo(() => buildGraph(commits), [commits]);
  return (
    <div className="history-workspace">
      <section className="history-list">
        <div className="history-search">
          <Search size={16} />
          <input
            placeholder="Search commits, authors, or hashes…"
            aria-label="Search commits"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span>
            {busy
              ? "Loading…"
              : `${commits.length}${hasMore ? "+" : ""} commits`}
          </span>
        </div>
        <div className="history-columns">
          <span>GRAPH</span>
          <span>COMMIT</span>
          <span>AUTHOR</span>
          <span>WHEN</span>
        </div>
        <div className="history-scroll">
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          {busy ? (
            <Loading label="Reading commit history" />
          ) : !commits.length ? (
            <EmptyState
              title={search ? "No matching commits" : "A fresh beginning"}
              description={
                search
                  ? "Try a different message, author, or hash."
                  : "Your first commit will appear here."
              }
            />
          ) : (
            commits.map((commit, i) => (
              <button
                className={`commit-row ${selected === commit.hash ? "selected" : ""}`}
                aria-current={selected === commit.hash ? "true" : undefined}
                key={commit.hash}
                onClick={() => setSelected(commit.hash)}
              >
                <svg
                  className="commit-graph"
                  width="68"
                  height="66"
                  viewBox="0 0 68 66"
                  aria-hidden="true"
                >
                  {graph[i].paths.map((p, index) => (
                    <path
                      key={index}
                      d={
                        p.starts
                          ? `M${18 + p.from * 15},33 C${18 + p.from * 15},49 ${18 + p.to * 15},50 ${18 + p.to * 15},66`
                          : `M${18 + p.from * 15},0 C${18 + p.from * 15},33 ${18 + p.to * 15},33 ${18 + p.to * 15},66`
                      }
                      fill="none"
                      stroke={p.color}
                      strokeWidth="1.6"
                    />
                  ))}
                  <path
                    d={`M${18 + graph[i].lane * 15},0 V33`}
                    stroke={graph[i].color}
                    strokeWidth="1.6"
                  />
                  <circle
                    cx={18 + graph[i].lane * 15}
                    cy="33"
                    r={i === 0 ? 5 : 4}
                    stroke={graph[i].color}
                    fill="var(--surface)"
                    strokeWidth="2"
                  />
                </svg>
                <span className="commit-info">
                  <strong>{commit.subject}</strong>
                  <span>
                    <code>{commit.shortHash}</code>
                    {commit.refs.slice(0, 2).map((ref) => (
                      <Badge
                        key={ref}
                        tone={ref.startsWith("HEAD") ? "green" : ""}
                      >
                        <GitBranch size={10} />
                        {ref.replace("HEAD -> ", "").replace("tag: ", "")}
                      </Badge>
                    ))}
                  </span>
                </span>
                <span className="commit-author">
                  <Avatar name={commit.author} small />
                  <span>{commit.author.split(" ")[0]}</span>
                </span>
                <span className="commit-age">{timeAgo(commit.date)}</span>
              </button>
            ))
          )}
          {hasMore && (
            <button
              className="load-full"
              disabled={loadingMore || busy}
              onClick={async () => {
                const scope = queryScope.current;
                setLoadingMore(true);
                try {
                  const data = await request<Commit[]>("history", {
                    path,
                    skip: commits.length,
                    limit: 80,
                    search,
                  });
                  if (queryScope.current !== scope) return;
                  setCommits((current) => [
                    ...current,
                    ...data.filter(
                      (commit) =>
                        !current.some(
                          (existing) => existing.hash === commit.hash,
                        ),
                    ),
                  ]);
                  setHasMore(data.length === 80);
                } catch (e) {
                  if (queryScope.current === scope) setError(errorMessage(e));
                } finally {
                  if (queryScope.current === scope) setLoadingMore(false);
                }
              }}
            >
              <ArrowDown size={14} />
              {loadingMore ? "Loading…" : "Load more commits"}
            </button>
          )}
        </div>
        <div className="history-list-footer">
          <GitCommitHorizontal size={14} />
          <span>All branches</span>
          <span>Newest first</span>
        </div>
      </section>
      <section className={`commit-inspector ${file ? "showing-diff" : ""}`}>
        {file ? (
          <>
            <button className="back-to-commit" onClick={() => setFile(null)}>
              ← Commit details
            </button>
            <DiffViewer
              compact
              file={file}
              diff={diff}
              loading={!diff}
              error={error}
              onFull={full ? undefined : () => setFull(true)}
            />
          </>
        ) : details ? (
          <>
            <div className="inspector-label">
              <GitCommitHorizontal size={15} />
              COMMIT DETAILS
              <IconButton
                label="Copy commit hash"
                onClick={() => {
                  navigator.clipboard
                    .writeText(details.commit.hash)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    })
                    .catch(() => {});
                }}
              >
                <Copy size={14} />
              </IconButton>
            </div>
            <div className="commit-detail-body">
              <div className="commit-detail-ref">
                <code>{copied ? "Copied!" : details.commit.shortHash}</code>
                <Badge tone="green">Committed</Badge>
              </div>
              <h2>{details.commit.subject}</h2>
              {details.commit.body && (
                <p className="commit-body">{details.commit.body}</p>
              )}
              <div className="commit-byline">
                <Avatar name={details.commit.author} />
                <div>
                  <strong>{details.commit.author}</strong>
                  <span>
                    {new Date(details.commit.date).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
              <div className="commit-metadata">
                <span>Parents</span>
                <code>
                  {details.commit.parents
                    .map((p) => p.slice(0, 7))
                    .join(", ") || "Initial commit"}
                </code>
              </div>
              <div className="detail-files-heading">
                <strong>Changed files</strong>
                <span>{details.files.length}</span>
                <span className="diff-stats">
                  <span>
                    +{details.files.reduce((sum, f) => sum + f.additions, 0)}
                  </span>
                  <span>
                    −{details.files.reduce((sum, f) => sum + f.deletions, 0)}
                  </span>
                </span>
              </div>
              <div className="detail-files">
                {details.files.map((f) => (
                  <button key={f.path} onClick={() => setFile(f.path)}>
                    <FileIcon path={f.path} />
                    <span>{f.path}</span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            </div>
            <details className="commit-action-options">
              <summary>
                Commit actions <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div className="commit-operations">
                <button
                  className="button"
                  onClick={() =>
                    onOperation("cherry-pick", { ref: details.commit.hash })
                  }
                >
                  <GitPullRequestArrow size={14} />
                  Cherry-pick
                </button>
                <button
                  className="button"
                  onClick={() =>
                    onOperation("revert", { ref: details.commit.hash })
                  }
                >
                  <Undo2 size={14} />
                  Revert
                </button>
                <button
                  className="button"
                  onClick={() =>
                    onOperation("reset", { ref: details.commit.hash })
                  }
                >
                  <RotateCcw size={14} />
                  Reset to…
                </button>
                <button
                  className="button"
                  onClick={() =>
                    onOperation("tag-create", { ref: details.commit.hash })
                  }
                >
                  <Tag size={14} />
                  Tag
                </button>
              </div>
            </details>
          </>
        ) : selected ? (
          <Loading label="Reading commit" />
        ) : (
          <EmptyState
            title="No commit selected"
            description="Select a commit to see what changed."
          />
        )}
      </section>
    </div>
  );
}
