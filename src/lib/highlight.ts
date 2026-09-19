import type { BundledLanguage, Highlighter, ThemedToken, ThemeInput } from "shiki";

/**
 * 差分ビューで選べるテーマ。
 *
 * shiki のテーマ 66 種すべてを参照すると、使わないテーマまで全部チャンクになるので、
 * ここに並べたものだけを動的 import する (= ビルド成果物に載るのもこの分だけ)。
 * アプリ自体が dark 固定なので暗い配色を中心にしている。増やすならこの配列に足す。
 */
export const DIFF_THEMES = [
  { id: "one-dark-pro", label: "One Dark Pro", load: () => import("@shikijs/themes/one-dark-pro") },
  {
    id: "github-dark-default",
    label: "GitHub Dark",
    load: () => import("@shikijs/themes/github-dark-default"),
  },
  { id: "vitesse-dark", label: "Vitesse Dark", load: () => import("@shikijs/themes/vitesse-dark") },
  { id: "dracula", label: "Dracula", load: () => import("@shikijs/themes/dracula") },
  { id: "nord", label: "Nord", load: () => import("@shikijs/themes/nord") },
  { id: "tokyo-night", label: "Tokyo Night", load: () => import("@shikijs/themes/tokyo-night") },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    load: () => import("@shikijs/themes/catppuccin-mocha"),
  },
  { id: "min-dark", label: "Min Dark (控えめ)", load: () => import("@shikijs/themes/min-dark") },
] as const;

export type DiffTheme = (typeof DIFF_THEMES)[number]["id"];

export const DEFAULT_DIFF_THEME: DiffTheme = "one-dark-pro";

export function isDiffTheme(v: unknown): v is DiffTheme {
  return DIFF_THEMES.some((t) => t.id === v);
}

/** 巨大な差分でトークナイズに張り付かないための上限。超えたら素のテキストで出す。 */
const MAX_CHARS = 400_000;

/** 拡張子と言語 ID がずれるものだけ手当てする (一致するものは shiki の別名が拾う) */
const EXT_ALIAS: Record<string, string> = {
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  h: "c",
  htm: "html",
  mk: "makefile",
  plist: "xml",
  svg: "xml",
  zsh: "shellscript",
};

/** 拡張子を持たない設定ファイルたち */
const BY_FILENAME: Record<string, string> = {
  dockerfile: "dockerfile",
  gemfile: "ruby",
  justfile: "just",
  makefile: "makefile",
  rakefile: "ruby",
};

/** パスから言語 ID の候補を作る (shiki にその言語があるかは読み込み時に確かめる) */
export function langOf(path: string | undefined): string | null {
  if (!path) return null;
  const name = (path.split("/").pop() ?? "").toLowerCase();
  const byName = BY_FILENAME[name];
  if (byName) return byName;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = name.slice(dot + 1);
  return EXT_ALIAS[ext] ?? ext;
}

/**
 * shiki 本体は起動時のバンドルに載せたくないので動的 import する。
 * 文法もテーマもここから先で初めて読み込まれる。
 */
let highlighter: Promise<Highlighter> | null = null;
const langs = new Map<string, Promise<boolean>>();
const themes = new Map<DiffTheme, Promise<boolean>>();

function getHighlighter() {
  highlighter ??= import("shiki").then((shiki) =>
    shiki.createHighlighter({ themes: [], langs: [] }),
  );
  return highlighter;
}

/** 言語は初回参照時だけ読み込む。未対応の言語はここで false になる。 */
function loadLang(lang: string): Promise<boolean> {
  let p = langs.get(lang);
  if (!p) {
    p = import("shiki")
      .then(async (shiki) => {
        if (!(lang in shiki.bundledLanguages) && !(lang in shiki.bundledLanguagesAlias))
          return false;
        const h = await getHighlighter();
        await h.loadLanguage(lang as BundledLanguage);
        return true;
      })
      .catch(() => false);
    langs.set(lang, p);
  }
  return p;
}

/** テーマも初回参照時だけ読み込む (選ばれたものだけが実際に取得される)。 */
function loadTheme(theme: DiffTheme): Promise<boolean> {
  let p = themes.get(theme);
  if (!p) {
    const entry = DIFF_THEMES.find((t) => t.id === theme);
    p = !entry
      ? Promise.resolve(false)
      : getHighlighter()
          .then(async (h) => {
            await h.loadTheme(entry.load as ThemeInput);
            return true;
          })
          .catch(() => false);
    themes.set(theme, p);
  }
  return p;
}

/**
 * コードを 1 行 = 1 配列のトークンに分解する。
 * 言語やテーマが読めない・大きすぎる場合は null を返し、呼び出し側は素のテキストにフォールバックする。
 */
export async function tokenizeLines(
  code: string,
  path: string | undefined,
  theme: DiffTheme,
): Promise<ThemedToken[][] | null> {
  const lang = langOf(path);
  if (!lang || code.length > MAX_CHARS) return null;
  const [okLang, okTheme] = await Promise.all([loadLang(lang), loadTheme(theme)]);
  if (!okLang || !okTheme) return null;
  try {
    const h = await getHighlighter();
    return h.codeToTokens(code, { lang: lang as BundledLanguage, theme }).tokens;
  } catch {
    return null;
  }
}
