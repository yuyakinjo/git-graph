import { useCallback, useRef, useState } from "react";
import { useWindowEvent } from "../lib/effects";
import {
  DASH_BARS,
  DASH_BUTTONS,
  DASH_GROUPS,
  DASH_MAX,
  DEFAULT_DASH,
  actionsOf,
  clampDashPos,
  loadDashPos,
  loadDash,
  loadHiddenBars,
  loadRecent,
  moveDash,
  pushRecent,
  saveDashPos,
  saveDash,
  saveHiddenBars,
  saveRecent,
  stageToggleMode,
  toggleDash,
  toggleHiddenBar,
  type DashBar,
  type DashPos,
  type DashButtonId,
  type DashGroup,
} from "../lib/dashButtons";
import { recomposeMode } from "../lib/recompose";
import { useActions } from "../state/actions";
import { useStore } from "../state/store";
import { Icon } from "./ui";
import { useDialogs, useMenu } from "./ui-context";

const BAR_META: Record<DashBar, { icon: string; title: string }> = {
  git: { icon: "branch", title: "git" },
  github: { icon: "github", title: "GitHub" },
  ai: { icon: "sparkle", title: "AI" },
  custom: { icon: "user", title: "カスタム" },
  recent: { icon: "clock", title: "最近使った操作" },
};

const BAR =
  "flex h-10 items-center gap-1 rounded-full border border-bolt-line bg-bolt py-1 pr-1.5 pl-1 text-on-bolt shadow-[0_12px_30px_rgba(0,0,0,0.45)]";
const GROUP_ICON =
  "flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-on-bolt/70 hover:bg-black/10 hover:text-on-bolt";
/** 無効でもドラッグで並べ替えられるよう、disabled ではなく aria-disabled で表す */
const ACTION =
  "relative flex h-8 cursor-pointer touch-none items-center gap-1.5 rounded-full border border-black/10 bg-black/10 px-3 text-[12.5px] whitespace-nowrap text-on-bolt not-aria-disabled:hover:bg-black/20 aria-disabled:cursor-default aria-disabled:opacity-45";
const BADGE = "rounded-lg bg-on-bolt px-[5px] py-px text-[10.5px] font-bold text-bolt not-italic";
const GRIP =
  "flex h-8 w-5 flex-none cursor-grab touch-none items-center justify-center rounded-md text-on-bolt/50 hover:text-on-bolt/80 active:cursor-grabbing";
/** これ以上動かしたらクリックではなくドラッグとみなす (px) */
const DRAG_THRESHOLD = 4;

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
 * git / GitHub / AI / カスタム / 最近使った のバーを縦に積み、⋮⋮ をドラッグして動かす。
 * バーを右クリック (または左端のアイコンをクリック) すると、出すボタンを最大 5 個まで選べる。
 * ボタンはドラッグで同じバーの中を並べ替えられ、バーごとに表示・非表示を切り替えられる。
 */
