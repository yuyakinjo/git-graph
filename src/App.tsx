import { useCallback, useState } from "react";
import { DashPanel } from "./components/DashPanel";
import { Modals } from "./components/Modals";
import { OpeningVeil } from "./components/OpeningVeil";
import { TitleBar } from "./components/TitleBar";
import { Toasts } from "./components/Toasts";
import { DashDock, StatusBar } from "./components/Toolbar";
import { ProgressBar } from "./components/ui";
import { Welcome } from "./components/Welcome";
import { Workspace } from "./components/Workspace";
import { api } from "./lib/api";
import type { PullRequest } from "./lib/types";
import { useDashDock, useDetailWidth, useSidebarWidth } from "./state/layout";
import { useAppShortcuts } from "./state/shortcuts";
import { useStore } from "./state/store";

export default function App() {
  const s = useStore();
  const [pr, setPr] = useState<PullRequest | null>(null);
  const sidebar = useSidebarWidth();
  const [detailOpen, setDetailOpen] = useState(false);
  const detail = useDetailWidth();
  const dash = useDashDock();
  /** モーダル (差分・PR・設定・ログ・tidy・recompose) を開いている間はダッシュパネルを隠す */
  const modalOpen =
    s.diffModal ||
    s.settingsOpen ||
    s.logsOpen ||
    Boolean(s.tidy) ||
    Boolean(s.recompose) ||
    Boolean(pr);

  // 一覧の情報ですぐ開き、詳細が届いたら差し替える (取得はクリック起点)
  const openPr = useCallback(
    async (target: PullRequest) => {
      setPr(target);
      const full = await api.prView(s.dir, target.number).catch(() => null);
      if (full) setPr((cur) => (cur?.number === target.number ? full : cur));
    },
    [s.dir],
  );

  useAppShortcuts({ modalOpen, onEscape: () => setDetailOpen(false) });

  return (
    <div className="flex h-full flex-col overflow-clip">
      {s.busy ? <ProgressBar /> : null}
      <TitleBar dashOpen={dash.open} onToggleDash={dash.toggle} />
      <DashDock slotRef={dash.setDockEl} highlight={dash.dockHover} edge={dash.dockEdge} />
      {s.repo ? (
        <Workspace
          sidebar={sidebar}
          detail={detail}
          detailOpen={detailOpen}
          onOpenDetail={() => setDetailOpen(true)}
          onOpenPr={openPr}
        />
      ) : s.opening ? (
        <div className="relative flex min-h-0 flex-1 bg-bg-1">
          <OpeningVeil path={s.opening} solid />
        </div>
      ) : (
        <Welcome />
      )}
      <StatusBar />
      {s.repo && dash.open ? (
        <DashPanel
          onHide={dash.toggle}
          dockEl={dash.dockEl}
          dockEdge={dash.dockEdge}
          onMoveDock={dash.moveDock}
          onDockHover={dash.setDockHover}
          floatingHidden={modalOpen}
        />
      ) : null}
      <Toasts />
      <Modals pr={pr} onClosePr={() => setPr(null)} />
    </div>
  );
}
