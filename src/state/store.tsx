import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ThemedToken } from "shiki";
import { DEFAULT_CLAUDE_CODE_MODEL, isClaudeCodeModel, type ClaudeCodeModel } from "../lib/ai";
import { api } from "../lib/api";
import { parseDiff, tokenizeDiff, type DiffLine } from "../lib/diff";
import { DEFAULT_DIFF_THEME, isDiffTheme, type DiffTheme } from "../lib/highlight";
import { useInterval } from "../lib/effects";
import {
  GRAPH_LIMIT,
  GRAPH_PAGE,
  LAST_KEY,
  loadAvatars,
  loadPrs,
  loadRepo,
  type AvatarMap,
  type BootData,
  type RepoSnapshot,
} from "../lib/repo-data";
import { snapshotHash, type CachedRepo } from "../lib/snapshot-cache";
import { applyZoom, clampZoom, loadZoom, saveZoom } from "../lib/zoom";
import type {
  BranchInfo,
  CommitDetail,
  DiffFile,
  GhStatus,
  GraphData,
  ProjectEntry,
  PullRequest,
  RepoInfo,
  Selection,
  StashInfo,
  StatusData,
  TagInfo,
  TidyPlan,
  WorktreeInfo,
} from "../lib/types";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  detail?: string;
}

/** 差分を取得するための対象。選択操作と同時に確定させる。 */
export type DiffSource = "staged" | "unstaged" | "untracked" | "commit" | "stash";
export interface FileTarget {
  source: DiffSource;
  path: string;
  /** commit なら SHA、stash なら refname */
  ref?: string;
}

/** いま開いているファイルの差分。tokens は shiki のハイライトが間に合ったら入る。 */
export interface DiffState {
  text: string | null;
  lines: DiffLine[];
  tokens: ThemedToken[][] | null;
  loading: boolean;
}

const RECENT_KEY = "gitgraph.recent";
const TABS_KEY = "gitgraph.tabs";
const AUTOFETCH_KEY = "gitgraph.autofetch";
const AUTOFETCH_MS = 180_000;
// 設定 (Cmd+,) で決めるプロジェクト置き場と、その探索の深さ
const ROOTS_KEY = "gitgraph.projectRoots";
const DEPTH_KEY = "gitgraph.scanDepth";
const DEFAULT_DEPTH = 3;
// グラフ一覧の列。表示順もこの並びに合わせる。
const COLS_KEY = "gitgraph.graphColumns";
const COL_W_KEY = "gitgraph.graphColumnWidths";
const GRAPH_STYLE_KEY = "gitgraph.graphStyle";
// 差分ビューのシンタックスハイライトのテーマ
const DIFF_THEME_KEY = "gitgraph.diffTheme";
// AI (Claude Code) によるコミットメッセージ生成のモデル
const AI_CLI_MODEL_KEY = "gitgraph.aiClaudeCodeModel";
export type GraphStyle = "default" | "japanese-railway";

export const GRAPH_COLUMNS = [
  { key: "graph", label: "グラフ" },
  // 列ではなくグラフ内の見た目の切り替えだが、同じメニューで扱うためここに置く
  { key: "nodeAvatar", label: "ノード" },
  { key: "refs", label: "ブランチ" },
  // 独立した列ではなく、ブランチ列にタグを並べるかどうか
  { key: "tags", label: "タグ" },
  { key: "subject", label: "メッセージ" },
  { key: "author", label: "作者" },
  { key: "sha", label: "SHA" },
  { key: "date", label: "日時" },
] as const;

export type GraphColumnKey = (typeof GRAPH_COLUMNS)[number]["key"];
export type GraphColumns = Record<GraphColumnKey, boolean>;

const DEFAULT_COLUMNS = {
  ...Object.fromEntries(GRAPH_COLUMNS.map((c) => [c.key, true])),
  sha: false,
  author: false,
  nodeAvatar: false,
} as GraphColumns;

/** 幅を変えられる列。メッセージ列は残り幅を埋めるので含めない。 */
export const RESIZABLE_COLUMNS = ["refs", "graph", "author", "sha", "date"] as const;
export type GraphColumnWidthKey = (typeof RESIZABLE_COLUMNS)[number];
export type GraphColumnWidths = Record<GraphColumnWidthKey, number>;

