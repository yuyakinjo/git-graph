export type RefKind = "head" | "remote" | "tag" | "stash" | "other";

export interface RefDeco {
  kind: RefKind;
  name: string;
  full: string;
  isHead: boolean;
}

export interface GraphCommit {
  hash: string;
  short: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
  refs: RefDeco[];
  row: number;
  column: number;
}

export interface GraphEdge {
  fromRow: number;
  fromCol: number;
  toRow: number; // -1 = 取得範囲外
  toCol: number;
  color: number;
}

export interface GraphData {
  commits: GraphCommit[];
  edges: GraphEdge[];
  maxColumn: number;
  truncated: boolean;
}

export interface RepoInfo {
  root: string;
  name: string;
  headBranch: string | null;
  headHash: string | null;
  detached: boolean;
  remotes: string[];
  isLinkedWorktree: boolean;
  state: "clean" | "merging" | "rebasing" | "cherry-picking" | "reverting" | "bisecting";
}

export interface FileEntry {
  path: string;
  origPath: string | null;
  indexStatus: string;
  workStatus: string;
  untracked: boolean;
  conflict: boolean;
}

export interface StatusData {
  staged: FileEntry[];
  unstaged: FileEntry[];
  conflicts: FileEntry[];
}

export interface BranchInfo {
  name: string;
  full: string;
  kind: "local" | "remote";
  hash: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  gone: boolean;
  isHead: boolean;
  committedAt: number;
  subject: string;
  worktreePath: string | null;
}

export interface TagInfo {
  name: string;
  hash: string;
  committedAt: number;
}

export interface StashInfo {
  index: number;
  name: string;
  hash: string;
  message: string;
  createdAt: number;
}

export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
  isMain: boolean;
  isCurrent: boolean;
}

export interface DiffFile {
  path: string;
  origPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface CommitDetail {
  hash: string;
  short: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  authorAt: number;
  committerName: string;
  committerAt: number;
  parents: string[];
  refs: string[];
  files: DiffFile[];
}

export interface GhStatus {
  installed: boolean;
  authenticated: boolean;
  login: string | null;
  repo: string | null;
  defaultBranch: string | null;
  url: string | null;
  message: string | null;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  author?: { login?: string };
  headRefName: string;
  baseRefName: string;
  url: string;
  updatedAt: string;
  createdAt: string;
  reviewDecision: string | null;
  mergeable: string | null;
  additions?: number;
  deletions?: number;
  statusCheckRollup?: { state?: string; conclusion?: string; status?: string; name?: string }[] | null;
}

/** 設定で登録したプロジェクト置き場から見つかった git リポジトリ。 */
export interface ProjectEntry {
  path: string;
  name: string;
  /** どの登録フォルダ配下か */
  root: string;
  /** root からの相対パス */
  rel: string;
}

export type Selection =
  | { kind: "wip" }
  | { kind: "commit"; sha: string }
  | { kind: "stash"; refname: string; message: string };
