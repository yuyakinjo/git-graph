import { describe, expect, test } from "bun:test";
import { setLocale } from "../i18n";
import { parsePlan, recomposeMode, validatePlan } from "./recompose";
import type { ChangedFile } from "./types";

const repo = (
  headBranch: string | null,
  over: Partial<{ headHash: string | null; state: "clean" | "merging" }> = {},
) => ({
  headBranch,
  headHash: "abc",
  defaultBranch: "main",
  state: "clean" as const,
  ...over,
});

describe("recomposeMode", () => {
  test("既定ブランチ以外は recompose", () => {
    expect(recomposeMode(repo("feature/x"), { ahead: 0 }, false)).toBe("recompose");
  });

  test("既定ブランチで作業中の変更か未プッシュのコミットがあれば compose", () => {
    expect(recomposeMode(repo("main"), { ahead: 0 }, true)).toBe("compose");
    expect(recomposeMode(repo("main"), { ahead: 2 }, false)).toBe("compose");
  });

  test("既定ブランチで差分が無ければ無効", () => {
    expect(recomposeMode(repo("main"), { ahead: 0 }, false)).toBeNull();
    expect(recomposeMode(repo("main"), null, false)).toBeNull();
  });

  test("detached HEAD・コミット無し・マージ途中は無効", () => {
    expect(recomposeMode(repo(null), null, true)).toBeNull();
    expect(recomposeMode(repo("feature/x", { headHash: null }), null, true)).toBeNull();
    expect(recomposeMode(repo("feature/x", { state: "merging" }), null, true)).toBeNull();
    expect(recomposeMode(null, null, true)).toBeNull();
  });
});

describe("parsePlan", () => {
  test("コードフェンスや前置きがあっても JSON を取り出す", () => {
    const text =
      'はい。\n```json\n{"commits":[{"message":" feat: a \\n\\nbody","files":["a.ts"]}]}\n```';
    expect(parsePlan(text)).toEqual({
      commits: [{ message: "feat: a \n\nbody", files: ["a.ts"] }],
    });
  });

  test("compose のブランチ名を拾う", () => {
    expect(parsePlan('{"branch":" feature/x ","commits":[]}')).toEqual({
      branch: "feature/x",
      commits: [],
    });
  });

  test("文字列以外のファイルは捨てる", () => {
    expect(
      parsePlan('{"commits":[{"message":"m","files":["a",1,null]}]}').commits[0].files,
    ).toEqual(["a"]);
  });

  test("JSON が無い・commits が無いときは例外", () => {
    expect(() => parsePlan("だめでした")).toThrow();
    expect(() => parsePlan('{"branch":"x"}')).toThrow();
  });
});

describe("validatePlan", () => {
  const files: ChangedFile[] = [
    { status: "M", path: "a", origPath: null },
    { status: "R", path: "b2", origPath: "b" },
    { status: "D", path: "c", origPath: null },
  ];

  test("全ファイルがちょうど 1 回ずつなら問題なし", () => {
    const plan = {
      commits: [
        { message: "x", files: ["a", "c"] },
        { message: "y", files: ["b2"] },
      ],
    };
    expect(validatePlan(plan, files)).toEqual([]);
  });

  test("重複・漏れ・未知のファイル・空のコミットを挙げる", () => {
    const plan = {
      commits: [
        { message: "x", files: ["a", "zzz"] },
        { message: "", files: ["a"] },
        { message: "z", files: [] },
      ],
    };
    const errors = validatePlan(plan, files);
    expect(errors.some((e) => e.includes("zzz"))).toBe(true);
    expect(errors.some((e) => e.includes("a が複数"))).toBe(true);
    expect(errors.some((e) => e.includes("b2, c"))).toBe(true);
    expect(errors.some((e) => e.includes("2 番目のコミットにメッセージ"))).toBe(true);
    expect(errors.some((e) => e.includes("3 番目のコミットにファイル"))).toBe(true);
  });

  test("英語のエラー文", () => {
    setLocale("en");
    const plan = { commits: [{ message: "", files: ["a", "a"] }] };
    const errors = validatePlan(plan, files);
    expect(errors).toContain("The 1st commit has no message");
    expect(errors).toContain("a is included in more than one commit");
    expect(errors).toContain("Files not included in any commit: b2, c");
  });
});
