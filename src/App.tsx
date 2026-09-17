import { useCallback, useRef, useState } from "react";
import { DetailPane } from "./components/DetailPane";
import { GraphPane } from "./components/GraphPane";
import { PrModal } from "./components/PrModal";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { StatusBar, Toolbar } from "./components/Toolbar";
import { Icon } from "./components/ui";
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
    <div className="welcome">
      <div className="welcome-card">
        <h1>Git Graph</h1>
        <p>シンプルな操作に絞った git GUI。GitHub 操作は gh CLI を使います。</p>
        <button className="btn primary big" onClick={() => act.openFolder()}>
          <Icon name="folder" size={16} /> リポジトリを開く
        </button>
        {s.recent.length ? (
          <div className="recent">
            <h2>最近開いたリポジトリ</h2>
            {s.recent.map((p) => (
              <div key={p} className="recent-item">
                <button className="recent-open" onClick={() => s.openRepo(p)}>
                  <Icon name="repo" size={14} />
                  <span className="recent-name">{p.split("/").pop()}</span>
                  <span className="recent-path mono">{p.replace(/^\/Users\/[^/]+/, "~")}</span>
                </button>
                <button className="icon-btn tiny" title="一覧から削除" onClick={() => s.removeRecent(p)}>
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

function Toasts() {
  const s = useStore();
  return (
    <div className="toasts">
      {s.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => s.dismissToast(t.id)}>
          <Icon name={t.kind === "error" ? "x" : t.kind === "success" ? "check" : "commit"} size={14} />
          <div>
            <strong>{t.title}</strong>
            {t.detail ? <pre>{t.detail}</pre> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

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
    <div className="app">
      <TitleBar />
      <Toolbar />
      {s.repo ? (
        <div className="main">
          <div style={{ width: sidebar.width, flex: "0 0 auto", minWidth: 0 }}>
            <Sidebar onOpenPr={openPr} />
          </div>
          <div className="splitter" {...sidebar.handlers} />
          <GraphPane />
          <div className="splitter" {...detail.handlers} />
          <div style={{ width: detail.width, flex: "0 0 auto", minWidth: 0, display: "flex" }}>
            <DetailPane />
          </div>
        </div>
      ) : (
        <Welcome />
      )}
      <StatusBar />
      <Toasts />
      {pr ? <PrModal pr={pr} onClose={() => setPr(null)} /> : null}
    </div>
  );
}
