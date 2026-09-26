/**
 * ダッシュパネルに並べるダッシュボタンの候補と、その並び・履歴。
 *
 * グループごとに最大 DASH_MAX 個のボタンを選べる。選択 (並び順込み) と「最近使った」履歴、
 * 隠したバー、パネルの位置は localStorage に保存し、再起動後も復元する。
 */

export const DASH_MAX = 5;

/** ボタンを自分で選べるグループ。「最近使った」は履歴から自動で並ぶ。 */
export const DASH_GROUPS = ["git", "github", "ai", "custom"] as const;
export type DashGroup = (typeof DASH_GROUPS)[number];

/** パネルに積むバー。上から この順に並ぶ。 */
export const DASH_BARS = [...DASH_GROUPS, "recent"] as const;
export type DashBar = (typeof DASH_BARS)[number];

/** 表示名は i18n の dashButtons 辞書 (`m.dashButtons[id]`) から描画時に引く。 */
export const DASH_BUTTONS = {
  // ---- git
  fetch: { group: "git", icon: "fetch" },
  pull: { group: "git", icon: "pull" },
  push: { group: "git", icon: "push" },
  branch: { group: "git", icon: "branch" },
  stash: { group: "git", icon: "stash" },
  stashPop: { group: "git", icon: "pull" },
  worktree: { group: "git", icon: "worktree" },
  stageToggle: { group: "git", icon: "plus" },
  commit: { group: "git", icon: "commit" },
  // ---- github
  prCreate: { group: "github", icon: "pr" },
  prCurrent: { group: "github", icon: "external" },
  prList: { group: "github", icon: "pr" },
  ghRepo: { group: "github", icon: "github" },
  ghActions: { group: "github", icon: "clock" },
  ghIssues: { group: "github", icon: "external" },
  // ---- ai (Claude Code で生成してから確認ダイアログを開く)
  aiCommit: { group: "ai", icon: "commit" },
  aiAmend: { group: "ai", icon: "amend" },
  aiPrCreate: { group: "ai", icon: "pr" },
  /** 既定ブランチでは compose に表示が変わる */
  recompose: { group: "ai", icon: "layers" },
  // ---- custom (複合・派生操作)
  tidy: { group: "custom", icon: "sweep" },
  pullRebase: { group: "custom", icon: "pull" },
  forcePush: { group: "custom", icon: "push" },
  worktreePrune: { group: "custom", icon: "sweep" },
  remoteCreate: { group: "custom", icon: "remote" },
} as const satisfies Record<string, { group: DashGroup; icon: string }>;

export type DashButtonId = keyof typeof DASH_BUTTONS;

const isActionId = (v: unknown): v is DashButtonId =>
  typeof v === "string" && Object.hasOwn(DASH_BUTTONS, v);

export const DEFAULT_DASH: Record<DashGroup, DashButtonId[]> = {
  git: ["commit", "pull", "push"],
  github: ["prCreate"],
  ai: ["aiCommit", "aiPrCreate", "recompose"],
  custom: ["tidy"],
};

/** グループごとの候補 (定義順) */
export const actionsOf = (group: DashGroup) =>
  (Object.keys(DASH_BUTTONS) as DashButtonId[]).filter((id) => DASH_BUTTONS[id].group === group);

/** 保存値を「既知の id・所属グループ一致・重複なし・最大 DASH_MAX 個」に整える。 */
export function normalizeDash(saved: unknown): Record<DashGroup, DashButtonId[]> {
  const obj = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : null;
  const out = {} as Record<DashGroup, DashButtonId[]>;
  for (const g of DASH_GROUPS) {
    const raw = obj?.[g];
    if (!Array.isArray(raw)) {
      out[g] = [...DEFAULT_DASH[g]];
      continue;
    }
    const ids = new Set<DashButtonId>();
    for (const v of raw) if (isActionId(v) && DASH_BUTTONS[v].group === g) ids.add(v);
    out[g] = [...ids].slice(0, DASH_MAX);
  }
  return out;
}

/**
 * id をグループに出す / 外す。上限に達していて追加できないときは同じ配列を返す。
 * 追加するときは末尾に足す (並べ替えた順を崩さない)。
 */
export function toggleDash(ids: DashButtonId[], id: DashButtonId): DashButtonId[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  if (ids.length >= DASH_MAX) return ids;
  return [...ids, id];
}

