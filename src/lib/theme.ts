/**
 * アプリ全体の配色テーマ。
 *
 * 色の実体は styles.css にあり、テーマはキーカラー 7 色 (--t-*) だけを持つ。
 * このファイルはテーマの一覧と、どれを <html> に当てるか (data-theme / data-scheme) を受け持つ。
 * scheme はそのテーマがダーク系かライト系か。残りのトークンの作り方と差分ハイライトの配色が変わる。
 *
 * 組み込みテーマのキーカラーは styles.css の [data-theme] に、
 * 利用者が作ったカスタムテーマのキーカラーは localStorage にあり、<html> の style に直接書き込む。
 */
import * as z from "zod/mini";
import { lenientArray, readStored } from "./schema";

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

/** テーマを決めるキーカラー。styles.css の --t-<名前> に対応する。 */
export const KEY_COLORS = ["bg", "fg", "accent", "green", "red", "amber", "violet"] as const;
export type KeyColor = (typeof KEY_COLORS)[number];
export type ThemeKeys = Record<KeyColor, string>;

export type CustomThemeId = `custom-${string}`;
export interface CustomTheme {
  id: CustomThemeId;
  name: string;
  keys: ThemeKeys;
}

/** 設定で選べる値。system は OS の外観に合わせて dark / light を切り替える。 */
export type ThemePref = "system" | ThemeId | CustomThemeId;

/** 実際に <html> に当てる形。keys はカスタムテーマのときだけ持つ。 */
export interface ResolvedTheme {
  id: ThemeId | CustomThemeId;
  scheme: ThemeScheme;
  keys?: ThemeKeys;
}

export const SYSTEM_LIGHT_QUERY = "(prefers-color-scheme: light)";

const THEME_KEY = "gitsquid.theme";
const CUSTOM_THEMES_KEY = "gitsquid.customThemes";

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

function isBuiltinTheme(v: string): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

export function isCustomThemeId(v: unknown): v is CustomThemeId {
  return typeof v === "string" && v.startsWith("custom-") && v.length > "custom-".length;
}

export function isThemePref(v: unknown): v is ThemePref {
  return typeof v === "string" && (v === "system" || isBuiltinTheme(v) || isCustomThemeId(v));
}

/**
 * 設定値を実際に当てるテーマへ解決する。
 * system と、消されて見つからないカスタムテーマは OS の外観でダーク / ライトを選ぶ。
 */
export function resolveTheme(
  pref: ThemePref,
  customs: readonly CustomTheme[] = [],
  systemLight = prefersLight(),
): ResolvedTheme {
  if (isCustomThemeId(pref)) {
    const c = customs.find((t) => t.id === pref);
    if (c) return { id: c.id, scheme: schemeOfKeys(c.keys), keys: c.keys };
  } else if (pref !== "system") {
    return { id: pref, scheme: schemeOf(pref) };
  }
  return systemLight ? { id: "light", scheme: "light" } : { id: "dark", scheme: "dark" };
}

function prefersLight() {
  return globalThis.matchMedia?.(SYSTEM_LIGHT_QUERY).matches ?? false;
}

export function schemeOf(id: ThemeId): ThemeScheme {
  return THEMES.find((t) => t.id === id)?.scheme ?? "dark";
}

/** カスタムテーマは地の色の明るさでダーク系 / ライト系を決める (中間の灰色 #777 あたりが境目)。 */
export function schemeOfKeys(keys: ThemeKeys): ThemeScheme {
  return luminance(keys.bg) > 0.18 ? "light" : "dark";
}

export function loadThemePref(): ThemePref {
  const saved = localStorage.getItem(THEME_KEY);
  return isThemePref(saved) ? saved : "system";
}

export function saveThemePref(pref: ThemePref) {
  localStorage.setItem(THEME_KEY, pref);
}

/** キーカラー 7 色すべてを value の形で持つオブジェクト。余分なキーは落とす。 */
export const keyColorsSchema = <T extends z.ZodMiniType>(value: T) =>
  z.object(Object.fromEntries(KEY_COLORS.map((c) => [c, value])) as Record<KeyColor, T>);

const CustomThemeSchema = z.object({
  id: z.custom<CustomThemeId>(isCustomThemeId),
  name: z.string(),
  keys: keyColorsSchema(z.string().check(z.regex(HEX))),
});

/** 保存済みのカスタムテーマ。形の崩れたものは読み飛ばす。 */
export const loadCustomThemes = (): CustomTheme[] =>
  readStored(CUSTOM_THEMES_KEY, lenientArray(CustomThemeSchema), []);

export function saveCustomThemes(themes: readonly CustomTheme[]) {
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
}

export function newCustomThemeId(): CustomThemeId {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** テーマを <html> に当てる (起動時と変更時に呼ぶ)。 */
export function applyTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.dataset.scheme = theme.scheme;
  for (const c of KEY_COLORS) {
    if (theme.keys) root.style.setProperty(`--t-${c}`, theme.keys[c]);
    else root.style.removeProperty(`--t-${c}`);
  }
}

/** いま当たっているテーマがダーク系かライト系か。当てる前はダーク扱い。 */
export function currentScheme(): ThemeScheme {
  return globalThis.document?.documentElement.dataset.scheme === "light" ? "light" : "dark";
}

/** いま当たっているテーマのキーカラー (新しいカスタムテーマの下書きに使う)。 */
export function currentKeys(): ThemeKeys {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    KEY_COLORS.map((c) => {
      const v = style.getPropertyValue(`--t-${c}`).trim().toLowerCase();
      return [c, isHexColor(v) ? v : "#808080"];
    }),
  ) as ThemeKeys;
}

// ------------------------------------------------------------------ コントラスト

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG のコントラスト比 (1〜21) */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 文字として使う色のうち、地の色に対して 4.5:1 に届かないもの */
export function lowContrastKeys(keys: ThemeKeys): KeyColor[] {
  return KEY_COLORS.filter((c) => c !== "bg" && contrastRatio(keys[c], keys.bg) < 4.5);
}

// ------------------------------------------------------------------ パレットの読み取り

/**
 * 貼り付けられた文字列から色を拾う (重複は除いて出てきた順)。
 * #rrggbb / #rgb のほか、coolors の URL のような # の無い 6 桁も色として読む。
 */
export function parsePalette(text: string): string[] {
  const found: string[] = [];
  for (const [, hash, hex] of text.matchAll(
    /(?<![0-9a-z])(#?)([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])/gi,
  )) {
    // # の無い 3 桁は数字などと紛らわしいので拾わない
    if (!hash && hex.length === 3) continue;
    const full = (hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex).toLowerCase();
    const color = `#${full}`;
    if (!found.includes(color)) found.push(color);
  }
  return found;
}
