import { useRef, useState } from "react";
import { useWindowEvent } from "../lib/effects";
import {
  DASH_BUTTONS,
  DASH_GROUPS,
  DASH_MAX,
  DEFAULT_DASH,
  actionsOf,
  clampDashPos,
  loadDashPos,
  loadDash,
  loadRecent,
  pushRecent,
  saveDashPos,
  saveDash,
  saveRecent,
  stageToggleMode,
  toggleDash,
  type DashPos,
  type DashButtonId,
  type DashGroup,
} from "../lib/dashButtons";
import { useActions } from "../state/actions";
import { useStore } from "../state/store";
import { Icon } from "./ui";
import { useDialogs, useMenu } from "./ui-context";

type BarId = DashGroup | "recent";

const BAR_META: Record<BarId, { icon: string; title: string }> = {
  git: { icon: "branch", title: "git" },
  github: { icon: "github", title: "GitHub" },
  custom: { icon: "sparkle", title: "カスタム" },
  recent: { icon: "clock", title: "最近使った操作" },
};

const BAR =
  "flex h-10 items-center gap-1 rounded-full border border-pop-line bg-pop py-1 pr-1.5 pl-1 shadow-[0_12px_30px_rgba(0,0,0,0.45)]";
const GROUP_ICON =
  "flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-fg-dim hover:bg-bg-3 hover:text-fg";
const ACTION =
  "flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-bg-3 px-3 text-[12.5px] whitespace-nowrap text-fg not-disabled:hover:bg-bg-4 disabled:cursor-default disabled:opacity-40";
const BADGE = "rounded-lg bg-bg-1 px-[5px] py-px text-[10.5px] font-bold text-fg-dim not-italic";
const GRIP =
  "flex h-8 w-5 flex-none cursor-grab touch-none items-center justify-center rounded-md text-fg-faint hover:text-fg-dim active:cursor-grabbing";

/** ⋮⋮ (6 点) のつまみ */
function GripDots() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden="true">
      {[2, 7, 12].flatMap((y) => [
        <circle key={`l${y}`} cx="2" cy={y} r="1.3" />,
        <circle key={`r${y}`} cx="6" cy={y} r="1.3" />,
      ])}
    </svg>
  );
}

/**
 * いつでも押せるダッシュボタンを並べたダッシュパネル。
 * git / GitHub / カスタム / 最近使った のバーを縦に積み、⋮⋮ をドラッグして動かす。
 * バーを右クリック (または左端のアイコンをクリック) すると、出すボタンを最大 5 個まで選べる。
 */
