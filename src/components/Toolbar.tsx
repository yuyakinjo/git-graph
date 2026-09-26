import { ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS, ZOOM_STEP, clampZoom, zoomLabel } from "../lib/zoom";
import type { DashDockEdge } from "../lib/dashButtons";
import { useActions } from "../state/actions";
import { useStore } from "../state/store";
import { useT } from "../i18n";
import { Icon, Spinner } from "./ui";
import { useDialogs, useMenu } from "./ui-context";

/** ステータスバーの各項目 */
const SB_ITEM = "inline-flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap";

/**
 * タイトルバー下、またはステータスバー上の列。DashPanel が slot へ portal で入る。
 * order で移動し、ドックとその中のボタンを作り直さない。
 * 取り出している間は空の列に戻し先のヒントを出し、右端には実行中の操作を出す。
 */
export function DashDock({
  slotRef,
  highlight,
  edge,
}: {
  slotRef: (el: HTMLDivElement | null) => void;
  highlight: boolean;
  edge: DashDockEdge;
}) {
  const s = useStore();
  const d = useT().dashPanel;
  return (
    <div
      data-dash-dock={edge}
      className={`flex h-10 flex-none items-center gap-2.5 border-line-soft bg-bg-0 px-2.5 ${edge === "bottom" ? "order-1 border-t" : "border-b"}`}
    >
      <div
        className={`relative flex h-full min-w-0 flex-1 items-center rounded-lg transition-colors ${
          highlight ? "bg-accent-soft ring-1 ring-accent/60 ring-inset" : ""
        }`}
      >
        <div
          ref={slotRef}
          className="peer flex h-full min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none]"
        />
        <span className="pointer-events-none absolute left-2 hidden text-[12px] text-fg-dim/60 peer-empty:inline">
          {d.dockHint}
        </span>
      </div>
      {s.busy ? (
        <span className="flex flex-none items-center gap-1.5 text-[12px] text-fg-dim">
          <Spinner /> {s.busy}
        </span>
      ) : null}
    </div>
  );
}

/** フッターの表示倍率。クリックでプリセットと数値指定のメニューを出す。 */
function ZoomStatus() {
  const s = useStore();
  const openMenu = useMenu();
  const dialogs = useDialogs();
  const m = useT().toolbar;

  const ask = async () => {
    const r = await dialogs.form({
      title: m.zoom,
      description: m.zoomRange(ZOOM_MIN * 100, ZOOM_MAX * 100),
      fields: [
        {
          name: "percent",
          label: m.zoomPercent,
          type: "text",
          value: String(Math.round(s.zoom * 100)),
          required: true,
          mono: true,
        },
      ],
      submitLabel: m.apply,
      width: 320,
    });
    const percent = Number(
      String(r?.percent ?? "")
        .replace("%", "")
        .trim(),
    );
    if (!r || !Number.isFinite(percent) || percent <= 0) return;
    s.setZoom(percent / 100);
  };

  const menu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: m.zoomIn, icon: "plus", onClick: () => s.setZoom(s.zoom + ZOOM_STEP) },
      { label: m.zoomOut, icon: "minus", onClick: () => s.setZoom(s.zoom - ZOOM_STEP) },
      { label: m.zoomReset, icon: "fetch", onClick: () => s.setZoom(1) },
      { separator: true },
      ...ZOOM_PRESETS.map((z) => ({
        label: zoomLabel(z),
        icon: clampZoom(s.zoom) === z ? "check" : undefined,
        onClick: () => s.setZoom(z),
      })),
      { separator: true },
      { label: m.zoomInput, icon: "amend", onClick: ask },
    ]);

  return (
    <button
      className={`${SB_ITEM} h-5 cursor-pointer rounded border-0 bg-transparent px-1.5 text-[11px] text-fg-dim tabular-nums hover:bg-bg-3`}
      title={m.zoomTitle}
      onClick={menu}
    >
      <Icon name="search" size={11} /> {zoomLabel(s.zoom)}
    </button>
  );
}

export function StatusBar() {
  const s = useStore();
  const act = useActions();
  const m = useT().toolbar;
  const ghUrl = s.gh?.url ?? null;
  return (
    <footer className="order-2 flex h-6 flex-none items-center gap-3.5 bg-bg-0 px-3 text-[11px] text-fg-dim">
      {s.gh?.repo ? (
        <button
          className={`${SB_ITEM} h-5 cursor-pointer rounded border-0 bg-transparent px-1.5 text-[11px] text-fg-dim hover:bg-bg-3 hover:text-fg disabled:cursor-default`}
          title={ghUrl ? m.openOnGitHub(ghUrl) : s.gh.repo}
          disabled={!ghUrl}
          onClick={() => ghUrl && act.webOpen(ghUrl)}
        >
          <Icon name="github" size={12} /> {s.gh.repo}
          {s.gh.login ? ` (${s.gh.login})` : ""}
        </button>
      ) : s.gh && !s.gh.installed ? (
        <span className={`${SB_ITEM} text-amber`}>{m.ghMissing}</span>
      ) : null}
      <span className={`${SB_ITEM} flex-1`} />
      <ZoomStatus />
      {s.graph ? <span className={SB_ITEM}>{m.commits(s.graph.commits.length)}</span> : null}
      {s.stashes.length ? <span className={SB_ITEM}>{m.stashes(s.stashes.length)}</span> : null}
      {s.repo?.headHash ? (
        <span className={`${SB_ITEM} font-mono text-[12px]`} title="HEAD">
          {s.repo.headHash.slice(0, 7)}
        </span>
      ) : null}
      {s.status ? (
        <span className={SB_ITEM}>
          {m.workingState(
            s.dirty ? s.status.staged.length + s.status.unstaged.length : null,
            s.status.conflicts.length,
          )}
        </span>
      ) : null}
    </footer>
  );
}
