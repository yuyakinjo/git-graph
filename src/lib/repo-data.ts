/**
 * React に依存しないデータ取得層。
 * 「何を読むか」をここに集約し、React 側は結果を受け取って描画するだけにする。
 */
import { api } from "./api";
import type {
  BranchInfo,
  GhStatus,
  GraphData,
  PullRequest,
  RepoInfo,
  StashInfo,
  StatusData,
  TagInfo,
  WorktreeInfo,
} from "./types";

export const GRAPH_LIMIT = 800;
export const LAST_KEY = "gitgraph.last";

/** リポジトリ 1 つ分の読み取り結果。store の state はこれをそのまま反映する。 */
export interface RepoSnapshot {
  repo: RepoInfo;
  graph: GraphData;
  status: StatusData;
  branches: BranchInfo[];
  tags: TagInfo[];
  stashes: StashInfo[];
  worktrees: WorktreeInfo[];
}

export interface BootData {
  snapshot: RepoSnapshot;
  gh: GhStatus | null;
  prs: PullRequest[];
  avatars: AvatarMap;
}

/** コミット作者のメール (小文字) → GitHub アバター URL。null は解決できなかった作者。 */
export type AvatarMap = Record<string, string | null>;

export async function loadRepo(path: string): Promise<RepoSnapshot> {
  const repo = await api.repoOpen(path);
  const root = repo.root;
  const [graph, status, branches, tags, stashes, worktrees] = await Promise.all([
    api.graphLoad(root, GRAPH_LIMIT),
    api.statusLoad(root),
    api.branchesLoad(root),
    api.tagsLoad(root),
    api.stashLoad(root),
    api.worktreeLoad(root),
  ]);
  return { repo, graph, status, branches, tags, stashes, worktrees };
}

/**
 * グラフに出てくる作者のアバターを引く。
 * 同じメールは 1 件に畳んでから 1 回の invoke にまとめる。実際の解決とキャッシュ
 * (プロセス内 + ディスク) は Rust 側が持つので、ここは毎回呼んでよい。
 */
export async function loadAvatars(root: string, graph: GraphData | null): Promise<AvatarMap> {
  if (!graph) return {};
  const seen = new Map<string, string>(); // email -> 手掛かりにするコミット SHA
  for (const c of graph.commits) {
    const email = c.authorEmail.trim().toLowerCase();
    if (email && !seen.has(email)) seen.set(email, c.hash);
  }
  if (seen.size === 0) return {};
  const queries = [...seen].map(([email, sha]) => ({ email, sha }));
  // gh が無い / GitHub 以外のリポジトリなら諦めてイニシャル表示のままにする
  return api.ghAvatars(root, queries).catch(() => ({}) as AvatarMap);
}

export async function loadPrs(root: string, gh: GhStatus | null): Promise<PullRequest[]> {
  if (!gh?.authenticated || !gh.repo) return [];
  return api.prList(root, "open", 30).catch(() => []);
}

/**
 * 起動時の初期読み込み。React のマウント前に完了させ、結果を初期 state として流し込む。
 * これにより「マウント後に useEffect で取りに行く」逆流が不要になる。
 */
export async function bootApp(): Promise<BootData | null> {
  const path = localStorage.getItem(LAST_KEY) ?? (await api.initialRepo().catch(() => null));
  if (!path) return null;
  try {
    const snapshot = await loadRepo(path);
    const root = snapshot.repo.root;
    localStorage.setItem(LAST_KEY, root);
    // gh status とアバター解決は独立しているので並べて走らせる
    const [gh, avatars] = await Promise.all([
      api.ghStatus(root).catch(() => null),
      loadAvatars(root, snapshot.graph),
    ]);
    return { snapshot, gh, prs: await loadPrs(root, gh), avatars };
  } catch {
    localStorage.removeItem(LAST_KEY);
    return null;
  }
}