export function DashPanel({ onHide }: { onHide: () => void }) {
  const s = useStore();
  const act = useActions();
  const openMenu = useMenu();
  const dialogs = useDialogs();
  const [buttons, setButtons] = useState(loadDash);
  const [recent, setRecent] = useState(loadRecent);
  const [hidden, setHidden] = useState(loadHiddenBars);
  const [pos, setPos] = useState<DashPos | null>(loadDashPos);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const head = s.headBranch;
  const ghUrl = s.gh?.url ?? null;
  const busy = !s.repo || Boolean(s.busy);
  const currentPr = head ? s.prs.find((p) => p.headRefName === head.name) : undefined;
  const dirty =
    (s.status?.staged.length ?? 0) +
      (s.status?.unstaged.length ?? 0) +
      (s.status?.conflicts.length ?? 0) >
    0;
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
        return {
          run: act.fetch,
          disabled: busy,
          title: "git fetch --all --prune",
        };
      case "pull":
        return {
          run: () => act.pull(false),
          disabled: busy,
          badge: head?.behind,
          title: "git pull",
        };
      case "push":
        return {
          run: () => act.push(),
          disabled: busy,
          badge: head?.ahead,
          title: "git push",
        };
      case "branch":
        return {
          run: () => act.createBranch(),
          disabled: busy,
          title: "ブランチを作成",
        };
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
        return {
          run: act.worktreeAdd,
          disabled: busy,
          title: "git worktree add",
        };
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
      case "commit": {
        const staged = s.status?.staged.length ?? 0;
        const changed = (s.status?.unstaged.length ?? 0) + (s.status?.conflicts.length ?? 0);
        return {
          run: () => act.commitPrompt(),
          disabled: busy || staged + changed === 0,
          badge: staged,
          title:
            staged + changed === 0
              ? "変更はありません"
              : staged > 0
                ? `ステージ済みの ${staged} 件をコミット`
                : "すべての変更をステージしてコミット",
        };
      }
      case "aiCommit": {
        const staged = s.status?.staged.length ?? 0;
        const changed = (s.status?.unstaged.length ?? 0) + (s.status?.conflicts.length ?? 0);
        return {
          run: () => act.commitPrompt({ ai: true }),
          disabled: busy || staged + changed === 0,
          badge: staged,
          title:
            staged + changed === 0
              ? "変更はありません"
              : `${staged > 0 ? `ステージ済みの ${staged} 件` : "すべての変更"}から Claude Code でメッセージを生成してコミット`,
        };
      }
      case "aiAmend":
        return {
          run: () => act.commitPrompt({ ai: true, amend: true }),
          disabled: busy || !s.repo?.headHash,
          title: s.repo?.headHash
            ? "直前のコミット (+ ステージ済み) から Claude Code でメッセージを生成して修正"
            : "コミットがありません",
        };
      case "aiPrCreate":
        return {
          run: () => act.prCreate({ ai: true }),
          disabled: busy,
          title: "差分とコミットから Claude Code でタイトルと本文を生成して PR 作成",
        };
      case "recompose": {
        const mode = recomposeMode(s.repo, head, dirty);
        return {
          run: () => act.recompose(),
          disabled: busy || !mode,
          label: mode ?? undefined,
          title: !mode
            ? s.repo?.headBranch === s.repo?.defaultBranch
              ? "既定ブランチに未プッシュのコミットも作業中の変更もありません"
              : "チェックアウト中のブランチがありません (または操作の途中です)"
            : mode === "compose"
              ? "未プッシュのコミットと作業中の変更を、Claude Code が立てたプランで新しいブランチに切り出す"
              : "ブランチの変更を Claude Code が立てたプランでコミットし直し、新しいブランチに積む",
        };
      }
      case "prCreate":
        return { run: () => act.prCreate(), disabled: busy, title: "gh pr create" };
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
        return {
          run: act.tidy,
          disabled: busy,
          title: "マージ済みのブランチと worktree を整理",
        };
      case "pullRebase":
        return {
          run: () => act.pull(true),
          disabled: busy,
          title: "git pull --rebase",
        };
      case "forcePush":
        return {
          run: act.forcePush,
          disabled: busy,
          title: "git push --force-with-lease",
        };
      case "worktreePrune":
        return {
          run: act.worktreePrune,
          disabled: busy,
          title: "git worktree prune",
        };
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

  const toggleBar = (bar: DashBar) => {
    const next = toggleHiddenBar(hidden, bar);
    setHidden(next);
    saveHiddenBars(next);
  };

  const editMenu = (e: React.MouseEvent, bar: DashBar) => {
    e.preventDefault();
    const tail = [
      { separator: true },
      ...DASH_BARS.map((b) => ({
        label: `${BAR_META[b].title} バー`,
        icon: hidden.includes(b) ? undefined : "check",
        // 最後の 1 本は隠せない
        disabled: !hidden.includes(b) && hidden.length + 1 >= DASH_BARS.length,
        onClick: () => toggleBar(b),
      })),
      { separator: true },
      { label: "パネルを隠す", icon: "x", onClick: onHide },
    ];
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
      {
        label: "既定に戻す",
        icon: "fetch",
        onClick: () => updateDash(bar, DEFAULT_DASH[bar]),
      },
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
  const gripHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };

  // ---------------------------------------------------------- ボタンの並べ替え
  /** drop は「元の並びで何番目の前に落とすか」 */
  const [reorder, setReorder] = useState<{
    group: DashGroup;
    id: DashButtonId;
    drop: number;
  } | null>(null);
  const pending = useRef<{
    group: DashGroup;
    id: DashButtonId;
    x: number;
  } | null>(null);
  /** ドラッグ直後に飛んでくる click でボタンを実行しないための印 */
  const reordered = useRef(false);

  const dropIndexAt = (barEl: HTMLElement, x: number) => {
    let i = 0;
    for (const el of barEl.querySelectorAll<HTMLElement>("[data-dash-button]")) {
      const r = el.getBoundingClientRect();
      if (x > r.left + r.width / 2) i++;
    }
    return i;
  };

  const endReorder = () => {
    pending.current = null;
    setReorder(null);
  };

  const buttonDragProps = (group: DashGroup, id: DashButtonId) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      reordered.current = false;
      if (e.button !== 0) return;
      pending.current = { group, id, x: e.clientX };
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      const p = pending.current;
      const barEl = e.currentTarget.parentElement;
      if (!p || !barEl) return;
      if (!reordered.current) {
        if (Math.abs(e.clientX - p.x) < DRAG_THRESHOLD) return;
        reordered.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.classList.add("dragging");
      }
      const drop = dropIndexAt(barEl, e.clientX);
      setReorder((prev) =>
        prev?.id === p.id && prev.drop === drop ? prev : { group: p.group, id: p.id, drop },
      );
    },
    onPointerUp: () => {
      if (reorder)
        updateDash(reorder.group, moveDash(buttons[reorder.group], reorder.id, reorder.drop));
      document.body.classList.remove("dragging");
      endReorder();
    },
    onPointerCancel: () => {
      document.body.classList.remove("dragging");
      endReorder();
    },
  });

  /** 自分の前後に落としても並びは変わらないので、そのときは印を出さない */
  const dropMark = (group: DashGroup, id: DashButtonId): "before" | "after" | null => {
    if (!reorder || reorder.group !== group) return null;
    const ids = buttons[group];
    const from = ids.indexOf(reorder.id);
    if (reorder.drop === from || reorder.drop === from + 1) return null;
    const i = ids.indexOf(id);
    if (reorder.drop === i) return "before";
    if (reorder.drop === ids.length && i === ids.length - 1) return "after";
    return null;
  };

  // ウィンドウを縮めても画面外に取り残さない
  useWindowEvent("resize", () => setPos((p) => (p ? place(p) : p)));
  // 保存した位置が今のウィンドウの外 (前回はもっと大きい画面だった等) でも、出したときに画面内へ戻す
  const attach = useCallback((el: HTMLDivElement | null) => {
    ref.current = el;
    if (!el) return;
    setPos((p) => {
      if (!p) return p;
      const next = clampDashPos(
        p,
        { w: el.offsetWidth, h: el.offsetHeight },
        { w: window.innerWidth, h: window.innerHeight },
      );
      return next.x === p.x && next.y === p.y ? p : next;
    });
  }, []);

  // ダイアログ (フォーム / 確認) を開いている間は隠す
  if (dialogs.open) return null;

  const bars: { id: DashBar; ids: DashButtonId[] }[] = [
    ...DASH_GROUPS.map((g) => ({ id: g, ids: buttons[g] })),
    ...(recent.length ? [{ id: "recent" as const, ids: recent }] : []),
  ].filter((bar) => !hidden.includes(bar.id));

  return (
    <div
      ref={attach}
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
            // 「最近使った」は使った順に自動で並ぶので並べ替えない
            const group = bar.id === "recent" ? null : bar.id;
            const mark = group ? dropMark(group, id) : null;
            return (
              <button
                key={id}
                data-dash-button
                className={`${ACTION} ${reorder?.id === id && reorder.group === group ? "opacity-50" : ""}`}
                aria-disabled={sp.disabled || undefined}
                title={group ? `${sp.title ?? ""} (ドラッグで並べ替え)` : sp.title}
                {...(group ? buttonDragProps(group, id) : {})}
                onClick={() => {
                  if (reordered.current) {
                    reordered.current = false;
                    return;
                  }
                  if (!sp.disabled) invoke(id);
                }}
              >
                {mark ? (
                  <span
                    className={`pointer-events-none absolute top-0.5 bottom-0.5 w-0.5 rounded-full bg-on-bolt ${
                      mark === "before" ? "-left-[3px]" : "-right-[3px]"
                    }`}
                  />
                ) : null}
                <Icon name={sp.icon ?? a.icon} size={15} />
                <span>{sp.label ?? a.label}</span>
                {sp.badge ? <em className={BADGE}>{sp.badge}</em> : null}
              </button>
            );
          })}
          {bar.ids.length === 0 ? (
            <span className="px-1.5 text-[11.5px] text-on-bolt/60">右クリックでボタンを追加</span>
          ) : null}
          <div className={GRIP} title="ドラッグで移動" {...gripHandlers}>
            <GripDots />
          </div>
        </div>
      ))}
    </div>
  );
}