/** グラフ列の 0 は「レーン数に合わせて自動」を表す。 */
export const DEFAULT_COLUMN_WIDTHS: GraphColumnWidths = {
  refs: 180,
  graph: 0,
  author: 170,
  sha: 74,
  date: 92,
};

export const MIN_COLUMN_WIDTHS: GraphColumnWidths = {
  // チェックアウト中 + 追跡リモートのアイコンだけのバッジ (約 45px) と左右余白が入る幅
  refs: 60,
  graph: 24,
  author: 60,
  sha: 48,
  date: 56,
};

export const MAX_COLUMN_WIDTH = 600;

export function clampColumnWidth(key: GraphColumnWidthKey, px: number): number {
  return Math.round(Math.min(Math.max(px, MIN_COLUMN_WIDTHS[key]), MAX_COLUMN_WIDTH));
}

export function loadColumnWidths(): GraphColumnWidths {
  const next = { ...DEFAULT_COLUMN_WIDTHS };
  try {
    const saved = JSON.parse(localStorage.getItem(COL_W_KEY) ?? "{}");
    if (!saved || typeof saved !== "object") return next;
    for (const key of RESIZABLE_COLUMNS) {
      const v = saved[key];
      // グラフ列だけは 0 (自動) も保存される値として認める
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      next[key] = v === 0 && key === "graph" ? 0 : clampColumnWidth(key, v);
    }
  } catch {
    /* 壊れていれば既定幅に戻す */
  }
  return next;
}

export function loadColumns(): GraphColumns {
  const next = { ...DEFAULT_COLUMNS };
  try {
    const saved = JSON.parse(localStorage.getItem(COLS_KEY) ?? "{}");
    if (!saved || typeof saved !== "object") return next;
    for (const c of GRAPH_COLUMNS) {
      if (typeof saved[c.key] === "boolean") next[c.key] = saved[c.key];
    }
  } catch {
    /* 壊れていれば標準表示 に戻す */
  }
  return next;
}

