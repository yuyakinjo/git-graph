import { afterEach, beforeEach, describe, expect, test, setSystemTime } from "bun:test";
import {
  absoluteTime,
  avatarColor,
  basename,
  dirname,
  initials,
  laneColor,
  relativeTime,
} from "./format";

describe("laneColor", () => {
  test("12 色で循環し、負の添字でも色を返す", () => {
    expect(laneColor(0)).toBe("var(--color-lane-0)");
    expect(laneColor(12)).toBe(laneColor(0));
    expect(laneColor(13)).toBe(laneColor(1));
    expect(laneColor(-1)).toBe(laneColor(11));
  });
});

describe("relativeTime", () => {
  // 2026/09/23 12:00:00 JST
  const now = Date.UTC(2026, 8, 23, 3, 0, 0);
  const sec = now / 1000;

  beforeEach(() => setSystemTime(new Date(now)));
  afterEach(() => setSystemTime());

  test("0 は空文字", () => {
    expect(relativeTime(0)).toBe("");
  });

  test("経過時間の単位を切り替える", () => {
    expect(relativeTime(sec - 30)).toBe("たった今");
    expect(relativeTime(sec - 60)).toBe("1 分前");
    expect(relativeTime(sec - 3599)).toBe("59 分前");
    expect(relativeTime(sec - 3600)).toBe("1 時間前");
    expect(relativeTime(sec - 86400)).toBe("1 日前");
    expect(relativeTime(sec - 86400 * 29)).toBe("29 日前");
  });

  test("30 日以上前は日付で出す", () => {
    expect(relativeTime(sec - 86400 * 30)).toBe("2026/08/24");
  });
});

describe("absoluteTime", () => {
  test("ローカル時刻を 0 埋めで整形する", () => {
    // 2026/01/02 03:04 JST
    expect(absoluteTime(Date.UTC(2026, 0, 1, 18, 4) / 1000)).toBe("2026/01/02 03:04");
  });

  test("0 は空文字", () => {
    expect(absoluteTime(0)).toBe("");
  });
});

describe("initials", () => {
  test("2 語以上なら各語の頭文字", () => {
    expect(initials("yuya kinjo")).toBe("YK");
    expect(initials("  Ada   Lovelace  King ")).toBe("AL");
  });

  test("1 語なら先頭 2 文字", () => {
    expect(initials("yuya")).toBe("YU");
    expect(initials("x")).toBe("X");
  });

  test("空なら ?", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("avatarColor", () => {
  test("同じ種からは同じ色", () => {
    expect(avatarColor("a@example.com")).toBe(avatarColor("a@example.com"));
  });

  test("パレットの色を返す", () => {
    expect(avatarColor("")).toBe("#5B8FF9");
    expect(avatarColor("someone")).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("basename / dirname", () => {
  test("最後の / で分ける", () => {
    expect(basename("src/lib/format.ts")).toBe("format.ts");
    expect(dirname("src/lib/format.ts")).toBe("src/lib");
  });

  test("/ が無ければファイル名だけ", () => {
    expect(basename("README.md")).toBe("README.md");
    expect(dirname("README.md")).toBe("");
  });
});
