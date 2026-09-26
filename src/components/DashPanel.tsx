import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWindowEvent } from "../lib/effects";
import {
  DASH_BARS,
  DASH_BUTTONS,
  DASH_GROUPS,
  DASH_MAX,
  DEFAULT_DASH,
  actionsOf,
  clampDashPos,
  isOverDock,
  loadDashFloating,
  loadDash,
  loadHiddenBars,
  loadRecent,
  moveDash,
  pushRecent,
  saveDashFloating,
  saveDash,
  saveHiddenBars,
  saveRecent,
  stageToggleMode,
  toggleDash,
  toggleHiddenBar,
  type DashBar,
  type DashFloating,
  type DashPos,
  type DashButtonId,
  type DashGroup,
} from "../lib/dashButtons";
import { recomposeMode } from "../lib/recompose";
import { useActions } from "../state/actions";
import { useStore } from "../state/store";
import { useT } from "../i18n";
import { Icon } from "./ui";
import { useDialogs, useMenu } from "./ui-context";

/** バーのアイコン。名前は i18n の dashPanel.bars から引く */
const BAR_ICON: Record<DashBar, string> = {
  git: "branch",
  github: "github",
  ai: "sparkle",
  custom: "user",
  recent: "clock",
};

const BAR =
  "flex h-10 flex-none items-center gap-1 rounded-full border border-bolt-line bg-bolt py-1 pr-1.5 pl-1 text-on-bolt";
/** 浮かせているときだけ影を落とす */
const FLOAT_SHADOW = "shadow-[0_12px_30px_rgba(0,0,0,0.45)]";
const GROUP_ICON =
  "flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-on-bolt/70 hover:bg-on-bolt/10 hover:text-on-bolt";
/** 無効でもドラッグで並べ替えられるよう、disabled ではなく aria-disabled で表す */
const ACTION =
  "relative flex h-8 cursor-pointer touch-none items-center gap-1.5 rounded-full border border-on-bolt/10 bg-on-bolt/10 px-3 text-[12.5px] whitespace-nowrap text-on-bolt not-aria-disabled:hover:bg-on-bolt/20 aria-disabled:cursor-default aria-disabled:opacity-45";
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
 *
 * ふだんはタイトルバー下の列 (DashDock の slot = dockEl) にドッキングし、バーを横一列に並べる。
 * バーの ⋮⋮ をつかんで列の外へ出すと、そのバーだけを取り出して浮かせられる。
 * 浮かせたバーは 1 本ずつ好きな位置に置け、列の上で離すとまたドッキングする。
 */