export function loadPaths(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function savePaths(key: string, paths: string[]) {
  localStorage.setItem(key, JSON.stringify(paths));
}

/** 内容が同じかを雑に比べる。state を差し替えるかどうかの判定だけに使う。 */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function hasChanges(status: StatusData | null): boolean {
  if (!status) return false;
  return status.staged.length + status.unstaged.length + status.conflicts.length > 0;
}

/** 再読込後も同じファイルを選び続けるため、新しい status から対象を引き直す。 */
export function resolveWipTarget(
  status: StatusData | null,
  path: string,
  prefer: DiffSource,
): FileTarget | null {
  if (!status) return null;
  const staged = status.staged.some((f) => f.path === path);
  const work =
    status.unstaged.find((f) => f.path === path) ?? status.conflicts.find((f) => f.path === path);
  const workTarget: FileTarget | null = work
    ? { source: work.untracked ? "untracked" : "unstaged", path }
    : null;
  if (prefer === "staged") return staged ? { source: "staged", path } : workTarget;
  return workTarget ?? (staged ? { source: "staged", path } : null);
}

export function useStoreValue(boot: BootData | null) {
  const [repo, setRepo] = useState<RepoInfo | null>(boot?.snapshot.repo ?? null);
  const [graph, setGraph] = useState<GraphData | null>(boot?.snapshot.graph ?? null);
  const [status, setStatus] = useState<StatusData | null>(boot?.snapshot.status ?? null);
  const [branches, setBranches] = useState<BranchInfo[]>(boot?.snapshot.branches ?? []);
  const [tags, setTags] = useState<TagInfo[]>(boot?.snapshot.tags ?? []);
  const [stashes, setStashes] = useState<StashInfo[]>(boot?.snapshot.stashes ?? []);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>(boot?.snapshot.worktrees ?? []);
  const [gh, setGh] = useState<GhStatus | null>(boot?.gh ?? null);
  const [prs, setPrs] = useState<PullRequest[]>(boot?.prs ?? []);
  // 作者メール → GitHub アバター URL。リポジトリをまたいで持ち越す (解決済みは使い回す)。
  const [avatars, setAvatars] = useState<AvatarMap>(boot?.avatars ?? {});
  const [busy, setBusy] = useState<string | null>(null);
  // グラフの読み込み件数。下端に近づくたびに GRAPH_PAGE 件ずつ増やす。
  const [graphLimit, setGraphLimit] = useState(GRAPH_LIMIT);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  // 読み込み中のリポジトリのパス。押した直後から表示に出すための「仮のタブ」でもある。
  const [opening, setOpening] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recent, setRecent] = useState<string[]>(() => loadPaths(RECENT_KEY));
  // 開いているリポジトリのタブ。切り替えは openRepo での読み込み直し。
  const [tabs, setTabs] = useState<string[]>(() => {
    const saved = loadPaths(TABS_KEY);
    const root = boot?.snapshot.repo.root;
    const next = root && !saved.includes(root) ? [...saved, root] : saved;
    if (next !== saved) savePaths(TABS_KEY, next);
    return next;
  });
  // タブごとの「未コミット変更あり」。現在のタブ以外は最後に読んだ時点の情報。
  const [tabDirty, setTabDirty] = useState<Record<string, boolean>>({});
  const [autoFetch, setAutoFetch] = useState(() => localStorage.getItem(AUTOFETCH_KEY) !== "off");
  const [columns, setColumns] = useState<GraphColumns>(loadColumns);
  const [columnWidths, setColumnWidths] = useState<GraphColumnWidths>(loadColumnWidths);
  const [graphStyle, setGraphStyleState] = useState<GraphStyle>(() =>
    localStorage.getItem(GRAPH_STYLE_KEY) === "japanese-railway" ? "japanese-railway" : "default",
  );
  // 表示倍率。実際の反映は setZoom / 起動時の main.tsx で行う。
  const [zoom, setZoomState] = useState(loadZoom);

  // ---- 設定 (プロジェクト置き場) と、そこから見つけたリポジトリ ----
  const [projectRoots, setProjectRootsState] = useState<string[]>(() => loadPaths(ROOTS_KEY));
  const [scanDepth, setScanDepthState] = useState<number>(
    () => Number(localStorage.getItem(DEPTH_KEY)) || DEFAULT_DEPTH,
  );
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** マージ済みブランチ / worktree の整理ダイアログ。判定したリポジトリと結果を持つ */
  const [tidy, setTidy] = useState<{ dir: string; plan: TidyPlan } | null>(null);

  // ---- 選択 (どこを見ているか) と、その中身 ----
  const [selection, setSelection] = useState<Selection>({ kind: "wip" });
  const [commit, setCommit] = useState<CommitDetail | null>(null);
  const [stashFiles, setStashFiles] = useState<DiffFile[]>([]);
  const [file, setFile] = useState<FileTarget | null>(null);
  const [diff, setDiff] = useState<DiffState>({
    text: null,
    lines: [],
    tokens: null,
    loading: false,
  });
  /** 差分を全画面のダイアログで見ているか (ファイル行のクリックで開く) */
  const [diffModal, setDiffModal] = useState(false);
  const [diffTheme, setDiffThemeState] = useState<DiffTheme>(() => {
    const saved = localStorage.getItem(DIFF_THEME_KEY);
    return isDiffTheme(saved) ? saved : DEFAULT_DIFF_THEME;
  });

  const [aiCliModel, setAiCliModelState] = useState<ClaudeCodeModel>(() => {
    const saved = localStorage.getItem(AI_CLI_MODEL_KEY);
    return isClaudeCodeModel(saved) ? saved : DEFAULT_CLAUDE_CODE_MODEL;
  });

  const toastSeq = useRef(0);
  const detailSeq = useRef(0);
  const diffSeq = useRef(0);

  const dir = repo?.root ?? "";

  /**
   * 非同期処理から「今の値」を読むための参照。これらがあるおかげで
   * 各アクションを依存ゼロの安定した関数に保てる (= 再購読が要らない)。
   * await をまたいだ後も、呼び出し時点ではなく「その時の最新」が読める。
   *
   * アクション内で state と同時に書き換えてよい (再描画を待たずに読めるように)。
   * 描画中の書き換えは意図的なパターンなので react/refs は overrides で除外している。
   */
  const dirRef = useRef(dir);
  dirRef.current = dir;
  const ghRef = useRef(gh);
  ghRef.current = gh;
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const graphLimitRef = useRef(graphLimit);
  graphLimitRef.current = graphLimit;
  /** 追加読み込みの二重実行ガード (state の反映を待たずに判定する) */
  const moreRef = useRef(false);
  const selRef = useRef(selection);
  selRef.current = selection;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const fileRef = useRef(file);
  fileRef.current = file;
  const diffRef = useRef(diff);
  diffRef.current = diff;
  const diffThemeRef = useRef(diffTheme);
  diffThemeRef.current = diffTheme;
  const rootsRef = useRef(projectRoots);
  rootsRef.current = projectRoots;
  const depthRef = useRef(scanDepth);
  depthRef.current = scanDepth;
  const scanSeq = useRef(0);
  const openSeq = useRef(0);

  /**
   * リポジトリ (root) ごとの読み取り結果 + 内容ハッシュ。
   * タブを閉じるまで持ち続け、切り替え時は「先に描画 → 裏で読み直し →
   * ハッシュが変わっていれば差し替え」に使う。
   * (useState の遅延初期化。ハッシュ計算を毎レンダーで走らせたくないので useRef は使わない)
   */
  const [cache] = useState<Map<string, CachedRepo>>(() => {
    const m = new Map<string, CachedRepo>();
    if (boot) {
      m.set(boot.snapshot.repo.root, {
        snapshot: boot.snapshot,
        hash: snapshotHash(boot.snapshot),
        graphLimit: GRAPH_LIMIT,
        gh: boot.gh,
        prs: boot.prs,
      });
    }
    return m;
  });
  /** いま state に載っているリポジトリ。ハッシュ比較はこれと合わせて見る。 */
  const shownRef = useRef<string>(boot?.snapshot.repo.root ?? "");

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { ...t, id }]);
    const ttl = t.kind === "error" ? 9000 : 3800;
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), ttl);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  /** 差分を取得して表示する。古いレスポンスは連番で破棄する。 */
  const openFile = useCallback(async (target: FileTarget | null) => {
    setFile(target);
    fileRef.current = target;
    const id = ++diffSeq.current;
    if (!target) {
      setDiff({ text: null, lines: [], tokens: null, loading: false });
      return;
    }
    setDiff((d) => ({ ...d, loading: true }));
    let text: string;
    try {
      text = await api.diffText(dirRef.current, target.source, target.path, target.ref);
    } catch {
      text = "";
    }
    if (diffSeq.current !== id) return;
    // まず素のテキストで出し、シンタックスハイライトは間に合った時点で乗せ替える
    // (shiki の文法は初回だけ動的 import が挟まるので、待たせない)。
    const lines = parseDiff(text);
    setDiff({ text, lines, tokens: null, loading: false });
    const tokens = await tokenizeDiff(lines, target.path, diffThemeRef.current);
    if (tokens && diffSeq.current === id) setDiff({ text, lines, tokens, loading: false });
  }, []);

  /** 選択を変える唯一の入口。選択と同時にその中身も取りに行く。 */
  const select = useCallback(
    async (next: Selection) => {
      setSelection(next);
      selRef.current = next;
      const id = ++detailSeq.current;
      setCommit(null);
      setStashFiles([]);
      setDiffModal(false);
      await openFile(null);

      if (next.kind === "wip") return;

      if (next.kind === "commit") {
        try {
          const d = await api.commitDetail(dirRef.current, next.sha);
          if (detailSeq.current !== id) return;
          setCommit(d);
          await openFile(
            d.files.length ? { source: "commit", path: d.files[0].path, ref: next.sha } : null,
          );
        } catch (e) {
          if (detailSeq.current === id) {
            toast({ kind: "error", title: "コミットを読み込めません", detail: String(e) });
          }
        }
        return;
      }

      try {
        const files = await api.stashFiles(dirRef.current, next.refname);
        if (detailSeq.current !== id) return;
        setStashFiles(files);
        await openFile(
          files.length ? { source: "stash", path: files[0].path, ref: next.refname } : null,
        );
      } catch {
        /* stash が消えている場合などは空表示のままでよい */
      }
    },
    [openFile, toast],
  );

  /**
   * スナップショットを state に反映し、キャッシュを更新する。
   * 返り値は「描画が変わったか」。表示中のリポジトリで内容ハッシュも同じなら
   * state を一切触らないので、再描画は起きない。
   */
  const applySnapshot = useCallback(
    (snap: RepoSnapshot, limit: number): boolean => {
      const root = snap.repo.root;
      const hash = snapshotHash(snap);
      const prev = cache.get(root);
      cache.set(root, {
        snapshot: snap,
        hash,
        graphLimit: limit,
        gh: prev?.gh ?? null,
        prs: prev?.prs ?? [],
      });
      dirRef.current = root;
      graphLimitRef.current = limit;
      setGraphLimit(limit);
      localStorage.setItem(LAST_KEY, root);
      if (shownRef.current === root && prev?.hash === hash) return false;
      shownRef.current = root;
      setRepo(snap.repo);
      setGraph(snap.graph);
      setStatus(snap.status);
      setBranches(snap.branches);
      setTags(snap.tags);
      setStashes(snap.stashes);
      setWorktrees(snap.worktrees);
      const dirtyNow = hasChanges(snap.status);
      setTabDirty((d) => (d[root] === dirtyNow ? d : { ...d, [root]: dirtyNow }));
      return true;
    },
    [cache],
  );

  /** gh status をキャッシュに覚えつつ、変わっていれば state にも反映する。 */
  const applyGh = useCallback(
    (root: string, ghState: GhStatus | null) => {
      const entry = cache.get(root);
      if (entry) entry.gh = ghState;
      if (shownRef.current !== root || sameJson(ghRef.current, ghState)) return;
      ghRef.current = ghState;
      setGh(ghState);
    },
    [cache],
  );

  /** アバターは表示に必須ではないので待たずに走らせ、届いた時点で差し込む。 */
  const refreshAvatars = useCallback((root: string, graph: GraphData | null) => {
    void loadAvatars(root, graph).then((found) => {
      if (Object.keys(found).length === 0) return;
      setAvatars((prev) => ({ ...prev, ...found }));
    });
  }, []);

  /** アバターのキャッシュを捨てて取り直す (設定から呼ぶ) */
  const clearAvatarCache = useCallback(async () => {
    try {
      await api.ghAvatarsClear();
      setAvatars({});
      refreshAvatars(dirRef.current, graphRef.current);
      toast({ kind: "success", title: "作者アイコンのキャッシュを消しました" });
    } catch (e) {
      toast({ kind: "error", title: "キャッシュを消せませんでした", detail: String(e) });
    }
  }, [refreshAvatars, toast]);

  const refreshPrs = useCallback(async () => {
    const root = dirRef.current;
    const next = await loadPrs(root, ghRef.current);
    const entry = cache.get(root);
    const same = entry ? sameJson(entry.prs, next) : false;
    if (entry) entry.prs = next;
    // 中身が同じ PR 一覧で state を差し替えると、それだけで一覧が再描画される
    if (!same) setPrs(next);
  }, [cache]);

  /**
   * グラフの続きを読む (無限スクロール)。
   * レーン (column) の割り当ては全件を通して決まるので、差分を足すのではなく
   * 件数を増やして Rust 側に引き直させる。件数が少ないうちは十分速い。
   */
  const loadMoreGraph = useCallback(async () => {
    const root = dirRef.current;
    if (!root || moreRef.current || !graphRef.current?.truncated) return;
    moreRef.current = true;
    setLoadingMore(true);
    const next = graphLimitRef.current + GRAPH_PAGE;
    try {
      const g = await api.graphLoad(root, next);
      // 読んでいる間にタブが変わっていたら捨てる
      if (dirRef.current !== root) return;
      graphLimitRef.current = next;
      setGraphLimit(next);
      graphRef.current = g;
      setGraph(g);
      const entry = cache.get(root);
      if (entry) {
        entry.snapshot = { ...entry.snapshot, graph: g };
        entry.hash = snapshotHash(entry.snapshot);
        entry.graphLimit = next;
      }
      refreshAvatars(root, g);
    } catch (e) {
      toast({ kind: "error", title: "コミットを追加で読めませんでした", detail: String(e) });
    } finally {
      moreRef.current = false;
      setLoadingMore(false);
    }
  }, [cache, refreshAvatars, toast]);

  const refresh = useCallback(
    async (opts: { silent?: boolean; withGh?: boolean; ifChanged?: boolean } = {}) => {
      const root = dirRef.current;
      if (!root) return;
      if (!opts.silent) setLoading(true);
      try {
        const limit = graphLimitRef.current;
        const snap = await loadRepo(root, limit);
        const changed = applySnapshot(snap, limit);
        // ifChanged (自動フェッチ) は、内容が変わっていなければ差分の引き直しもしない。
        // git 操作後の再読込では、status が同じでも作業ツリーの中身が変わっているので必ず引き直す。
        if (changed || !opts.ifChanged) {
          refreshAvatars(root, snap.graph);
          // WIP を見ている間は status の変化で差分も変わるので選択ファイルを引き直す
          if (selRef.current.kind === "wip") {
            const cur = fileRef.current;
            await openFile(cur ? resolveWipTarget(snap.status, cur.path, cur.source) : null);
          }
        }
        if (opts.withGh) {
          applyGh(root, await api.ghStatus(root).catch(() => null));
        }
        await refreshPrs();
      } catch (e) {
        toast({ kind: "error", title: "リポジトリの読み込みに失敗しました", detail: String(e) });
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [applyGh, applySnapshot, openFile, refreshAvatars, refreshPrs, toast],
  );

  const openRepo = useCallback(
    async (path: string) => {
      const id = ++openSeq.current;
      const cached = cache.get(path);
      // タブを戻したときは、そのタブで読み進めていた件数のまま復元する
      const limit = cached?.graphLimit ?? GRAPH_LIMIT;
      if (cached) {
        // キャッシュがあるタブは待たせずに描画する (この後で裏側から読み直す)
        if (applySnapshot(cached.snapshot, limit)) {
          ghRef.current = cached.gh;
          setGh(cached.gh);
          setPrs(cached.prs);
          refreshAvatars(path, cached.snapshot.graph);
          await select({ kind: "wip" });
        }
      } else {
        // キャッシュが無い時だけ「読み込み中」を出す (タブは連番ガードで追い越せる)
        setLoading(true);
        setOpening(path);
      }
      try {
        const snap = await loadRepo(path, limit);
        // 読んでいる間に別のタブへ移っていたら捨てる
        if (openSeq.current !== id) return;
        // ハッシュが同じなら applySnapshot は何もしない = 選択も差分もそのまま
        if (applySnapshot(snap, limit)) {
          refreshAvatars(snap.repo.root, snap.graph);
          await select({ kind: "wip" });
        }
        setRecent((prev) => {
          const next = [snap.repo.root, ...prev.filter((p) => p !== snap.repo.root)].slice(0, 8);
          savePaths(RECENT_KEY, next);
          return next;
        });
        if (!tabsRef.current.includes(snap.repo.root)) {
          const nextTabs = [...tabsRef.current, snap.repo.root];
          tabsRef.current = nextTabs;
          setTabs(nextTabs);
          savePaths(TABS_KEY, nextTabs);
        }
        // gh CLI は遅いことがあるので待たずに走らせ、届いた時点で反映する
        api
          .ghStatus(snap.repo.root)
          .then((ghState) => {
            applyGh(snap.repo.root, ghState);
            if (openSeq.current === id) return refreshPrs();
          })
          .catch(() => undefined);
      } catch (e) {
        toast({ kind: "error", title: "リポジトリを開けませんでした", detail: String(e) });
      } finally {
        if (openSeq.current === id) {
          setLoading(false);
          setOpening(null);
        }
      }
    },
    [applyGh, applySnapshot, cache, refreshAvatars, refreshPrs, select, toast],
  );

  const removeRecent = useCallback((path: string) => {
    setRecent((prev) => {
      const next = prev.filter((p) => p !== path);
      savePaths(RECENT_KEY, next);
      return next;
    });
  }, []);

  /** 最後のタブを閉じたときの状態。Welcome 画面に戻す。 */
  const clearRepo = useCallback(() => {
    setRepo(null);
    setGraph(null);
    setStatus(null);
    setBranches([]);
    setTags([]);
    setStashes([]);
    setWorktrees([]);
    setGh(null);
    setPrs([]);
    setSelection({ kind: "wip" });
    setCommit(null);
    setStashFiles([]);
    setFile(null);
    setDiff({ text: null, lines: [], tokens: null, loading: false });
    setGraphLimit(GRAPH_LIMIT);
    graphLimitRef.current = GRAPH_LIMIT;
    dirRef.current = "";
    shownRef.current = "";
    ghRef.current = null;
    selRef.current = { kind: "wip" };
    fileRef.current = null;
    localStorage.removeItem(LAST_KEY);
  }, []);

  /**
   * タブを閉じる。表示中のタブが閉じられたら、残った左隣のタブを読み込み直して開く。
   * (タブごとの状態は保持しない方針なので、切り替え = 再読み込み)
   */
  const closeTabs = useCallback(
    async (paths: string[]) => {
      const closing = new Set(paths);
      const cur = tabsRef.current;
      const next = cur.filter((p) => !closing.has(p));
      if (next.length === cur.length) return;
      tabsRef.current = next;
      setTabs(next);
      savePaths(TABS_KEY, next);
      // 閉じたタブのキャッシュは捨てる (開き直したら読み直す)
      for (const p of closing) cache.delete(p);
      if (!closing.has(dirRef.current)) return;
      const index = cur.indexOf(dirRef.current);
      const neighbor =
        cur
          .slice(0, index)
          .reverse()
          .find((p) => !closing.has(p)) ?? next[0];
      if (neighbor) await openRepo(neighbor);
      else clearRepo();
    },
    [cache, clearRepo, openRepo],
  );

  const closeTab = useCallback((path: string) => closeTabs([path]), [closeTabs]);

  /** git 操作の共通ラッパー: 実行 → トースト → 再読込 */
  const run = useCallback(
    async (
      label: string,
      fn: () => Promise<string>,
      opts: { successDetail?: boolean; silentSuccess?: boolean } = {},
    ): Promise<boolean> => {
      setBusy(label);
      try {
        const out = await fn();
        if (!opts.silentSuccess) {
          toast({
            kind: "success",
            title: `${label} 完了`,
            detail: opts.successDetail === false ? undefined : out?.trim() || undefined,
          });
        }
        return true;
      } catch (e) {
        toast({ kind: "error", title: `${label} に失敗しました`, detail: String(e) });
        return false;
      } finally {
        setBusy(null);
        await refresh({ silent: true });
      }
    },
    [refresh, toast],
  );

  const toggleAutoFetch = useCallback(() => {
    setAutoFetch((v) => {
      localStorage.setItem(AUTOFETCH_KEY, v ? "off" : "on");
      return !v;
    });
  }, []);

  // 自動フェッチ (3分間隔・サイレント)。外部タイマーの購読なので効果として扱う。
  useInterval(
    () => {
      api
        .fetch(dirRef.current, true)
        .then(() => refresh({ silent: true, ifChanged: true }))
        .catch(() => undefined); // オフライン時などは黙って無視
    },
    dir && autoFetch ? AUTOFETCH_MS : null,
  );

  /** 登録したプロジェクト置き場を走査する。古い結果は連番で破棄する。 */
  const scanProjects = useCallback(async () => {
    const id = ++scanSeq.current;
    const roots = rootsRef.current;
    if (!roots.length) {
      setProjects([]);
      setScanning(false);
      return;
    }
    setScanning(true);
    try {
      const found = await api.scanRepos(roots, depthRef.current);
      if (scanSeq.current === id) setProjects(found);
    } catch (e) {
      if (scanSeq.current === id) {
        toast({ kind: "error", title: "プロジェクトの検索に失敗しました", detail: String(e) });
      }
    } finally {
      if (scanSeq.current === id) setScanning(false);
    }
  }, [toast]);

  /** 設定の変更はそのまま保存し、続けて走査をやり直す。 */
  const setProjectRoots = useCallback(
    (roots: string[]) => {
      const next = roots.filter((p, i) => p && roots.indexOf(p) === i);
      rootsRef.current = next;
      setProjectRootsState(next);
      savePaths(ROOTS_KEY, next);
      void scanProjects();
    },
    [scanProjects],
  );

  const setScanDepth = useCallback(
    (depth: number) => {
      const next = Math.min(6, Math.max(1, Math.trunc(depth) || DEFAULT_DEPTH));
      depthRef.current = next;
      setScanDepthState(next);
      localStorage.setItem(DEPTH_KEY, String(next));
      void scanProjects();
    },
    [scanProjects],
  );

  /** 列の表示・非表示。切り替えるたびに保存する。 */
  const toggleColumn = useCallback((key: GraphColumnKey) => {
    setColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(COLS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetColumns = useCallback(() => {
    setColumns({ ...DEFAULT_COLUMNS });
    localStorage.setItem(COLS_KEY, JSON.stringify(DEFAULT_COLUMNS));
    setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS });
    localStorage.setItem(COL_W_KEY, JSON.stringify(DEFAULT_COLUMN_WIDTHS));
  }, []);

  /** 列幅を変える。ドラッグ中に何度も呼ばれるので、同じ値なら state を触らない。 */
  const setColumnWidth = useCallback((key: GraphColumnWidthKey, px: number) => {
    setColumnWidths((prev) => {
      // グラフ列の 0 (自動) だけは clamp せずそのまま通す
      const w = px === 0 && key === "graph" ? 0 : clampColumnWidth(key, px);
      if (prev[key] === w) return prev;
      const next = { ...prev, [key]: w };
      localStorage.setItem(COL_W_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  /** 表示倍率を変える。範囲外は丸める。 */
  const setZoom = useCallback((next: number) => {
    const z = clampZoom(next);
    setZoomState(z);
    saveZoom(z);
    applyZoom(z);
  }, []);

  /** テーマを変えたら、いま開いている差分だけその場で塗り直す。 */
  const setDiffTheme = useCallback(async (theme: DiffTheme) => {
    setDiffThemeState(theme);
    diffThemeRef.current = theme;
    localStorage.setItem(DIFF_THEME_KEY, theme);
    const { text, lines } = diffRef.current;
    const path = fileRef.current?.path;
    if (text === null || !lines.length) return;
    const id = ++diffSeq.current;
    const tokens = await tokenizeDiff(lines, path, theme);
    if (diffSeq.current === id) setDiff({ text, lines, tokens, loading: false });
  }, []);

  const setGraphStyle = useCallback((style: GraphStyle) => {
    setGraphStyleState(style);
    localStorage.setItem(GRAPH_STYLE_KEY, style);
  }, []);

  const setAiCliModel = useCallback((model: ClaudeCodeModel) => {
    setAiCliModelState(model);
    localStorage.setItem(AI_CLI_MODEL_KEY, model);
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const headBranch = useMemo(() => branches.find((b) => b.isHead) ?? null, [branches]);

  const dirty = useMemo(() => hasChanges(status), [status]);

  return {
    repo,
    dir,
    graph,
    status,
    branches,
    tags,
    stashes,
    worktrees,
    gh,
    prs,
    avatars,
    clearAvatarCache,
    selection,
    select,
    commit,
    stashFiles,
    file,
    openFile,
    diff,
    diffModal,
    setDiffModal,
    busy,
    loading,
    loadingMore,
    graphLimit,
    loadMoreGraph,
    opening,
    toasts,
    toast,
    dismissToast,
    recent,
    removeRecent,
    tabs,
    tabDirty,
    closeTab,
    closeTabs,
    openRepo,
    refresh,
    refreshPrs,
    setGh,
    run,
    headBranch,
    dirty,
    autoFetch,
    toggleAutoFetch,
    columns,
    toggleColumn,
    resetColumns,
    columnWidths,
    setColumnWidth,
    graphStyle,
    setGraphStyle,
    diffTheme,
    setDiffTheme,
    aiCliModel,
    setAiCliModel,
    zoom,
    setZoom,
    projectRoots,
    setProjectRoots,
    scanDepth,
    setScanDepth,
    projects,
    scanning,
    scanProjects,
    tidy,
    setTidy,
    settingsOpen,
    openSettings,
    closeSettings,
  };
}

export type Store = ReturnType<typeof useStoreValue>;

// Provider 本体は StoreProvider.tsx。Fast Refresh を効かせるため
// 「コンポーネントだけのファイル」と分けている (react/only-export-components)。
export const StoreCtx = createContext<Store | null>(null);

export function useStore(): Store {
  const v = useContext(StoreCtx);
  if (!v) throw new Error("StoreProvider の外で useStore が呼ばれました");
  return v;
}
