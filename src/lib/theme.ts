/**
 * アプリ全体の配色テーマ。
 *
 * 色の実体は styles.css にあり、テーマごとにキーカラー 7 色だけを持つ。
 * このファイルはテーマの一覧と、どれを <html> に当てるか (data-theme / data-scheme) だけを受け持つ。
 * scheme はそのテーマがダーク系かライト系か。残りのトークンの作り方と差分ハイライトの配色が変わる。
 */

export const THEMES = [
  { id: "dark", scheme: "dark" },
  { id: "light", scheme: "light" },
  { id: "nord", scheme: "dark" },
  { id: "dracula", scheme: "dark" },
  { id: "solarized", scheme: "light" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type ThemeScheme = (typeof THEMES)[number]["scheme"];
/** 設定のプルダウンでグループにまとめる順 */
export const THEME_SCHEMES: readonly ThemeScheme[] = ["dark", "light"];
/** 設定で選べる値。system は OS の外観に合わせて dark / light を切り替える。 */
export type ThemePref = "system" | ThemeId;

export const THEME_PREFS: readonly ThemePref[] = ["system", ...THEMES.map((t) => t.id)];

export const SYSTEM_LIGHT_QUERY = "(prefers-color-scheme: light)";

const THEME_KEY = "gitsquid.theme";

export function isThemePref(v: unknown): v is ThemePref {
  return typeof v === "string" && (THEME_PREFS as readonly string[]).includes(v);
}

/** system を実際のテーマに解決する。 */
export function resolveTheme(pref: ThemePref, systemLight = prefersLight()): ThemeId {
  if (pref !== "system") return pref;
  return systemLight ? "light" : "dark";
}

function prefersLight() {
  return globalThis.matchMedia?.(SYSTEM_LIGHT_QUERY).matches ?? false;
}

export function schemeOf(id: ThemeId): ThemeScheme {
  return THEMES.find((t) => t.id === id)?.scheme ?? "dark";
}

export function loadThemePref(): ThemePref {
  const saved = localStorage.getItem(THEME_KEY);
  return isThemePref(saved) ? saved : "system";
}

export function saveThemePref(pref: ThemePref) {
  localStorage.setItem(THEME_KEY, pref);
}

/** テーマを <html> に当てる (起動時と変更時に呼ぶ)。 */
export function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = id;
  root.dataset.scheme = schemeOf(id);
}

/** いま当たっているテーマがダーク系かライト系か。当てる前はダーク扱い。 */
export function currentScheme(): ThemeScheme {
  return globalThis.document?.documentElement.dataset.scheme === "light" ? "light" : "dark";
}
