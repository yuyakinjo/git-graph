/**
 * 複数のコンポーネントで使い回す Tailwind のクラス列。
 *
 * 同じプロパティのユーティリティを 1 つの要素に 2 つ並べると
 * どちらが勝つかは CSS の出力順まかせになるため、色・余白のように
 * バリアントで上書きしたいものは「基底に入れず、関数で出し分ける」。
 */

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

// ------------------------------------------------------------------ ボタン

const BTN_BASE =
  "inline-flex items-center gap-1.5 border cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-default";

const BTN_SIZE = {
  md: "h-[30px] px-3 rounded-md text-[12.5px]",
  tiny: "h-[23px] px-2 rounded-[5px] text-[11.5px]",
  big: "h-[38px] px-[18px] rounded-md text-[14px]",
} as const;

const BTN_VARIANT = {
  default: "bg-bg-3 border-line text-fg not-disabled:hover:bg-bg-4",
  primary: "bg-accent border-accent text-on-accent font-[650] not-disabled:hover:bg-accent-hover",
  danger: "bg-danger border-danger text-white not-disabled:hover:bg-danger-hover",
  ghost: "bg-transparent border-line text-fg not-disabled:hover:bg-bg-3",
  /** .btn.tiny.danger: 枠線だけの控えめな破壊操作 */
  outlineDanger: "bg-transparent border-red-45 text-red not-disabled:hover:bg-danger-hover",
} as const;

export function btn(
  variant: keyof typeof BTN_VARIANT = "default",
  size: keyof typeof BTN_SIZE = "md",
) {
  return cx(BTN_BASE, BTN_SIZE[size], BTN_VARIANT[variant]);
}

// ------------------------------------------------------------------ アイコンボタン

const ICON_BTN_BASE =
  "inline-flex items-center justify-center border-0 rounded-md cursor-pointer disabled:opacity-35 disabled:cursor-default not-disabled:hover:bg-bg-3 not-disabled:hover:text-fg";

/**
 * @param active ツールバーのトグルなど、有効状態をアクセント色で示す
 * @param on ポップオーバーを開いている間 (背景を敷いて前面に出す)
 */
export function iconBtn({
  tiny = false,
  active = false,
  on = false,
}: { tiny?: boolean; active?: boolean; on?: boolean } = {}) {
  return cx(
    ICON_BTN_BASE,
    tiny ? "w-[22px] h-[22px]" : "w-7 h-7",
    on ? "relative z-[82] bg-bg-3" : "bg-transparent",
    active || on ? "text-accent" : "text-fg-dim",
  );
}

// ------------------------------------------------------------------ 小さなピル

const MINI_PILL_BASE =
  "inline-flex items-center gap-0.5 flex-none py-px px-[5px] rounded-[7px] text-[10px] font-bold";

const MINI_PILL_TONE = {
  default: "bg-bg-3 text-fg-dim",
  ahead: "bg-green-15 text-green",
  behind: "bg-accent-15 text-accent",
  warn: "bg-red-15 text-red",
} as const;

export const miniPill = (tone: keyof typeof MINI_PILL_TONE = "default") =>
  cx(MINI_PILL_BASE, MINI_PILL_TONE[tone]);

// ------------------------------------------------------------------ チェック状態のドット

const CHECK_DOT_TONE = {
  none: "bg-transparent",
  pass: "bg-green",
  fail: "bg-red",
  pending: "bg-amber",
} as const;

export type CheckTone = keyof typeof CHECK_DOT_TONE;

export const checkDot = (tone: CheckTone) =>
  cx("w-[7px] h-[7px] rounded-full flex-none", CHECK_DOT_TONE[tone]);

// ------------------------------------------------------------------ コンテキストメニュー

/** メニューの外側クリック / Escape を受ける透明レイヤー */
export const ctxBackdrop = "fixed inset-0 z-[80] outline-none";

const MENU_SURFACE =
  "p-[5px] bg-pop border border-pop-line rounded-lg shadow-[0_16px_40px_rgba(0,0,0,0.5)]";

export const ctxMenu = `fixed z-[80] min-w-[210px] ${MENU_SURFACE}`;

/** グラフの列切り替えなど、トリガーの真下に出すポップオーバー */
export const popMenu = `absolute z-[81] top-[calc(100%+6px)] left-0 min-w-[170px] ${MENU_SURFACE}`;

const CTX_ITEM_BASE =
  "flex items-center gap-2 w-full h-[26px] px-2 bg-transparent border-0 rounded-[5px] text-[12.5px] text-left cursor-pointer disabled:opacity-35 disabled:cursor-default";

export const ctxItem = (danger = false) =>
  cx(
    CTX_ITEM_BASE,
    danger
      ? "text-danger-fg not-disabled:hover:bg-danger not-disabled:hover:text-white"
      : "text-fg not-disabled:hover:bg-accent not-disabled:hover:text-on-accent",
  );

export const ctxSep = "h-px mx-1.5 my-1 bg-pop-line";

/** アイコンの無い項目の字下げを揃える */
export const ctxIconGap = "w-[14px] flex-none";

// ------------------------------------------------------------------ 追加 / 削除行数

export const fstats = "inline-flex gap-[5px] flex-none text-[10.5px] not-italic";
export const fstatAdd = "text-green not-italic";
export const fstatDel = "text-red not-italic";

// ------------------------------------------------------------------ フォーム

export const dialogDesc = "mt-0 mx-0 mb-3 text-fg-dim text-[12px]";
export const hint = "text-fg-faint text-[11px] not-italic";
export const field = "flex flex-col gap-[5px]";
export const fieldLabel = "text-fg-dim text-[11.5px] font-semibold";
export const fieldInput =
  "w-full bg-bg-1 border border-line rounded-md text-fg px-[9px] py-[7px] outline-none focus:border-accent";
