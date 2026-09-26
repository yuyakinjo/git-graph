import type { PullRequest } from "../lib/types";
import type { PaneWidth } from "../state/layout";
import { useStore } from "../state/store";
import { DetailPane } from "./DetailPane";
import { GraphPane } from "./GraphPane";
import { OpeningVeil } from "./OpeningVeil";
import { Sidebar } from "./Sidebar";
import { Splitter } from "./Splitter";

/** 角丸のカードとして浮かせる各ペインの箱 */
const PANE_BOX = "min-w-0 overflow-hidden rounded-lg";

/**
 * リポジトリを開いているときの本体。サイドバー・グラフ・詳細の 3 ペインを並べる。
 * 幅と詳細の開閉は App が持ち、リポジトリを閉じても保たれる。
 */
export function Workspace({
  sidebar,
  detail,
  detailOpen,
  onOpenDetail,
  onOpenPr,
}: {
  sidebar: PaneWidth;
  detail: PaneWidth;
  detailOpen: boolean;
  onOpenDetail: () => void;
  onOpenPr: (pr: PullRequest) => void;
}) {
  const s = useStore();
  return (
    <div className="relative flex min-h-0 flex-1 bg-bg-0 px-1.5">
      <div className={PANE_BOX} style={{ width: sidebar.width, flex: "0 0 auto" }}>
        <Sidebar onOpenPr={onOpenPr} />
      </div>
      <Splitter {...sidebar.handlers} />
      <div className={`${PANE_BOX} flex flex-auto`}>
        <GraphPane onOpenDetail={onOpenDetail} />
      </div>
      {detailOpen ? (
        <>
          <Splitter {...detail.handlers} />
          <div
            className={`${PANE_BOX} flex bg-bg-1`}
            style={{ width: detail.width, flex: "0 0 auto" }}
          >
            <DetailPane />
          </div>
        </>
      ) : null}
      {s.opening ? <OpeningVeil path={s.opening} /> : null}
    </div>
  );
}
