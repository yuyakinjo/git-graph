import { describe, expect, it } from "bun:test";
import {
  getLocale,
  loadLocalePref,
  resolveLocale,
  saveLocalePref,
  setLocale,
  subscribeLocale,
  t,
  type Locale,
  type Messages,
} from ".";

describe("resolveLocale", () => {
  it("明示した言語はそのまま", () => {
    expect(resolveLocale("ja", "en-US")).toBe("ja");
    expect(resolveLocale("en", "ja-JP")).toBe("en");
  });

  it("system は OS の言語が日本語なら ja、それ以外は en", () => {
    expect(resolveLocale("system", "ja-JP")).toBe("ja");
    expect(resolveLocale("system", "ja")).toBe("ja");
    expect(resolveLocale("system", "en-US")).toBe("en");
    expect(resolveLocale("system", "fr")).toBe("en");
    expect(resolveLocale("system", "")).toBe("en");
  });
});

describe("設定値の保存", () => {
  it("未設定や不正な値は system", () => {
    expect(loadLocalePref()).toBe("system");
    localStorage.setItem("gitsquid.locale", "de");
    expect(loadLocalePref()).toBe("system");
  });

  it("保存した値を読み戻せる", () => {
    saveLocalePref("en");
    expect(loadLocalePref()).toBe("en");
  });
});

describe("setLocale", () => {
  it("辞書が切り替わり、購読者に知らせる", () => {
    let calls = 0;
    const off = subscribeLocale(() => calls++);
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t().settings.language).toBe("Language");
    setLocale("en");
    expect(calls).toBe(1);
    off();
    setLocale("ja");
    expect(t().settings.language).toBe("言語");
    expect(calls).toBe(1);
  });
});

/** 文字列の葉と、関数の葉 (引数に適当な値を入れて呼ぶ) を列挙する */
function leaves(obj: unknown, path = ""): [string, unknown][] {
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [[path, obj]];
}

describe("辞書", () => {
  const dict = (locale: Locale): Messages => {
    setLocale(locale);
    return t();
  };

  it("ja と en でキーが揃い、空の文言が無い", () => {
    const ja = leaves(dict("ja"));
    const en = leaves(dict("en"));
    expect(en.map(([k]) => k)).toEqual(ja.map(([k]) => k));
    for (const [k, v] of [...ja, ...en]) {
      expect(typeof v === "string" || typeof v === "function", k).toBe(true);
      if (typeof v === "string") expect(v.trim().length, k).toBeGreaterThan(0);
    }
  });
});
