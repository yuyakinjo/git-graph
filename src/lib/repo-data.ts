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
}

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
    const gh = await api.ghStatus(root).catch(() => null);
    return { snapshot, gh, prs: await loadPrs(root, gh) };
  } catch {
    localStorage.removeItem(LAST_KEY);
    return null;
  }
}
