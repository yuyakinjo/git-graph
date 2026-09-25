import { describe, expect, test } from "bun:test";
import {
  SECTION_IDS,
  loadSectionOrder,
  moveSection,
  normalizeOrder,
  saveSectionOrder,
  type SectionId,
} from "./sectionOrder";

describe("normalizeOrder", () => {
  test("配列でなければ既定の並び", () => {
    expect(normalizeOrder(null)).toEqual([...SECTION_IDS]);
    expect(normalizeOrder({ a: 1 })).toEqual([...SECTION_IDS]);
  });

  test("未知の id と重複を捨て、足りないものは末尾に足す", () => {
    expect(normalizeOrder(["tag", "bogus", "pr", "tag", 3])).toEqual([
      "tag",
      "pr",
      "local",
      "remote",
      "stash",
      "worktree",
    ]);
  });
});

describe("loadSectionOrder / saveSectionOrder", () => {
  test("保存した並びを読み戻す", () => {
    const order: SectionId[] = ["pr", "local", "remote", "tag", "stash", "worktree"];
    saveSectionOrder(order);
    expect(loadSectionOrder()).toEqual(order);
  });

  test("壊れた値なら既定の並び", () => {
    localStorage.setItem("gitsquid.sectionOrder", "{");
    expect(loadSectionOrder()).toEqual([...SECTION_IDS]);
  });
});

describe("moveSection", () => {
  const order: SectionId[] = ["local", "remote", "pr", "stash"];

  test("前へ動かす", () => {
    expect(moveSection(order, "pr", 0)).toEqual(["pr", "local", "remote", "stash"]);
  });

  test("後ろへ動かす (index は元の並び基準)", () => {
    expect(moveSection(order, "local", 3)).toEqual(["remote", "pr", "local", "stash"]);
    expect(moveSection(order, "local", 4)).toEqual(["remote", "pr", "stash", "local"]);
  });

  test("自分の前後に落としても変わらない", () => {
    expect(moveSection(order, "remote", 1)).toBe(order);
    expect(moveSection(order, "remote", 2)).toBe(order);
  });
});
