import { describe, expect, test } from "bun:test";
import {
  contrastRatio,
  isThemePref,
  loadCustomThemes,
  loadThemePref,
  lowContrastKeys,
  parsePalette,
  resolveTheme,
  saveCustomThemes,
  saveThemePref,
  schemeOf,
  schemeOfKeys,
  type CustomTheme,
  type ThemeKeys,
} from "./theme";

const DARK_KEYS: ThemeKeys = {
  bg: "#171c25",
  fg: "#dde4ec",
  accent: "#4fc3f7",
  green: "#34d399",
  red: "#f87171",
  amber: "#fbbf24",
  violet: "#a78bfa",
};
const CUSTOM: CustomTheme = { id: "custom-a", name: "Mine", keys: { ...DARK_KEYS, bg: "#fafafa" } };

describe("resolveTheme", () => {
  test("system は OS の外観でダーク / ライトを選ぶ", () => {
    expect(resolveTheme("system", [], true)).toEqual({ id: "light", scheme: "light" });
    expect(resolveTheme("system", [], false)).toEqual({ id: "dark", scheme: "dark" });
  });

  test("組み込みテーマは OS の外観によらずそのまま", () => {
    expect(resolveTheme("nord", [], true)).toEqual({ id: "nord", scheme: "dark" });
    expect(resolveTheme("solarized", [], false)).toEqual({ id: "solarized", scheme: "light" });
  });

  test("カスタムテーマはキーカラーごと返し、系統は地の色で決める", () => {
    expect(resolveTheme("custom-a", [CUSTOM], false)).toEqual({
      id: "custom-a",
      scheme: "light",
      keys: CUSTOM.keys,
    });
  });

  test("消されたカスタムテーマは system 扱い", () => {
    expect(resolveTheme("custom-gone", [CUSTOM], false)).toEqual({ id: "dark", scheme: "dark" });
  });
});

describe("schemeOf / schemeOfKeys", () => {
  test("組み込みテーマのダーク系 / ライト系", () => {
    expect(schemeOf("dracula")).toBe("dark");
    expect(schemeOf("solarized")).toBe("light");
  });

  test("地の色の明るさで決める", () => {
    expect(schemeOfKeys(DARK_KEYS)).toBe("dark");
    expect(schemeOfKeys({ ...DARK_KEYS, bg: "#fdf6e3" })).toBe("light");
  });
});

describe("loadThemePref / saveThemePref", () => {
  test("未保存なら system", () => {
    localStorage.removeItem("gitsquid.theme");
    expect(loadThemePref()).toBe("system");
  });

  test("保存したものを読み戻す (カスタムテーマの ID も)", () => {
    saveThemePref("dracula");
    expect(loadThemePref()).toBe("dracula");
    saveThemePref("custom-a");
    expect(loadThemePref()).toBe("custom-a");
  });

  test("知らない値は system に戻す", () => {
    localStorage.setItem("gitsquid.theme", "sepia");
    expect(loadThemePref()).toBe("system");
  });
});

describe("loadCustomThemes / saveCustomThemes", () => {
  test("保存したものを読み戻す", () => {
    saveCustomThemes([CUSTOM]);
    expect(loadCustomThemes()).toEqual([CUSTOM]);
  });

  test("壊れた値や形の崩れたテーマは読み飛ばす", () => {
    localStorage.setItem("gitsquid.customThemes", "{broken");
    expect(loadCustomThemes()).toEqual([]);
    localStorage.setItem(
      "gitsquid.customThemes",
      JSON.stringify([
        CUSTOM,
        { id: "nord", name: "x", keys: DARK_KEYS },
        { id: "custom-b", name: "b", keys: { ...DARK_KEYS, fg: "red" } },
        { id: "custom-c", name: 1, keys: DARK_KEYS },
      ]),
    );
    expect(loadCustomThemes()).toEqual([CUSTOM]);
  });
});

test("isThemePref", () => {
  expect(["system", "dark", "nord", "custom-x"].every(isThemePref)).toBe(true);
  expect(["sepia", "custom-", 1].some(isThemePref)).toBe(false);
});

describe("コントラスト", () => {
  test("白と黒は 21:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21);
  });

  test("地の色に対して 4.5:1 に届かない文字色を挙げる", () => {
    expect(lowContrastKeys(DARK_KEYS)).toEqual([]);
    expect(lowContrastKeys({ ...DARK_KEYS, accent: "#2a3140" })).toEqual(["accent"]);
  });
});

describe("parsePalette", () => {
  test("#rrggbb と #rgb を小文字の #rrggbb で拾い、重複は除く", () => {
    expect(parsePalette("#264653, #2A9D8F\n#fff #264653")).toEqual([
      "#264653",
      "#2a9d8f",
      "#ffffff",
    ]);
  });

  test("coolors の URL のような # の無い 6 桁も読む", () => {
    expect(parsePalette("https://coolors.co/264653-2a9d8f-e9c46a")).toEqual([
      "#264653",
      "#2a9d8f",
      "#e9c46a",
    ]);
  });

  test("# の無い 3 桁や 8 桁は色として読まない", () => {
    expect(parsePalette("123 abc #ff00ff80 ffffffff")).toEqual([]);
  });
});
