import { describe, expect, test } from "bun:test";
import {
  isThemePref,
  loadThemePref,
  resolveTheme,
  saveThemePref,
  schemeOf,
  THEME_PREFS,
  THEMES,
} from "./theme";

describe("resolveTheme", () => {
  test("system は OS の外観でダーク / ライトを選ぶ", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });

  test("テーマを指定していれば OS の外観によらずそのまま", () => {
    expect(resolveTheme("nord", true)).toBe("nord");
    expect(resolveTheme("solarized", false)).toBe("solarized");
  });
});

describe("schemeOf", () => {
  test("テーマごとのダーク系 / ライト系", () => {
    expect(schemeOf("dark")).toBe("dark");
    expect(schemeOf("dracula")).toBe("dark");
    expect(schemeOf("light")).toBe("light");
    expect(schemeOf("solarized")).toBe("light");
  });
});

describe("loadThemePref / saveThemePref", () => {
  test("未保存なら system", () => {
    localStorage.removeItem("gitsquid.theme");
    expect(loadThemePref()).toBe("system");
  });

  test("保存したものを読み戻す", () => {
    saveThemePref("dracula");
    expect(loadThemePref()).toBe("dracula");
  });

  test("知らない値は system に戻す", () => {
    localStorage.setItem("gitsquid.theme", "sepia");
    expect(loadThemePref()).toBe("system");
  });
});

test("設定の選択肢は system とすべてのテーマ", () => {
  expect(THEME_PREFS).toEqual(["system", ...THEMES.map((t) => t.id)]);
  expect(THEME_PREFS.every(isThemePref)).toBe(true);
  expect(isThemePref(1)).toBe(false);
});
