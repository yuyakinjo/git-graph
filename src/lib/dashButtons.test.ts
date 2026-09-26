import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DASH,
  DASH_MAX,
  clampDashPos,
  isOverDock,
  migrateFloating,
  normalizeFloating,
  loadDashPos,
  loadDash,
  loadRecent,
  moveDash,
  normalizeDash,
  normalizeHiddenBars,
  normalizeRecent,
  pushRecent,
  saveDash,
  stageToggleMode,
  toggleDash,
  toggleHiddenBar,
} from "./dashButtons";

describe("normalizeDash", () => {
  test("オブジェクトでなければ既定値", () => {
    expect(normalizeDash(null)).toEqual(DEFAULT_DASH);
    expect(normalizeDash("x")).toEqual(DEFAULT_DASH);
  });

  test("未知の id・別グループの id・重複を捨てる", () => {
    expect(
      normalizeDash({
        git: ["push", "bogus", "prCreate", "push"],
        github: [],
        custom: 1,
      }),
    ).toEqual({
      git: ["push"],
      github: [],
      ai: DEFAULT_DASH.ai,
      custom: DEFAULT_DASH.custom,
    });
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

  test("末尾に足す", () => {
    expect(toggleDash(["push", "pull"], "fetch")).toEqual(["push", "pull", "fetch"]);
  });

  test("上限なら追加しない", () => {
    const full = ["fetch", "pull", "push", "branch", "stash"] as const;
    const ids = [...full];
    expect(toggleDash(ids, "worktree")).toBe(ids);
  });
});

describe("moveDash", () => {
  const ids = ["fetch", "pull", "push"] as const;

  test("前へ・後ろへ・末尾へ動かす", () => {
    expect(moveDash([...ids], "push", 0)).toEqual(["push", "fetch", "pull"]);
    expect(moveDash([...ids], "fetch", 2)).toEqual(["pull", "fetch", "push"]);
    expect(moveDash([...ids], "fetch", 3)).toEqual(["pull", "push", "fetch"]);
  });

  test("自分の前後や未知の id なら同じ配列を返す", () => {
    const a = [...ids];
    expect(moveDash(a, "pull", 1)).toBe(a);
    expect(moveDash(a, "pull", 2)).toBe(a);
    expect(moveDash(a, "tidy", 0)).toBe(a);
  });
});

describe("隠したバー", () => {
  test("既知の id だけを定義順で残す", () => {
    expect(normalizeHiddenBars(["recent", "bogus", "git"])).toEqual(["git", "recent"]);
    expect(normalizeHiddenBars("x")).toEqual([]);
  });

  test("すべて隠れる保存値は捨てる", () => {
    expect(normalizeHiddenBars(["git", "github", "ai", "custom", "recent"])).toEqual([]);
  });

  test("出す / 隠す。最後の 1 本は隠さない", () => {
    expect(toggleHiddenBar(["git"], "git")).toEqual([]);
    expect(toggleHiddenBar(["recent"], "github")).toEqual(["github", "recent"]);
    const four = ["git", "github", "ai", "custom"] as const;
    const hidden = [...four];
    expect(toggleHiddenBar(hidden, "recent")).toBe(hidden);
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
    const v = {
      git: ["fetch" as const],
      github: [],
      ai: ["aiCommit" as const],
      custom: ["tidy" as const],
    };
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
    expect(clampDashPos({ x: 100, y: 100 }, size, view)).toEqual({
      x: 100,
      y: 100,
    });
  });

  test("はみ出したら余白を残して収める", () => {
    expect(clampDashPos({ x: -50, y: 9999 }, size, view)).toEqual({
      x: 8,
      y: 492,
    });
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

describe("isOverDock", () => {
  const rect = { left: 0, right: 800, top: 40, bottom: 86 };
  test("列の中なら true", () => {
    expect(isOverDock({ x: 100, y: 60 }, rect)).toBe(true);
  });
  test("上下は slack の分だけ甘く判定する", () => {
    expect(isOverDock({ x: 100, y: 96 }, rect)).toBe(true);
    expect(isOverDock({ x: 100, y: 99 }, rect)).toBe(false);
    expect(isOverDock({ x: 100, y: 29 }, rect, 10)).toBe(false);
  });
  test("左右にはみ出たら false", () => {
    expect(isOverDock({ x: 801, y: 60 }, rect)).toBe(false);
  });
});

describe("normalizeFloating", () => {
  test("既知のバーと有限の座標だけを残す", () => {
    expect(
      normalizeFloating({
        git: { x: 10, y: 20 },
        ai: { x: "1", y: 2 },
        nope: { x: 1, y: 2 },
        recent: { x: Number.NaN, y: 0 },
      }),
    ).toEqual({ git: { x: 10, y: 20 } });
  });
  test("壊れた値なら空 (全部ドッキング)", () => {
    expect(normalizeFloating(null)).toEqual({});
    expect(normalizeFloating([1, 2])).toEqual({});
  });
});

describe("migrateFloating", () => {
  test("旧形式でドッキングしていたら何も浮かせない", () => {
    expect(migrateFloating(null, { x: 1, y: 2 })).toEqual({});
    expect(migrateFloating("on", null)).toEqual({});
  });
  test("旧形式で取り出していたら、全バーを旧位置から縦に積む", () => {
    const f = migrateFloating("off", { x: 100, y: 200 });
    expect(f.git).toEqual({ x: 100, y: 200 });
    expect(f.github).toEqual({ x: 100, y: 248 });
    expect(Object.keys(f)).toHaveLength(5);
  });
});
