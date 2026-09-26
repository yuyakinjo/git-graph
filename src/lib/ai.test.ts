import { describe, expect, test } from "bun:test";
import { setLocale } from "../i18n";
import { commitSystem, parsePrDescription } from "./ai";

describe("parsePrDescription", () => {
  test("1 行目をタイトル、残りを本文に分ける", () => {
    expect(parsePrDescription("feat: 追加\n\n## 概要\n- a\n")).toEqual({
      title: "feat: 追加",
      body: "## 概要\n- a",
    });
  });

  test("見出し記号付きのタイトルは記号を外す", () => {
    expect(parsePrDescription("# タイトル\n本文").title).toBe("タイトル");
  });

  test("本文が無ければ空文字", () => {
    expect(parsePrDescription("  タイトルだけ  ")).toEqual({ title: "タイトルだけ", body: "" });
  });
});

describe("commitSystem", () => {
  test("手掛かりが無いときの言語は表示言語に合わせる", () => {
    expect(commitSystem()).toContain("write in Japanese");
    setLocale("en");
    expect(commitSystem()).toContain("write in English");
    expect(commitSystem()).not.toContain("Japanese");
  });
});
