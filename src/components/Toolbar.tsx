import { ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS, ZOOM_STEP, clampZoom, zoomLabel } from "../lib/zoom";
import { useActions } from "../state/actions";
import { useStore } from "../state/store";
import { useT } from "../i18n";
import { iconBtn } from "./classes";
import { Icon, Spinner } from "./ui";
import { useDialogs, useMenu } from "./ui-context";

const TOOL_BASE =
  "flex h-[30px] cursor-pointer items-center gap-1.5 border-0 bg-transparent text-[12.5px] whitespace-nowrap not-disabled:hover:bg-bg-3 disabled:cursor-default disabled:opacity-40";
/** 単独のツールボタン */
const TOOL = `${TOOL_BASE} rounded-md px-2.5 text-fg`;
/** ドロップダウンと連結したときの左半分 */
const TOOL_SPLIT = `${TOOL_BASE} rounded-l-md rounded-r-none pr-1.5 pl-2.5 text-fg`;
/** ドロップダウンを開く右半分 */
const CARET = `${TOOL_BASE} rounded-r-md rounded-l-none px-[5px] text-fg-dim`;

const TOOL_BADGE =
  "rounded-lg bg-bg-3 px-[5px] py-px text-[10.5px] font-bold text-fg-dim not-italic";
const TOOL_BADGE_ACCENT =
  "rounded-lg bg-accent-soft px-[5px] py-px text-[10.5px] font-bold text-accent not-italic";

/** ステータスバーの各項目 */
const SB_ITEM = "inline-flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap";

export function Toolbar({
  dashOpen,
  onToggleDash,
}: {
  dashOpen: boolean;
  onToggleDash: () => void;
}) {
  const s = useStore();
  const act = useActions();
  const openMenu = useMenu();
  const m = useT().toolbar;
  const head = s.headBranch;

  const pullMenu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: m.pullMerge, icon: "pull", onClick: () => act.pull(false) },
      { label: m.pullRebase, icon: "pull", onClick: () => act.pull(true) },
      { separator: true },
      { label: m.fetchPrune, icon: "fetch", onClick: () => act.fetch() },
      { separator: true },
      { label: m.tidyMerged, icon: "sweep", onClick: () => act.tidy() },
    ]);

  const pushMenu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: m.push, icon: "push", onClick: () => act.push() },
      {
        label: m.forcePush,
        icon: "push",
        danger: true,
        onClick: () => act.forcePush(),
      },
    ]);

  const stashMenu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: m.stash, icon: "stash", onClick: () => act.stashPush() },
      {
        label: m.stashPop,
        icon: "pull",
        disabled: s.stashes.length === 0,
        onClick: () => s.stashes[0] && act.stashApply(s.stashes[0], true),
      },
      {
        label: m.stashApply,
        icon: "check",
        disabled: s.stashes.length === 0,
        onClick: () => s.stashes[0] && act.stashApply(s.stashes[0], false),
      },
    ]);

  const disabled = !s.repo || Boolean(s.busy);

  return (
    <header className="flex h-11.5 flex-none items-center gap-2.5 bg-bg-0 px-2.5">
      <div className="flex h-7.5 items-center gap-0.5">
        <button
          className={TOOL}
          disabled={disabled}
          onClick={() => act.fetch()}
          title="git fetch --all --prune"
        >
          <Icon name="fetch" />
          <span>{m.fetch}</span>
        </button>
        <div className="flex items-center">
          <button
            className={TOOL_SPLIT}
            disabled={disabled}
            onClick={() => act.pull(false)}
            title="git pull"
          >
            <Icon name="pull" />
            <span>{m.pull}</span>
            {head?.behind ? <em className={TOOL_BADGE}>{head.behind}</em> : null}
          </button>
          <button className={CARET} disabled={disabled} onClick={pullMenu}>
            <Icon name="chevronDown" size={11} />
          </button>
        </div>
        <div className="flex items-center">
          <button
            className={TOOL_SPLIT}
            disabled={disabled}
            onClick={() => act.push()}
            title="git push"
          >
            <Icon name="push" />
            <span>{m.push}</span>
            {head?.ahead ? <em className={TOOL_BADGE_ACCENT}>{head.ahead}</em> : null}
          </button>
          <button className={CARET} disabled={disabled} onClick={pushMenu}>
            <Icon name="chevronDown" size={11} />
          </button>
        </div>
      </div>

      <div className="flex h-7.5 items-center gap-0.5 border-l border-line pl-1.5">
        <button
          className={TOOL}
          disabled={disabled}
          onClick={() => act.createBranch()}
          title={m.createBranch}
        >
          <Icon name="branch" />
          <span>{m.branch}</span>
        </button>
        <div className="flex items-center">
          <button
            className={TOOL_SPLIT}
            disabled={disabled}
            onClick={() => act.stashPush()}
            title="git stash push"
          >
            <Icon name="stash" />
            <span>{m.stash}</span>
            {s.stashes.length ? <em className={TOOL_BADGE}>{s.stashes.length}</em> : null}
          </button>
          <button className={CARET} disabled={disabled} onClick={stashMenu}>
            <Icon name="chevronDown" size={11} />
          </button>
        </div>
        <button
          className={TOOL}
          disabled={disabled}
          onClick={() => act.worktreeAdd()}
          title="git worktree add"
        >
          <Icon name="worktree" />
          <span>{m.worktree}</span>
        </button>
        <button
          className={TOOL}
          disabled={disabled}
          onClick={() => act.prCreate()}
          title="gh pr create"
        >
          <Icon name="pr" />
          <span>{m.prCreate}</span>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {s.busy ? (
          <span className="flex items-center gap-1.5 text-[12px] text-fg-dim">
            <Spinner /> {s.busy}
          </span>
        ) : null}
        <button
          className={iconBtn({ active: dashOpen })}
          title={m.dashPanel(dashOpen)}
          onClick={onToggleDash}
        >
          <Icon name="bolt" size={15} className={dashOpen ? "text-bolt" : undefined} />
        </button>
        <button
          className={iconBtn()}
          title={m.reload}
          disabled={!s.repo}
          onClick={() => s.refresh({ withGh: true })}
        >
          {s.loading ? <Spinner size={15} /> : <Icon name="fetch" size={15} />}
        </button>
      </div>
    </header>
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
    <footer className="flex h-6 flex-none items-center gap-3.5 bg-bg-0 px-3 text-[11px] text-fg-dim">
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
