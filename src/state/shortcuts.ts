import { useWindowEvent } from "../lib/effects";
import { ZOOM_STEP, zoomKeyAction } from "../lib/zoom";
import { useActions } from "./actions";
import { useStore } from "./store";

/**
 * アプリ全体のキーボードショートカット。
 * Escape は入力欄・モーダルの外でだけ onEscape (詳細ペインを閉じる) に使う。
 */
export function useAppShortcuts({
  modalOpen,
  onEscape,
}: {
  modalOpen: boolean;
  onEscape: () => void;
}) {
  const s = useStore();
  const act = useActions();

  useWindowEvent("keydown", (e) => {
    if (
      e.key === "Escape" &&
      !e.defaultPrevented &&
      !modalOpen &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement)
    ) {
      onEscape();
      return;
    }
    if (!(e.metaKey || e.ctrlKey)) return;
    const zoomAct = zoomKeyAction(e);
    if (zoomAct) {
      e.preventDefault();
      s.setZoom(zoomAct === "reset" ? 1 : s.zoom + (zoomAct === "in" ? ZOOM_STEP : -ZOOM_STEP));
      return;
    }
    if (e.key === "o") {
      e.preventDefault();
      act.openFolder();
    } else if (e.key.toLowerCase() === "l" && e.shiftKey) {
      e.preventDefault();
      s.openLogs();
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
}
