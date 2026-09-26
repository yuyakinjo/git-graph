/**
 * 表示言語 (日本語 / 英語) の切り替え。
 *
 * 辞書は messages/ に画面・モジュールごとに置き、`ja` を正として `en` を同じ形で書く
 * (`en: typeof ja` なので、キーの抜けや引数の違いは tsc が見つける)。
 * 変数を埋め込む文言や英語の単数/複数は、文字列ではなく関数にする。
 *
 * - React の中: `const m = useT(); m.toolbar.pull`
 * - React の外 (state / lib): `t().store.runDone(label)` (呼んだ時点の言語で引く)
 */
import { useSyncExternalStore } from "react";
import * as actions from "./messages/actions";
import * as ai from "./messages/ai";
import * as app from "./messages/app";
import * as avatar from "./messages/avatar";
import * as dashButtons from "./messages/dashButtons";
import * as dashPanel from "./messages/dashPanel";
import * as detailPane from "./messages/detailPane";
import * as diffModal from "./messages/diffModal";
import * as diffView from "./messages/diffView";
import * as format from "./messages/format";
import * as graphPane from "./messages/graphPane";
import * as highlight from "./messages/highlight";
import * as logModal from "./messages/logModal";
import * as main from "./messages/main";
import * as markdown from "./messages/markdown";
import * as prModal from "./messages/prModal";
import * as recompose from "./messages/recompose";
import * as recomposeModal from "./messages/recomposeModal";
import * as repoPicker from "./messages/repoPicker";
import * as settings from "./messages/settings";
import * as sidebar from "./messages/sidebar";
import * as store from "./messages/store";
import * as tidyModal from "./messages/tidyModal";
import * as titleBar from "./messages/titleBar";
import * as toolbar from "./messages/toolbar";
import * as ui from "./messages/ui";

const modules = {
  actions,
  ai,
  app,
  avatar,
  dashButtons,
  dashPanel,
  detailPane,
  diffModal,
  diffView,
  format,
  graphPane,
  highlight,
  logModal,
  main,
  markdown,
  prModal,
  recompose,
  recomposeModal,
  repoPicker,
  settings,
  sidebar,
  store,
  tidyModal,
  titleBar,
  toolbar,
  ui,
};

type Modules = typeof modules;
export type Messages = { [K in keyof Modules]: Modules[K]["ja"] };
export type Locale = "ja" | "en";
/** 設定で選べる値。system は OS (webview) の言語に合わせる。 */
export type LocalePref = "system" | Locale;

export const LOCALE_PREFS: readonly LocalePref[] = ["system", "ja", "en"];

function build(locale: Locale): Messages {
  const out = {} as Record<string, unknown>;
  for (const [k, m] of Object.entries(modules)) out[k] = m[locale];
  return out as Messages;
}

const dictionaries: Record<Locale, Messages> = { ja: build("ja"), en: build("en") };

export function isLocalePref(v: unknown): v is LocalePref {
  return typeof v === "string" && (LOCALE_PREFS as readonly string[]).includes(v);
}

/** system を実際の言語に解決する。日本語以外の環境は英語にする。 */
export function resolveLocale(pref: LocalePref, systemLanguage = navigatorLanguage()): Locale {
  if (pref !== "system") return pref;
  return systemLanguage.toLowerCase().startsWith("ja") ? "ja" : "en";
}

function navigatorLanguage(): string {
  return typeof navigator !== "undefined" ? (navigator.language ?? "") : "";
}

const LOCALE_KEY = "gitsquid.locale";

export function loadLocalePref(): LocalePref {
  const saved = localStorage.getItem(LOCALE_KEY);
  return isLocalePref(saved) ? saved : "system";
}

export function saveLocalePref(pref: LocalePref) {
  localStorage.setItem(LOCALE_KEY, pref);
}

let current: Locale = "ja";
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

/** いまの言語の辞書 (React の外から使う) */
export function t(): Messages {
  return dictionaries[current];
}

/** 言語を切り替え、<html lang> と購読者 (useT, Rust 側への同期) に知らせる。 */
export function setLocale(locale: Locale) {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  if (locale === current) return;
  current = locale;
  for (const l of listeners) l();
}

/** 言語の切り替えを購読する。戻り値で解除。 */
export function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** いまの言語の辞書。言語が切り替わると再描画される。 */
export function useT(): Messages {
  return useSyncExternalStore(subscribeLocale, t, t);
}

/** いまの言語。言語が切り替わると再描画される。 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}
