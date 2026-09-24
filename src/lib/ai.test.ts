import { describe, expect, test } from "bun:test";
import { parsePrDescription } from "./ai";

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