/**
 * `id` を「元の並びで `index` 番目の前」へ動かす (`index === ids.length` なら末尾)。
 * 動かなければ同じ配列をそのまま返す。
 */
export function moveDash(ids: DashButtonId[], id: DashButtonId, index: number): DashButtonId[] {
  const from = ids.indexOf(id);
  if (from < 0 || index === from || index === from + 1) return ids;
  const next = ids.filter((x) => x !== id);
  next.splice(from < index ? index - 1 : index, 0, id);
  return next;
}

/** 使った id を履歴の先頭に置く (重複は除き、最大 DASH_MAX 件)。 */
export function pushRecent(recent: DashButtonId[], id: DashButtonId): DashButtonId[] {
  return [id, ...recent.filter((x) => x !== id)].slice(0, DASH_MAX);
}

export function normalizeRecent(saved: unknown): DashButtonId[] {
  if (!Array.isArray(saved)) return [];
  return [...new Set(saved.filter(isActionId))].slice(0, DASH_MAX);
}

/**
 * 「すべてステージ・すべてアンステージ」ボタンの向き。
 * 未ステージの変更 (未追跡・コンフリクト含む) が 1 つでもあれば "stage"、
 * すべてステージ済みなら "unstage"、変更が無ければ null。
 */
export function stageToggleMode(counts: {
  staged: number;
  unstaged: number;
  conflicts: number;
}): "stage" | "unstage" | null {
  if (counts.unstaged + counts.conflicts > 0) return "stage";
  if (counts.staged > 0) return "unstage";
  return null;
}

// ------------------------------------------------------------------ 永続化

const DASH_KEY = "gitsquid.dashButtons";
const RECENT_KEY = "gitsquid.dashRecent";
const POS_KEY = "gitsquid.dashPos";
const HIDDEN_KEY = "gitsquid.dashHiddenBars";

const readJson = (key: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
};

export const loadDash = () => normalizeDash(readJson(DASH_KEY));
export const saveDash = (v: Record<DashGroup, DashButtonId[]>) =>
  localStorage.setItem(DASH_KEY, JSON.stringify(v));

export const loadRecent = () => normalizeRecent(readJson(RECENT_KEY));
export const saveRecent = (v: DashButtonId[]) =>
  localStorage.setItem(RECENT_KEY, JSON.stringify(v));

/** 隠したバー。既知の id だけを残し、すべて隠れる値は捨てる (パネルが空にならないように)。 */
export function normalizeHiddenBars(saved: unknown): DashBar[] {
  if (!Array.isArray(saved)) return [];
  const hidden = DASH_BARS.filter((b) => saved.includes(b));
  return hidden.length < DASH_BARS.length ? hidden : [];
}

/** バーを出す / 隠す。最後の 1 本は隠さない (同じ配列を返す)。 */
export function toggleHiddenBar(hidden: DashBar[], bar: DashBar): DashBar[] {
  if (hidden.includes(bar)) return hidden.filter((b) => b !== bar);
  if (hidden.length + 1 >= DASH_BARS.length) return hidden;
  return DASH_BARS.filter((b) => b === bar || hidden.includes(b));
}

export const loadHiddenBars = () => normalizeHiddenBars(readJson(HIDDEN_KEY));
export const saveHiddenBars = (v: DashBar[]) => localStorage.setItem(HIDDEN_KEY, JSON.stringify(v));

export interface DashPos {
  x: number;
  y: number;
}

/** 位置は左上の座標。未保存 (null) なら画面下中央に置く。 */
export function loadDashPos(): DashPos | null {
  const v = readJson(POS_KEY) as Partial<DashPos> | null;
  return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x!, y: v.y! } : null;
}
export const saveDashPos = (p: DashPos) => localStorage.setItem(POS_KEY, JSON.stringify(p));

/** パネルが画面外へはみ出さないよう、左上座標を収める。 */
export function clampDashPos(
  p: DashPos,
  size: { w: number; h: number },
  view: { w: number; h: number },
  margin = 8,
): DashPos {
  const clamp = (v: number, max: number) => Math.max(margin, Math.min(v, max - margin));
  return { x: clamp(p.x, view.w - size.w), y: clamp(p.y, view.h - size.h) };
}
