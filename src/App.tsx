import { useCallback, useRef, useState } from "react";
import { DetailPane } from "./components/DetailPane";
import { GraphPane } from "./components/GraphPane";
import { PrModal } from "./components/PrModal";
import { Settings } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { StatusBar, Toolbar } from "./components/Toolbar";
import { btn, iconBtn } from "./components/classes";
import { Icon, Spinner } from "./components/ui";
import { api } from "./lib/api";
import { useWindowEvent } from "./lib/effects";
import type { PullRequest } from "./lib/types";
import { useActions } from "./state/actions";
import { useStore } from "./state/store";

const SIDEBAR_KEY = "gitgraph.sidebarW";
const DETAIL_KEY = "gitgraph.detailW";

/**
 * スプリッタの幅。ポインタキャプチャを使うので window 購読は不要で、
 * ドラッグ中のイベントはすべてスプリッタ要素自身に届く。
 */
function usePaneWidth(initial: number, key: string, min: number, max: number, invert = false) {
  const [width, setWidth] = useState(() => Number(localStorage.getItem(key)) || initial);
  const widthRef = useRef(width);
  widthRef.current = width;
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    document.body.classList.add("dragging");
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const next = invert ? window.innerWidth - e.clientX : e.clientX;
      setWidth(Math.min(max, Math.max(min, next)));
    },
    [invert, max, min],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove("dragging");
      e.currentTarget.releasePointerCapture(e.pointerId);
      localStorage.setItem(key, String(widthRef.current));
    },
    [key],
  );

  return {
    width,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}

