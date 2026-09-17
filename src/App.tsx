import { useCallback, useEffect, useRef, useState } from "react";
import { DetailPane } from "./components/DetailPane";
import { GraphPane } from "./components/GraphPane";
import { PrModal } from "./components/PrModal";
import { Sidebar } from "./components/Sidebar";
import { StatusBar, Toolbar } from "./components/Toolbar";
import { Icon } from "./components/ui";
import { api } from "./lib/api";
import type { PullRequest } from "./lib/types";
import { useActions } from "./state/actions";
import { useStore } from "./state/store";

const SIDEBAR_KEY = "gitgraph.sidebarW";
const DETAIL_KEY = "gitgraph.detailW";

function useDrag(initial: number, key: string, min: number, max: number, invert = false) {
  const [w, setW] = useState(() => Number(localStorage.getItem(key)) || initial);
  const dragging = useRef(false);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.classList.add("dragging");
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      const next = invert ? window.innerWidth - e.clientX : e.clientX;
      setW(Math.min(max, Math.max(min, next)));
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove("dragging");
      setW((cur) => {
        localStorage.setItem(key, String(cur));
        return cur;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [invert, key, max, min]);

  return { w, onMouseDown };
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
  const sidebar = useDrag(248, SIDEBAR_KEY, 180, 420);
  const detail = useDrag(520, DETAIL_KEY, 340, 900, true);

  // 起動時: 前回開いていたリポジトリ、無ければ引数/カレントディレクトリを開く
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      const last = localStorage.getItem("gitgraph.last");
      if (last) {
        await s.openRepo(last);
        return;
      }
      const initial = await api.initialRepo().catch(() => null);
      if (initial) await s.openRepo(initial);
    })();
  }, [s]);

  useEffect(() => {
    if (s.repo) localStorage.setItem("gitgraph.last", s.repo.root);
  }, [s.repo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "o") {
        e.preventDefault();
        act.openFolder();
      } else if (e.key === "r") {
        e.preventDefault();
        s.refresh({ withGh: true });
      } else if (e.key === "s" && e.shiftKey) {
        e.preventDefault();
        act.stashPush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, s]);

  return (
    <div className="app">
      <Toolbar />
      {s.repo ? (
        <div className="main">
          <div style={{ width: sidebar.w, flex: "0 0 auto", minWidth: 0 }}>
            <Sidebar onOpenPr={setPr} />
          </div>
          <div className="splitter" onMouseDown={sidebar.onMouseDown} />
          <GraphPane />
          <div className="splitter" onMouseDown={detail.onMouseDown} />
          <div style={{ width: detail.w, flex: "0 0 auto", minWidth: 0, display: "flex" }}>
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
