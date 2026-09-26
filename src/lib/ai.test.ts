import { describe, expect, test } from "bun:test";
import { setLocale } from "../i18n";
import { commitSystem, parsePrDescription, parseThemeAssignment } from "./ai";

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

describe("parseThemeAssignment", () => {
  const palette = ["#111111", "#eeeeee", "#3399ff", "#33cc66", "#ee4444", "#ffbb22", "#aa77ff"];
  const answer = {
    bg: "#111111",
    fg: "#EEEEEE",
    accent: "#3399ff",
    green: "#33cc66",
    red: "#ee4444",
    amber: "#ffbb22",
    violet: "#aa77ff",
  };

  test("前後に余計な文字があっても JSON を読み、色は小文字にそろえる", () => {
    expect(parseThemeAssignment(`はい\n${JSON.stringify(answer)}\n`, palette)).toEqual({
      keys: { ...answer, fg: "#eeeeee" },
      errors: [],
    });
  });

  test("パレットに無い色・使っていない色・重複を理由にして返す", () => {
    const res = parseThemeAssignment(
      JSON.stringify({ ...answer, fg: "#111111", violet: "#123456" }),
      palette,
    );
    expect(res.keys).toBeUndefined();
    expect(res.errors).toEqual([
      '"violet" is #123456, which is not in the palette.',
      "#111111 is used 2 times.",
      "#eeeeee is not used.",
      "#aa77ff is not used.",
    ]);
  });

  test("JSON でなければその旨を返す", () => {
    expect(parseThemeAssignment("わかりません", palette).errors).toEqual([
      "The answer is not a JSON object.",
    ]);
  });
});
