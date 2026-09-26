import { describe, expect, test } from "bun:test";
import { renamedStashMessage, splitStashMessage, uniqueStashName } from "./stash";

describe("splitStashMessage", () => {
  test("-m 付きとメッセージ無しの両方からブランチと名前を取り出す", () => {
    expect(splitStashMessage("On main: 作業中")).toEqual({ branch: "main", name: "作業中" });
    expect(splitStashMessage("WIP on feature/x: abc1234 subject")).toEqual({
      branch: "feature/x",
      name: "abc1234 subject",
    });
  });

  test("形式に合わなければ全体を名前とみなす", () => {
    expect(splitStashMessage("autostash")).toEqual({ branch: null, name: "autostash" });
  });
});

describe("renamedStashMessage", () => {
  test("ブランチの印を残して名前だけ差し替える", () => {
    expect(renamedStashMessage("WIP on main: abc1234 subject", " 新しい名前 ")).toBe(
      "On main: 新しい名前",
    );
    expect(renamedStashMessage("autostash", "名前")).toBe("名前");
  });
});

describe("uniqueStashName", () => {
  const now = new Date(2026, 8, 26, 9, 5, 3);

  test("日時から名前を作る", () => {
    expect(uniqueStashName([], now)).toBe("WIP 2026-09-26 09:05:03");
  });

  test("同じ名前があれば連番を足す", () => {
    const existing = ["On main: WIP 2026-09-26 09:05:03", "On dev: WIP 2026-09-26 09:05:03 (2)"];
    expect(uniqueStashName(existing, now)).toBe("WIP 2026-09-26 09:05:03 (3)");
  });
});
