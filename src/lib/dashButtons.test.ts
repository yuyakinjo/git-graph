import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DASH,
  DASH_MAX,
  clampDashPos,
  loadDashPos,
  loadDash,
  loadRecent,
  normalizeDash,
  normalizeRecent,
  pushRecent,
  saveDash,
  stageToggleMode,
  toggleDash,
} from "./dashButtons";

describe("normalizeDash", () => {
  test("オブジェクトでなければ既定値", () => {
    expect(normalizeDash(null)).toEqual(DEFAULT_DASH);
    expect(normalizeDash("x")).toEqual(DEFAULT_DASH);
  });

  test("未知の id・別グループの id・重複を捨てる", () => {
    expect(
      normalizeDash({ git: ["push", "bogus", "prCreate", "push"], github: [], custom: 1 }),
    ).toEqual({ git: ["push"], github: [], custom: DEFAULT_DASH.custom });
  });

  test(`${DASH_MAX} 個を超えたら切り詰める`, () => {
    const git = ["fetch", "pull", "push", "branch", "stash", "stashPop", "worktree"];
    expect(normalizeDash({ git }).git).toHaveLength(DASH_MAX);
  });
});

describe("toggleDash", () => {
  test("外す", () => {
    expect(toggleDash(["pull", "push"], "pull")).toEqual(["push"]);
  });

  test("候補の定義順に差し込む", () => {
    expect(toggleDash(["pull", "push"], "fetch")).toEqual(["fetch", "pull", "push"]);
  });

  test("上限なら追加しない", () => {
    const full = ["fetch", "pull", "push", "branch", "stash"] as const;
    const ids = [...full];
    expect(toggleDash(ids, "worktree")).toBe(ids);
  });
});

describe("pushRecent / normalizeRecent", () => {
  test("先頭に置き、重複を除き、上限で切る", () => {
    expect(pushRecent(["pull", "push"], "push")).toEqual(["push", "pull"]);
    expect(pushRecent(["fetch", "pull", "push", "branch", "stash"], "tidy")).toEqual([
      "tidy",
      "fetch",
      "pull",
      "push",
      "branch",
    ]);
  });

  test("壊れた値は捨てる", () => {
    expect(normalizeRecent({})).toEqual([]);
    expect(normalizeRecent(["tidy", "bogus", "tidy", 1])).toEqual(["tidy"]);
  });
});

describe("永続化", () => {
  test("保存した選択を読み戻す", () => {
    const v = { git: ["fetch" as const], github: [], custom: ["tidy" as const] };
    saveDash(v);
    expect(loadDash()).toEqual(v);
  });

  test("壊れた値なら既定値", () => {
    localStorage.setItem("gitsquid.dashButtons", "{");
    localStorage.setItem("gitsquid.dashRecent", "{");
    localStorage.setItem("gitsquid.dashPos", '{"x":"a"}');
    expect(loadDash()).toEqual(DEFAULT_DASH);
    expect(loadRecent()).toEqual([]);
    expect(loadDashPos()).toBeNull();
  });
});

describe("clampDashPos", () => {
  const size = { w: 200, h: 100 };
  const view = { w: 800, h: 600 };

  test("画面内ならそのまま", () => {
    expect(clampDashPos({ x: 100, y: 100 }, size, view)).toEqual({ x: 100, y: 100 });
  });

  test("はみ出したら余白を残して収める", () => {
    expect(clampDashPos({ x: -50, y: 9999 }, size, view)).toEqual({ x: 8, y: 492 });
  });
});

describe("stageToggleMode", () => {
  test("未ステージの変更があれば stage", () => {
    expect(stageToggleMode({ staged: 0, unstaged: 2, conflicts: 0 })).toBe("stage");
    expect(stageToggleMode({ staged: 3, unstaged: 1, conflicts: 0 })).toBe("stage");
    expect(stageToggleMode({ staged: 1, unstaged: 0, conflicts: 1 })).toBe("stage");
  });
  test("すべてステージ済みなら unstage", () => {
    expect(stageToggleMode({ staged: 2, unstaged: 0, conflicts: 0 })).toBe("unstage");
  });
  test("変更が無ければ null", () => {
    expect(stageToggleMode({ staged: 0, unstaged: 0, conflicts: 0 })).toBeNull();
  });
});