export function DashPanel({ onHide }: { onHide: () => void }) {
  const s = useStore();
  const act = useActions();
  const openMenu = useMenu();
  const dialogs = useDialogs();
  const [buttons, setButtons] = useState(loadDash);
  const [recent, setRecent] = useState(loadRecent);
  const [pos, setPos] = useState<DashPos | null>(loadDashPos);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const head = s.headBranch;
  const ghUrl = s.gh?.url ?? null;
  const busy = !s.repo || Boolean(s.busy);
  const currentPr = head ? s.prs.find((p) => p.headRefName === head.name) : undefined;
  const stageMode = stageToggleMode({
    staged: s.status?.staged.length ?? 0,
    unstaged: s.status?.unstaged.length ?? 0,
    conflicts: s.status?.conflicts.length ?? 0,
  });

  /** 実行内容・無効条件・バッジ。表示名とアイコンは DASH_BUTTONS 側 (label / icon で上書き可)。 */
  const spec = (
    id: DashButtonId,
  ): {
    run: () => unknown;
    disabled?: boolean;
    badge?: number;
    title?: string;
    label?: string;
    icon?: string;
  } => {
    const web = (path: string) => ({
      run: () => ghUrl && act.webOpen(`${ghUrl}${path}`),
      disabled: !ghUrl,
      title: ghUrl ? `${ghUrl}${path}` : "GitHub リポジトリではありません",
    });
    switch (id) {
      case "fetch":
        return { run: act.fetch, disabled: busy, title: "git fetch --all --prune" };
      case "pull":
        return {
          run: () => act.pull(false),
          disabled: busy,
          badge: head?.behind,
          title: "git pull",
        };
      case "push":
        return { run: () => act.push(), disabled: busy, badge: head?.ahead, title: "git push" };
      case "branch":
        return { run: () => act.createBranch(), disabled: busy, title: "ブランチを作成" };
      case "stash":
        return {
          run: act.stashPush,
          disabled: busy,
          badge: s.stashes.length,
          title: "git stash push",
        };
      case "stashPop":
        return {
          run: () => s.stashes[0] && act.stashApply(s.stashes[0], true),
          disabled: busy || s.stashes.length === 0,
          title: "git stash pop",
        };
      case "worktree":
        return { run: act.worktreeAdd, disabled: busy, title: "git worktree add" };
      case "stageToggle":
        return stageMode === "unstage"
          ? {
              run: act.unstageAll,
              disabled: busy,
              label: "すべてアンステージ",
              icon: "minus",
              badge: s.status?.staged.length,
              title: "ステージ済みの変更をすべてアンステージ",
            }
          : {
              run: act.stageAll,
              disabled: busy || !stageMode,
              label: "すべてステージ",
              icon: "plus",
              badge: (s.status?.unstaged.length ?? 0) + (s.status?.conflicts.length ?? 0),
              title: stageMode ? "変更をすべてステージ (git add -A)" : "変更はありません",
            };
      case "prCreate":
        return { run: act.prCreate, disabled: busy, title: "gh pr create" };
      case "prCurrent":
        return {
          run: () => currentPr && act.prOpen(currentPr),
          disabled: !currentPr,
          title: currentPr
            ? `#${currentPr.number} ${currentPr.title}`
            : "このブランチの PR はありません",
        };
      case "prList":
        return web("/pulls");
      case "ghRepo":
        return web("");
      case "ghActions":
        return web("/actions");
      case "ghIssues":
        return web("/issues");
      case "tidy":
        return { run: act.tidy, disabled: busy, title: "マージ済みのブランチと worktree を整理" };
      case "pullRebase":
        return { run: () => act.pull(true), disabled: busy, title: "git pull --rebase" };
      case "forcePush":
        return { run: act.forcePush, disabled: busy, title: "git push --force-with-lease" };
      case "worktreePrune":
        return { run: act.worktreePrune, disabled: busy, title: "git worktree prune" };
      case "remoteCreate":
        return {
          run: act.remoteCreate,
          disabled: busy || Boolean(s.repo?.remotes.length),
          title: "GitHub に新規リポジトリを作って origin に登録",
        };
    }
  };

  const invoke = (id: DashButtonId) => {
    const next = pushRecent(recent, id);
    setRecent(next);
    saveRecent(next);
    void spec(id).run();
  };

  const updateDash = (group: DashGroup, ids: DashButtonId[]) => {
    const next = { ...buttons, [group]: ids };
    setButtons(next);
    saveDash(next);
  };

  const editMenu = (e: React.MouseEvent, bar: BarId) => {
    e.preventDefault();
    const tail = [{ separator: true }, { label: "パネルを隠す", icon: "x", onClick: onHide }];
    if (bar === "recent") {
      openMenu(e, [
        {
          label: "履歴を消去",
          icon: "trash",
          onClick: () => {
            setRecent([]);
            saveRecent([]);
          },
        },
        ...tail,
      ]);
      return;
    }
    const ids = buttons[bar];
    openMenu(e, [
      ...actionsOf(bar).map((id) => ({
        label: DASH_BUTTONS[id].label,
        icon: ids.includes(id) ? "check" : undefined,
        disabled: !ids.includes(id) && ids.length >= DASH_MAX,
        onClick: () => updateDash(bar, toggleDash(ids, id)),
      })),
      { separator: true },
      { label: "既定に戻す", icon: "fetch", onClick: () => updateDash(bar, DEFAULT_DASH[bar]) },
      ...tail,
    ]);
  };

  // ---------------------------------------------------------- ドラッグ移動
  const place = (p: DashPos) => {
    const el = ref.current;
    if (!el) return p;
    return clampDashPos(
      p,
      { w: el.offsetWidth, h: el.offsetHeight },
      { w: window.innerWidth, h: window.innerHeight },
    );
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    document.body.classList.add("dragging");
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPos(place({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    document.body.classList.remove("dragging");
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (pos) saveDashPos(pos);
  };
  const gripHandlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };

  // ウィンドウを縮めても画面外に取り残さない
  useWindowEvent("resize", () => setPos((p) => (p ? place(p) : p)));

  // ダイアログ (フォーム / 確認) を開いている間は隠す
  if (dialogs.open) return null;

  const bars: { id: BarId; ids: DashButtonId[] }[] = [
    ...DASH_GROUPS.map((g) => ({ id: g, ids: buttons[g] })),
    ...(recent.length ? [{ id: "recent" as const, ids: recent }] : []),
  ];

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="ダッシュパネル"
      className="fixed z-50 flex flex-col items-start gap-2"
      style={pos ? { left: pos.x, top: pos.y } : { left: "50%", bottom: 40, translate: "-50% 0" }}
    >
      {bars.map((bar) => (
        <div key={bar.id} className={BAR} onContextMenu={(e) => editMenu(e, bar.id)}>
          <button
            className={GROUP_ICON}
            title={`${BAR_META[bar.id].title}${bar.id === "recent" ? "" : " (クリックでボタンを選ぶ)"}`}
            onClick={(e) => editMenu(e, bar.id)}
          >
            <Icon name={BAR_META[bar.id].icon} size={17} />
          </button>
          {bar.ids.map((id) => {
            const a = DASH_BUTTONS[id];
            const sp = spec(id);
            return (
              <button
                key={id}
                className={ACTION}
                disabled={sp.disabled}
                title={sp.title}
                onClick={() => invoke(id)}
              >
                <Icon name={sp.icon ?? a.icon} size={15} />
                <span>{sp.label ?? a.label}</span>
                {sp.badge ? <em className={BADGE}>{sp.badge}</em> : null}
              </button>
            );
          })}
          {bar.ids.length === 0 ? (
            <span className="px-1.5 text-[11.5px] text-fg-faint">右クリックでボタンを追加</span>
          ) : null}
          <div className={GRIP} title="ドラッグで移動" {...gripHandlers}>
            <GripDots />
          </div>
        </div>
      ))}
    </div>
  );
}