export function DashPanel({
  onHide,
  dockEl,
  onDockHover,
  floatingHidden,
}: {
  onHide: () => void;
  /** ドッキング先 (DashDock の slot)。まだ描かれていなければ null */
  dockEl: HTMLElement | null;
  /** 浮かせたバーをドラッグして列の上に来た / 離れたとき (列を光らせる) */
  onDockHover: (over: boolean) => void;
  /** モーダルを開いている間など。浮かせたバーだけを隠す */
  floatingHidden: boolean;
}) {
  const s = useStore();
  const act = useActions();
  const openMenu = useMenu();
  const dialogs = useDialogs();
  const m = useT();
  const d = m.dashPanel;
  const [buttons, setButtons] = useState(loadDash);
  const [recent, setRecent] = useState(loadRecent);
  const [hidden, setHidden] = useState(loadHiddenBars);
  const [floating, setFloating] = useState<DashFloating>(loadDashFloating);
  /** バーの要素 (ドッキング中も浮動中も) */
  const barRefs = useRef(new Map<DashBar, HTMLDivElement>());
  /** ⋮⋮ のドラッグ。dx / dy はつかんだ点からバー左上までのずれ */
  const drag = useRef<{
    bar: DashBar;
    dx: number;
    dy: number;
    x0: number;
    y0: number;
    moved: boolean;
  } | null>(null);

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
      title: ghUrl ? `${ghUrl}${path}` : d.notGitHubRepo,
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
          title: d.createBranch,
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
              label: d.unstageAll,
              icon: "minus",
              badge: s.status?.staged.length,
              title: d.unstageAllTitle,
            }
          : {
              run: act.stageAll,
              disabled: busy || !stageMode,
              label: d.stageAll,
              icon: "plus",
              badge: (s.status?.unstaged.length ?? 0) + (s.status?.conflicts.length ?? 0),
              title: stageMode ? d.stageAllTitle : d.noChanges,
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
              ? d.noChanges
              : staged > 0
                ? d.commitStaged(staged)
                : d.commitAll,
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
              ? d.noChanges
              : staged > 0
                ? d.aiCommitStaged(staged)
                : d.aiCommitAll,
        };
      }
      case "aiAmend":
        return {
          run: () => act.commitPrompt({ ai: true, amend: true }),
          disabled: busy || !s.repo?.headHash,
          title: s.repo?.headHash ? d.aiAmend : d.noCommits,
        };
      case "aiPrCreate":
        return {
          run: () => act.prCreate({ ai: true }),
          disabled: busy,
          title: d.aiPrCreate,
        };
      case "recompose": {
        const mode = recomposeMode(s.repo, head, dirty);
        return {
          run: () => act.recompose(),
          disabled: busy || !mode,
          label: mode ? d.recomposeLabel[mode] : undefined,
          title: !mode
            ? s.repo?.headBranch === s.repo?.defaultBranch
              ? d.recomposeNothingOnDefault
              : d.recomposeNoBranch
            : mode === "compose"
              ? d.composeTitle
              : d.recomposeTitle,
        };
      }
      case "prCreate":
        return { run: () => act.prCreate(), disabled: busy, title: "gh pr create" };
      case "prCurrent":
        return {
          run: () => currentPr && act.prOpen(currentPr),
          disabled: !currentPr,
          title: currentPr ? `#${currentPr.number} ${currentPr.title}` : d.noPrForBranch,
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
          title: d.tidyTitle,
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
          title: d.remoteCreateTitle,
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
        label: d.barToggle(d.bars[b]),
        icon: hidden.includes(b) ? undefined : "check",
        // 最後の 1 本は隠せない
        disabled: !hidden.includes(b) && hidden.length + 1 >= DASH_BARS.length,
        onClick: () => toggleBar(b),
      })),
      { separator: true },
      floating[bar]
        ? { label: d.dock, icon: "pull", onClick: () => dockBar(bar) }
        : { label: d.undock, icon: "push", onClick: () => undockBar(bar) },
      ...(Object.keys(floating).length > 1 || (Object.keys(floating).length === 1 && !floating[bar])
        ? [{ label: d.dockAll, icon: "pull", onClick: () => commitFloating({}) }]
        : []),
      { label: d.hidePanel, icon: "x", onClick: onHide },
    ];
    if (bar === "recent") {
      openMenu(e, [
        {
          label: d.clearHistory,
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
        label: m.dashButtons[id],
        icon: ids.includes(id) ? "check" : undefined,
        disabled: !ids.includes(id) && ids.length >= DASH_MAX,
        onClick: () => updateDash(bar, toggleDash(ids, id)),
      })),
      { separator: true },
      {
        label: d.resetToDefault,
        icon: "fetch",
        onClick: () => updateDash(bar, DEFAULT_DASH[bar]),
      },
      ...tail,
    ]);
  };

  // ---------------------------------------------------------- ドラッグ移動 / ドッキング
  const commitFloating = (next: DashFloating) => {
    setFloating(next);
    saveDashFloating(next);
  };

  /** バーが画面外へはみ出さないよう、左上座標を収める */
  const place = (bar: DashBar, p: DashPos) => {
    const el = barRefs.current.get(bar);
    if (!el) return p;
    return clampDashPos(
      p,
      { w: el.offsetWidth, h: el.offsetHeight },
      { w: window.innerWidth, h: window.innerHeight },
    );
  };

  const dockBar = (bar: DashBar) => {
    const next = { ...floating };
    delete next[bar];
    commitFloating(next);
  };

  /** メニューから取り出すときは、今いる場所の少し下に浮かせる */
  const undockBar = (bar: DashBar) => {
    const r = barRefs.current.get(bar)?.getBoundingClientRect();
    const p = r ? { x: r.left, y: r.bottom + 24 } : { x: 40, y: 120 };
    commitFloating({ ...floating, [bar]: place(bar, p) });
  };

  const overDock = (p: { x: number; y: number }) =>
    dockEl ? isOverDock(p, dockEl.getBoundingClientRect()) : false;

  // ドッキング / 取り出しで portal 先が変わるとバーの要素が作り直され、pointer capture が外れる。
  // そのため move / up は window で受ける。バーの形はどちらでも同じなので、つかんだ点のずれはそのまま使える。
  const onGripDown = (e: React.PointerEvent<HTMLDivElement>, bar: DashBar) => {
    if (e.button !== 0) return;
    const rect = barRefs.current.get(bar)?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    drag.current = {
      bar,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      x0: e.clientX,
      y0: e.clientY,
      moved: false,
    };
    document.body.classList.add("dragging");
  };
  useWindowEvent("pointermove", (e) => {
    const g = drag.current;
    if (!g) return;
    const p = { x: e.clientX, y: e.clientY };
    if (!g.moved) {
      if (Math.hypot(p.x - g.x0, p.y - g.y0) < DRAG_THRESHOLD) return;
      g.moved = true;
    }
    const over = overDock(p);
    // ドッキング中のバーは、列の中を動かしている間はそのまま
    if (!floating[g.bar] && over) return;
    setFloating((f) => ({ ...f, [g.bar]: place(g.bar, { x: p.x - g.dx, y: p.y - g.dy }) }));
    onDockHover(over);
  });
  const endDrag = (e: PointerEvent, cancel: boolean) => {
    const g = drag.current;
    if (!g) return;
    drag.current = null;
    document.body.classList.remove("dragging");
    onDockHover(false);
    if (!g.moved || !floating[g.bar]) return;
    if (!cancel && overDock({ x: e.clientX, y: e.clientY })) dockBar(g.bar);
    else saveDashFloating(floating);
  };
  useWindowEvent("pointerup", (e) => endDrag(e, false));
  useWindowEvent("pointercancel", (e) => endDrag(e, true));

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

  /** 浮かせたバーを画面内へ収め直す (変わらなければ同じオブジェクトを返す) */
  const clampAll = (f: DashFloating) => {
    let changed = false;
    const next: DashFloating = { ...f };
    for (const [bar, p] of Object.entries(f) as [DashBar, DashPos][]) {
      const q = place(bar, p);
      if (q.x !== p.x || q.y !== p.y) {
        next[bar] = q;
        changed = true;
      }
    }
    return changed ? next : f;
  };
  // ウィンドウを縮めても画面外に取り残さない
  useWindowEvent("resize", () => setFloating(clampAll));

  /** バーの要素を覚える (data-bar から id を引く)。同じ関数を使い回し、毎描画で付け外しされないようにする */
  const barRef = useCallback((el: HTMLDivElement | null) => {
    const bar = el?.dataset.bar as DashBar | undefined;
    if (!el || !bar) return;
    barRefs.current.set(bar, el);
    // 保存した位置が今のウィンドウの外 (前回はもっと大きい画面だった等) でも、出したときに画面内へ戻す
    setFloating(clampAll);
    return () => {
      if (barRefs.current.get(bar) === el) barRefs.current.delete(bar);
    };
  }, []);

  const bars: { id: DashBar; ids: DashButtonId[] }[] = [
    ...DASH_GROUPS.map((g) => ({ id: g, ids: buttons[g] })),
    ...(recent.length ? [{ id: "recent" as const, ids: recent }] : []),
  ].filter((bar) => !hidden.includes(bar.id));

  const barEl = (bar: { id: DashBar; ids: DashButtonId[] }) => (
    <div
      key={bar.id}
      ref={barRef}
      data-bar={bar.id}
      className={floating[bar.id] ? `${BAR} ${FLOAT_SHADOW}` : BAR}
      onContextMenu={(e) => editMenu(e, bar.id)}
    >
      <button
        className={GROUP_ICON}
        title={bar.id === "recent" ? d.bars.recent : d.barIconTitle(d.bars[bar.id])}
        onClick={(e) => editMenu(e, bar.id)}
      >
        <Icon name={BAR_ICON[bar.id]} size={17} />
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
            title={group ? d.dragToReorder(sp.title ?? "") : sp.title}
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
            <span>{sp.label ?? m.dashButtons[id]}</span>
            {sp.badge ? <em className={BADGE}>{sp.badge}</em> : null}
          </button>
        );
      })}
      {bar.ids.length === 0 ? (
        <span className="px-1.5 text-[11.5px] text-on-bolt/60">{d.emptyBar}</span>
      ) : null}
      <div
        data-grip
        className={GRIP}
        title={d.dragToMove}
        onPointerDown={(e) => onGripDown(e, bar.id)}
      >
        <GripDots />
      </div>
    </div>
  );

  const dockedBars = bars.filter((bar) => !floating[bar.id]);
  // ダイアログ (フォーム / 確認) やモーダルを開いている間は、浮かせたバーを隠す
  const floatingBars = dialogs.open || floatingHidden ? [] : bars.filter((bar) => floating[bar.id]);

  return (
    <>
      {dockEl && dockedBars.length
        ? createPortal(
            <div role="toolbar" aria-label={d.ariaLabel} className="flex items-center gap-2">
              {dockedBars.map(barEl)}
            </div>,
            dockEl,
          )
        : null}
      {floatingBars.length
        ? createPortal(
            <div role="toolbar" aria-label={d.floatingAriaLabel} className="contents">
              {floatingBars.map((bar) => {
                const p = floating[bar.id]!;
                return (
                  <div key={bar.id} className="fixed z-50" style={{ left: p.x, top: p.y }}>
                    {barEl(bar)}
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
