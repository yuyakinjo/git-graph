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
  /** 第二親以降 (マージの取り込み線) */
  isMerge: boolean;
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
  /** origin/HEAD が指す既定ブランチ (取れなければ main / master) */
  defaultBranch: string;
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

/** `git_tidy_plan` の判定 1 件 */
export interface TidyItem {
  kind: "branch" | "worktree" | "prune" | "fastForward";
  /** ブランチ名 / worktree のパス */
  target: string;
  /** 判定時の SHA。apply 時にずれていたら消さない */
  sha: string;
  /** true なら削除 (早送り) 候補 */
  remove: boolean;
  reason: string;
  prNumber: number | null;
  /** このブランチを消すには先に消す必要がある worktree のパス */
  requires: string | null;
  /** worktree のブランチ名 */
  branch: string | null;
}

export interface TidyPlan {
  main: string;
  upstream: string;
  /** gh が使えず PR の判定を省いたときの理由 */
  ghNote: string | null;
  items: TidyItem[];
}

export interface TidyResult {
  kind: TidyItem["kind"];
  target: string;
  ok: boolean;
  message: string;
}

/** recompose で組み直す対象のファイル (分岐点 → 最終状態) */
export interface ChangedFile {
  /** A / M / D / R / C / T */
  status: string;
  path: string;
  /** リネーム・コピー元 */
  origPath: string | null;
}

/** `recompose_context`: ブランチの変更一式。AI のプラン作成に使う */
export interface RecomposeContext {
  branch: string;
  /** いまチェックアウトしているブランチか (未コミットの変更も対象になる) */
  isHead: boolean;
  /** 既定ブランチ上での実行。新しいブランチ名も AI に考えさせる */
  compose: boolean;
  defaultBranch: string;
  /** 分岐点を求めた相手 (origin/main など) */
  baseRef: string;
  base: string;
  tip: string;
  tree: string;
  includesWorktree: boolean;
  files: ChangedFile[];
  diff: string;
  truncated: boolean;
  /** ブランチにある既存のコミットのメッセージ (古い順) */
  commits: string[];
  recentSubjects: string[];
}

/** AI が立てたコミットプラン */
export interface RecomposePlan {
  /** compose のときだけ: 新しいブランチ名の提案 */
  branch?: string;
  commits: { message: string; files: string[] }[];
}

export interface RecomposeOp {
  branch: string;
  base: string;
  tip: string;
  tree: string;
  newBranch: string;
  commits: { message: string; paths: string[] }[];
  deleteOriginal: boolean;
  resetDefault: boolean;
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
  statusCheckRollup?:
    | { state?: string; conclusion?: string; status?: string; name?: string }[]
    | null;
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

/** AI でコミットメッセージを作るときに渡す、次のコミットの中身 */
export interface CommitContext {
  diff: string;
  truncated: boolean;
  recentSubjects: string[];
  previousMessage: string | null;
}

/** AI で stash の名前を作るときに渡す、stash の中身 */
export interface StashContext {
  diff: string;
  truncated: boolean;
}

/** AI で PR のタイトルと本文を作るときに渡す、PR に含まれる変更 */
export interface PrContext {
  diff: string;
  truncated: boolean;
  /** PR に含まれるコミットのメッセージ (古い順) */
  commits: string[];
  /** リポジトリの PR テンプレート */
  template: string | null;
}

/** Rust 側で実行した外部コマンド (git / gh など) の記録 */
export interface CmdLog {
  /** 開始時刻 (エポックミリ秒) */
  time: number;
  cwd: string;
  program: string;
  args: string[];
  /** 終了コード。起動できなかったときは -1 */
  code: number;
  durationMs: number;
  stdout: string;
  stderr: string;
}
