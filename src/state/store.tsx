import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import { useInterval } from "../lib/effects";
import {
  LAST_KEY,
  loadPrs,
  loadRepo,
  type BootData,
  type RepoSnapshot,
} from "../lib/repo-data";
import type {
  BranchInfo,
  CommitDetail,
  DiffFile,
  GhStatus,
  GraphData,
  PullRequest,
  RepoInfo,
  Selection,
  StashInfo,
  StatusData,
  TagInfo,
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

const RECENT_KEY = "gitgraph.recent";
const TABS_KEY = "gitgraph.tabs";
const AUTOFETCH_KEY = "gitgraph.autofetch";
const AUTOFETCH_MS = 180_000;

function loadPaths(key: string): string[] {
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

function hasChanges(status: StatusData | null): boolean {
  if (!status) return false;
  return status.staged.length + status.unstaged.length + status.conflicts.length > 0;
}

/** 再読込後も同じファイルを選び続けるため、新しい status から対象を引き直す。 */
function resolveWipTarget(
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
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
  const [autoFetch, setAutoFetch] = useState(
    () => localStorage.getItem(AUTOFETCH_KEY) !== "off",
  );

  // ---- 選択 (どこを見ているか) と、その中身 ----
  const [selection, setSelection] = useState<Selection>({ kind: "wip" });
  const [commit, setCommit] = useState<CommitDetail | null>(null);
  const [stashFiles, setStashFiles] = useState<DiffFile[]>([]);
  const [file, setFile] = useState<FileTarget | null>(null);
  const [diff, setDiff] = useState<{ text: string | null; loading: boolean }>({
    text: null,
    loading: false,
  });

  const toastSeq = useRef(0);
  const detailSeq = useRef(0);
  const diffSeq = useRef(0);

  const dir = repo?.root ?? "";

  // 非同期処理から「今の値」を読むための参照。これらがあるおかげで
  // 各アクションを依存ゼロの安定した関数に保てる (= 再購読が要らない)。
  const dirRef = useRef(dir);
  dirRef.current = dir;
  const ghRef = useRef(gh);
  ghRef.current = gh;
  const selRef = useRef(selection);
  selRef.current = selection;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const fileRef = useRef(file);
  fileRef.current = file;

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
      setDiff({ text: null, loading: false });
      return;
    }
    setDiff((d) => ({ text: d.text, loading: true }));
    try {
      const text = await api.diffText(dirRef.current, target.source, target.path, target.ref);
      if (diffSeq.current === id) setDiff({ text, loading: false });
    } catch {
      if (diffSeq.current === id) setDiff({ text: "", loading: false });
    }
  }, []);

  /** 選択を変える唯一の入口。選択と同時にその中身も取りに行く。 */
  const select = useCallback(
    async (next: Selection) => {
      setSelection(next);
      selRef.current = next;
      const id = ++detailSeq.current;
      setCommit(null);
      setStashFiles([]);
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

  const applySnapshot = useCallback((snap: RepoSnapshot) => {
    setRepo(snap.repo);
    setGraph(snap.graph);
    setStatus(snap.status);
    setBranches(snap.branches);
    setTags(snap.tags);
    setStashes(snap.stashes);
    setWorktrees(snap.worktrees);
    dirRef.current = snap.repo.root;
    setTabDirty((prev) => ({ ...prev, [snap.repo.root]: hasChanges(snap.status) }));
    localStorage.setItem(LAST_KEY, snap.repo.root);
  }, []);

  const refreshPrs = useCallback(async () => {
    setPrs(await loadPrs(dirRef.current, ghRef.current));
  }, []);

  const refresh = useCallback(
    async (opts: { silent?: boolean; withGh?: boolean } = {}) => {
      const root = dirRef.current;
      if (!root) return;
      if (!opts.silent) setLoading(true);
      try {
        const snap = await loadRepo(root);
        applySnapshot(snap);
        // WIP を見ている間は status の変化で差分も変わるので選択ファイルを引き直す
        if (selRef.current.kind === "wip") {
          const cur = fileRef.current;
          await openFile(cur ? resolveWipTarget(snap.status, cur.path, cur.source) : null);
        }
        if (opts.withGh) {
          const ghState = await api.ghStatus(root).catch(() => null);
          setGh(ghState);
          ghRef.current = ghState;
        }
        await refreshPrs();
      } catch (e) {
        toast({ kind: "error", title: "リポジトリの読み込みに失敗しました", detail: String(e) });
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [applySnapshot, openFile, refreshPrs, toast],
  );

  const openRepo = useCallback(
    async (path: string) => {
      setLoading(true);
      try {
        const snap = await loadRepo(path);
        applySnapshot(snap);
        await select({ kind: "wip" });
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
            setGh(ghState);
            ghRef.current = ghState;
            return refreshPrs();
          })
          .catch(() => undefined);
      } catch (e) {
        toast({ kind: "error", title: "リポジトリを開けませんでした", detail: String(e) });
      } finally {
        setLoading(false);
      }
    },
    [applySnapshot, refreshPrs, select, toast],
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
    setDiff({ text: null, loading: false });
    dirRef.current = "";
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
    [clearRepo, openRepo],
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
        .then(() => refresh({ silent: true }))
        .catch(() => undefined); // オフライン時などは黙って無視
    },
    dir && autoFetch ? AUTOFETCH_MS : null,
  );

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
    selection,
    select,
    commit,
    stashFiles,
    file,
    openFile,
    diff,
    busy,
    loading,
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
  };
}

export type Store = ReturnType<typeof useStoreValue>;

const Ctx = createContext<Store | null>(null);

export function StoreProvider({
  boot,
  children,
}: {
  boot: BootData | null;
  children: ReactNode;
}) {
  const value = useStoreValue(boot);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("StoreProvider の外で useStore が呼ばれました");
  return v;
}