function Welcome() {
  const s = useStore();
  const act = useActions();
  return (
    <div className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_30%_10%,#1d2735_0%,var(--color-bg-1)_60%)]">
      <div className="w-[480px] max-w-[88vw] text-center">
        <h1 className="mx-0 mt-0 mb-1.5 text-[26px] tracking-[-0.01em]">Git Graph</h1>
        <p className="mx-0 mt-0 mb-5 text-fg-dim">
          シンプルな操作に絞った git GUI。GitHub 操作は gh CLI を使います。
        </p>
        <button className={btn("primary", "big")} onClick={() => act.openFolder()}>
          <Icon name="folder" size={16} /> リポジトリを開く
        </button>
        {s.recent.length ? (
          <div className="mt-[26px] text-left">
            <h2 className="mx-0 mt-0 mb-1.5 text-[11px] tracking-[0.06em] text-fg-faint uppercase">
              最近開いたリポジトリ
            </h2>
            {s.recent.map((p) => (
              <div key={p} className="flex items-center gap-1">
                <button
                  className="flex h-[30px] min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-fg hover:bg-bg-2"
                  onClick={() => s.openRepo(p)}
                >
                  <Icon name="repo" size={14} />
                  <span className="flex-none font-semibold">{p.split("/").pop()}</span>
                  <span className="overflow-hidden font-mono text-[12px] text-ellipsis whitespace-nowrap text-fg-faint">
                    {p.replace(/^\/Users\/[^/]+/, "~")}
                  </span>
                </button>
                <button
                  className={iconBtn({ tiny: true })}
                  title="一覧から削除"
                  onClick={() => s.removeRecent(p)}
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** リポジトリを開いている間の表示。重いリポジトリでも押した手応えが残るようにする。 */
function Opening({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-line bg-bg-2 px-[18px] py-3.5 shadow-[0_18px_44px_rgba(0,0,0,0.45)]">
      <Spinner size={20} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-[13px]">{path.split("/").filter(Boolean).pop()}</strong>
        <span className="font-mono text-[11px] text-fg-faint">
          {path.replace(/^\/Users\/[^/]+/, "~")}
        </span>
      </div>
    </div>
  );
}

/** トーストの左端の線とアイコンの色を種類ごとに切り替える。 */
const TOAST_EDGE: Record<string, string> = {
  success: "border-l-green",
  error: "border-l-red",
  info: "border-l-accent",
};
const TOAST_ICON: Record<string, string> = {
  success: "text-green",
  error: "text-red",
  info: "text-accent",
};

function Toasts() {
  const s = useStore();
  return (
    <div className="fixed right-3.5 bottom-[34px] z-[90] flex max-w-[420px] flex-col gap-2">
      {s.toasts.map((t) => (
        <div
          key={t.id}
          className={`flex animate-toast-in cursor-pointer gap-[9px] rounded-lg border border-pop-line border-l-[3px] bg-pop px-3 py-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.45)] ${TOAST_EDGE[t.kind] ?? TOAST_EDGE.info}`}
          onClick={() => s.dismissToast(t.id)}
        >
          <Icon
            name={t.kind === "error" ? "x" : t.kind === "success" ? "check" : "commit"}
            size={14}
            className={TOAST_ICON[t.kind] ?? TOAST_ICON.info}
          />
          <div>
            <strong className="text-[12.5px] font-[650]">{t.title}</strong>
            {t.detail ? (
              <pre className="mx-0 mt-1 mb-0 max-h-[160px] overflow-auto font-mono text-[11px] break-words whitespace-pre-wrap text-fg-dim">
                {t.detail}
              </pre>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

const SPLITTER =
  "w-1 flex-none cursor-col-resize bg-line-soft transition-[background] duration-150 ease-[ease] hover:bg-accent";

/** リポジトリを開いている間、操作できないことを示す覆い。 */
const VEIL =
  "absolute inset-0 z-40 flex animate-veil-in items-center justify-center bg-veil backdrop-blur-[1.5px]";

export default function App() {
  const s = useStore();
  const act = useActions();
  const [pr, setPr] = useState<PullRequest | null>(null);
  const sidebar = usePaneWidth(248, SIDEBAR_KEY, 180, 420);
  const detail = usePaneWidth(520, DETAIL_KEY, 340, 900, true);

  // 一覧の情報ですぐ開き、詳細が届いたら差し替える (取得はクリック起点)
  const openPr = useCallback(
    async (target: PullRequest) => {
      setPr(target);
      const full = await api.prView(s.dir, target.number).catch(() => null);
      if (full) setPr((cur) => (cur?.number === target.number ? full : cur));
    },
    [s.dir],
  );

  useWindowEvent("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === "o") {
      e.preventDefault();
      act.openFolder();
    } else if (e.key === ",") {
      e.preventDefault();
      s.openSettings();
    } else if (e.key === "r") {
      e.preventDefault();
      s.refresh({ withGh: true });
    } else if (e.key === "s" && e.shiftKey) {
      e.preventDefault();
      act.stashPush();
    } else if (e.key === "w") {
      // タブがあるうちは Cmd+W をタブ閉じに使う (タブ 0 個なら通常のウィンドウ挙動)
      if (!s.dir) return;
      e.preventDefault();
      s.closeTab(s.dir);
    } else if (e.key >= "1" && e.key <= "9") {
      const target = s.tabs[Number(e.key) - 1];
      if (!target || target === s.dir) return;
      e.preventDefault();
      s.openRepo(target);
    }
  });

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <Toolbar />
      {s.repo ? (
        <div className="relative flex min-h-0 flex-1 bg-bg-1">
          <div style={{ width: sidebar.width, flex: "0 0 auto", minWidth: 0 }}>
            <Sidebar onOpenPr={openPr} />
          </div>
          <div className={SPLITTER} {...sidebar.handlers} />
          <GraphPane />
          <div className={SPLITTER} {...detail.handlers} />
          <div style={{ width: detail.width, flex: "0 0 auto", minWidth: 0, display: "flex" }}>
            <DetailPane />
          </div>
          {s.opening ? (
            <div className={VEIL}>
              <Opening path={s.opening} />
            </div>
          ) : null}
        </div>
      ) : s.opening ? (
        <div className="relative flex min-h-0 flex-1 bg-bg-1">
          <div className={`${VEIL} bg-bg-1 backdrop-blur-none`}>
            <Opening path={s.opening} />
          </div>
        </div>
      ) : (
        <Welcome />
      )}
      <StatusBar />
      <Toasts />
      {pr ? <PrModal pr={pr} onClose={() => setPr(null)} /> : null}
      {s.settingsOpen ? <Settings /> : null}
    </div>
  );
}
