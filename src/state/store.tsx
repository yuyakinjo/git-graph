import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import type {
  BranchInfo,
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

const RECENT_KEY = "gitgraph.recent";
const AUTOFETCH_KEY = "gitgraph.autofetch";
const LIMIT = 800;

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useStoreValue() {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [stashes, setStashes] = useState<StashInfo[]>([]);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [gh, setGh] = useState<GhStatus | null>(null);
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "wip" });
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [autoFetch, setAutoFetch] = useState(
    () => localStorage.getItem(AUTOFETCH_KEY) !== "off",
  );
  const toastSeq = useRef(0);

  const dir = repo?.root ?? "";

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { ...t, id }]);
    const ttl = t.kind === "error" ? 9000 : 3800;
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), ttl);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const refreshGraph = useCallback(async (root: string) => {
    const g = await api.graphLoad(root, LIMIT);
    setGraph(g);
  }, []);

  const refreshStatus = useCallback(async (root: string) => {
    setStatus(await api.statusLoad(root));
  }, []);

  const refreshPrs = useCallback(async (root: string, ghState: GhStatus | null) => {
    if (!ghState?.authenticated || !ghState.repo) {
      setPrs([]);
      return;
    }
    try {
      setPrs(await api.prList(root, "open", 30));
    } catch {
      setPrs([]);
    }
  }, []);

  const refresh = useCallback(
    async (opts: { silent?: boolean; withGh?: boolean } = {}) => {
      if (!dir) return;
      if (!opts.silent) setLoading(true);
      try {
        const [info, g, st, br, tg, sl, wt] = await Promise.all([
          api.repoOpen(dir),
          api.graphLoad(dir, LIMIT),
          api.statusLoad(dir),
          api.branchesLoad(dir),
          api.tagsLoad(dir),
          api.stashLoad(dir),
          api.worktreeLoad(dir),
        ]);
        setRepo(info);
        setGraph(g);
        setStatus(st);
        setBranches(br);
        setTags(tg);
        setStashes(sl);
        setWorktrees(wt);
        if (opts.withGh) {
          const ghState = await api.ghStatus(dir);
          setGh(ghState);
          await refreshPrs(dir, ghState);
        } else {
          await refreshPrs(dir, gh);
        }
      } catch (e) {
        toast({ kind: "error", title: "リポジトリの読み込みに失敗しました", detail: String(e) });
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [dir, gh, refreshPrs, toast],
  );

  const openRepo = useCallback(
    async (path: string) => {
      setLoading(true);
      try {
        const info = await api.repoOpen(path);
        setRepo(info);
        setSelection({ kind: "wip" });
        const [g, st, br, tg, sl, wt] = await Promise.all([
          api.graphLoad(info.root, LIMIT),
          api.statusLoad(info.root),
          api.branchesLoad(info.root),
          api.tagsLoad(info.root),
          api.stashLoad(info.root),
          api.worktreeLoad(info.root),
        ]);
        setGraph(g);
        setStatus(st);
        setBranches(br);
        setTags(tg);
        setStashes(sl);
        setWorktrees(wt);
        setRecent((prev) => {
          const next = [info.root, ...prev.filter((p) => p !== info.root)].slice(0, 8);
          localStorage.setItem(RECENT_KEY, JSON.stringify(next));
          return next;
        });
        api
          .ghStatus(info.root)
          .then((ghState) => {
            setGh(ghState);
            return refreshPrs(info.root, ghState);
          })
          .catch(() => undefined);
      } catch (e) {
        toast({ kind: "error", title: "リポジトリを開けませんでした", detail: String(e) });
      } finally {
        setLoading(false);
      }
    },
    [refreshPrs, toast],
  );

  const removeRecent = useCallback((path: string) => {
    setRecent((prev) => {
      const next = prev.filter((p) => p !== path);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

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

  // 自動フェッチ (3分間隔・サイレント)
  useEffect(() => {
    if (!dir || !autoFetch) return;
    const timer = window.setInterval(async () => {
      try {
        await api.fetch(dir, true);
        await refresh({ silent: true });
      } catch {
        /* オフライン時などは黙って無視 */
      }
    }, 180_000);
    return () => window.clearInterval(timer);
  }, [dir, autoFetch, refresh]);

  const headBranch = useMemo(
    () => branches.find((b) => b.isHead) ?? null,
    [branches],
  );

  const dirty = useMemo(() => {
    if (!status) return false;
    return status.staged.length + status.unstaged.length + status.conflicts.length > 0;
  }, [status]);

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
    setSelection,
    busy,
    loading,
    toasts,
    toast,
    dismissToast,
    recent,
    removeRecent,
    openRepo,
    refresh,
    refreshGraph,
    refreshStatus,
    refreshPrs: () => refreshPrs(dir, gh),
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("StoreProvider の外で useStore が呼ばれました");
  return v;
}
