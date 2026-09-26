/**
 * 画面の配置にかかわる state (ペインの幅・ダッシュパネルの開閉とドック位置)。
 * どれも localStorage に残し、次回起動時も同じ配置で開く。
 */
import { useCallback, useRef, useState } from "react";
import { loadDashDockEdge, saveDashDockEdge, type DashDockEdge } from "../lib/dashButtons";

const SIDEBAR_KEY = "gitsquid.sidebarW";
const DETAIL_KEY = "gitsquid.detailW";
const DASH_OPEN_KEY = "gitsquid.dashPanel";

/**
 * スプリッタの幅。ポインタキャプチャを使うので window 購読は不要で、
 * ドラッグ中のイベントはすべてスプリッタ要素自身に届く。
 */
function usePaneWidth(initial: number, key: string, min: number, max: number, invert = false) {
  const [width, setWidth] = useState(() => Number(localStorage.getItem(key)) || initial);
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
      localStorage.setItem(key, String(width));
    },
    [key, width],
  );

  return {
    width,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}

export type PaneWidth = ReturnType<typeof usePaneWidth>;

/** 左のサイドバーの幅 */
export const useSidebarWidth = () => usePaneWidth(248, SIDEBAR_KEY, 180, 420);

/** 右の詳細ペインの幅。右端からつまむので向きを反転する */
export const useDetailWidth = () => usePaneWidth(520, DETAIL_KEY, 340, 900, true);

/** ダッシュパネルの開閉と、ドッキング先の列 (要素・位置・ドラッグ中の強調) */
export function useDashDock() {
  const [open, setOpen] = useState(() => localStorage.getItem(DASH_OPEN_KEY) !== "off");
  const toggle = useCallback(() => {
    setOpen((v) => {
      localStorage.setItem(DASH_OPEN_KEY, v ? "off" : "on");
      return !v;
    });
  }, []);
  const [dockEl, setDockEl] = useState<HTMLDivElement | null>(null);
  const [dockHover, setDockHover] = useState(false);
  const [dockEdge, setDockEdge] = useState(loadDashDockEdge);
  const moveDock = (edge: DashDockEdge) => {
    saveDashDockEdge(edge);
    setDockEdge(edge);
    setDockHover(false);
  };
  return { open, toggle, dockEl, setDockEl, dockHover, setDockHover, dockEdge, moveDock };
}
