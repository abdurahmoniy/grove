export interface Project {
  path: string;
  name: string;
}
export interface FileChange {
  path: string;
  originalPath?: string;
  index: string;
  worktree: string;
}
export interface Branch {
  name: string;
  current: boolean;
  remote: boolean;
  hash: string;
}
export interface Snapshot {
  root: string;
  branch: string;
  detached: boolean;
  upstream: string;
  ahead: number;
  behind: number;
  files: FileChange[];
  branches: Branch[];
  tags: string[];
  stashes: { ref: string; message: string }[];
  remotes: { name: string; url: string; pushUrls?: string[] }[];
  operation: string | null;
  user: { name: string; email: string };
}
export interface Commit {
  hash: string;
  shortHash: string;
  parents: string[];
  subject: string;
  body: string;
  author: string;
  email: string;
  date: string;
  refs: string[];
}
export interface CommitFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}
export interface CommitDetails {
  commit: Commit;
  files: CommitFile[];
}
export interface DiffData {
  text: string;
  binary: boolean;
  truncated: boolean;
}
export interface GeneratedCommitMessage {
  summary: string;
  description: string;
  fileCount: number;
  stagedFingerprint: string;
}
export interface ActionArgs {
  files?: string[];
  message?: string;
  name?: string;
  newName?: string;
  ref?: string;
  mode?: string;
  remote?: string;
  localBranch?: string;
  remoteBranch?: string;
  url?: string;
  includeUntracked?: boolean;
  setUpstream?: boolean;
  argv?: string[];
}
export interface Bridge {
  request<T = unknown>(
    method: string,
    payload?: Record<string, unknown>,
  ): Promise<T>;
  onChange?: (callback: () => void) => () => void;
}
declare global {
  interface Window {
    grove?: Bridge;
  }
}
