import { describe, expect, test } from "bun:test";
import type { FileEntry, StatusData } from "../lib/types";
import {
  clampColumnWidth,
  DEFAULT_COLUMN_WIDTHS,
  hasChanges,
  loadColumns,
  loadColumnWidths,
  loadPaths,
  MAX_COLUMN_WIDTH,
  resolveWipTarget,
} from "./store";

const file = (path: string, init: Partial<FileEntry> = {}): FileEntry => ({
  path,
  origPath: null,
  indexStatus: "M",
  workStatus: "M",
  untracked: false,
  conflict: false,
  ...init,
});

const status = (init: Partial<StatusData> = {}): StatusData => ({
  staged: [],
  unstaged: [],
  conflicts: [],
  ...init,
});

describe("clampColumnWidth", () => {
  test("列ごとの最小幅と共通の最大幅に収めて整数にする", () => {
    expect(clampColumnWidth("sha", 10)).toBe(48);
    expect(clampColumnWidth("refs", 10_000)).toBe(MAX_COLUMN_WIDTH);
    expect(clampColumnWidth("author", 123.6)).toBe(124);
  });
});

describe("loadColumnWidths", () => {
  test("未保存・壊れた JSON なら既定幅", () => {
    expect(loadColumnWidths()).toEqual(DEFAULT_COLUMN_WIDTHS);
    localStorage.setItem("gitgraph.graphColumnWidths", "{broken");
    expect(loadColumnWidths()).toEqual(DEFAULT_COLUMN_WIDTHS);
  });

  test("保存値を範囲に収めて読み、数でない値は無視する", () => {
    localStorage.setItem(
      "gitgraph.graphColumnWidths",
      JSON.stringify({ refs: 5, sha: 100, author: "wide", date: null }),
    );
    expect(loadColumnWidths()).toEqual({ ...DEFAULT_COLUMN_WIDTHS, refs: 60, sha: 100 });
  });

  test("0 (自動) はグラフ列だけ認める", () => {
    localStorage.setItem("gitgraph.graphColumnWidths", JSON.stringify({ graph: 0, sha: 0 }));
    const w = loadColumnWidths();
    expect(w.graph).toBe(0);
    expect(w.sha).toBe(48);
  });
});

describe("loadColumns", () => {
  test("既定では SHA・作者・ノードアバターを隠す", () => {
    const cols = loadColumns();
    expect(cols.sha).toBe(false);
    expect(cols.author).toBe(false);
    expect(cols.nodeAvatar).toBe(false);
    expect(cols.graph).toBe(true);
    expect(cols.subject).toBe(true);
  });

  test("保存された真偽値だけを上書きする", () => {
    localStorage.setItem(
      "gitgraph.graphColumns",
      JSON.stringify({ sha: true, graph: "no", unknown: true }),
    );
    const cols = loadColumns();
    expect(cols.sha).toBe(true);
    expect(cols.graph).toBe(true);
    expect("unknown" in cols).toBe(false);
  });
});

describe("loadPaths", () => {
  test("文字列の配列だけを読む", () => {
    localStorage.setItem("k", JSON.stringify(["/a", 1, "/b", null]));
    expect(loadPaths("k")).toEqual(["/a", "/b"]);
  });

  test("配列でない・壊れている・未保存なら空", () => {
    localStorage.setItem("obj", JSON.stringify({ a: 1 }));
    localStorage.setItem("bad", "[");
    expect(loadPaths("obj")).toEqual([]);
    expect(loadPaths("bad")).toEqual([]);
    expect(loadPaths("none")).toEqual([]);
  });
});

describe("hasChanges", () => {
  test("staged / unstaged / conflicts のどれかがあれば真", () => {
    expect(hasChanges(null)).toBe(false);
    expect(hasChanges(status())).toBe(false);
    expect(hasChanges(status({ staged: [file("a")] }))).toBe(true);
    expect(hasChanges(status({ unstaged: [file("a")] }))).toBe(true);
    expect(hasChanges(status({ conflicts: [file("a")] }))).toBe(true);
  });
});

describe("resolveWipTarget", () => {
  test("status が無ければ null", () => {
    expect(resolveWipTarget(null, "a", "staged")).toBeNull();
  });

  test("staged を優先していて staged にあればそれを選ぶ", () => {
    const s = status({ staged: [file("a")], unstaged: [file("a")] });
    expect(resolveWipTarget(s, "a", "staged")).toEqual({ source: "staged", path: "a" });
  });

  test("staged から消えたら作業ツリー側に移る", () => {
    const s = status({ unstaged: [file("a")] });
    expect(resolveWipTarget(s, "a", "staged")).toEqual({ source: "unstaged", path: "a" });
  });

  test("作業ツリー側を優先し、無ければ staged に移る", () => {
    const both = status({ staged: [file("a")], unstaged: [file("a")] });
    expect(resolveWipTarget(both, "a", "unstaged")).toEqual({ source: "unstaged", path: "a" });
    const stagedOnly = status({ staged: [file("a")] });
    expect(resolveWipTarget(stagedOnly, "a", "unstaged")).toEqual({ source: "staged", path: "a" });
  });

  test("未追跡ファイルは untracked、衝突ファイルは unstaged として扱う", () => {
    const s = status({
      unstaged: [file("new", { untracked: true })],
      conflicts: [file("c", { conflict: true })],
    });
    expect(resolveWipTarget(s, "new", "unstaged")).toEqual({ source: "untracked", path: "new" });
    expect(resolveWipTarget(s, "c", "unstaged")).toEqual({ source: "unstaged", path: "c" });
  });

  test("どこにも無ければ null", () => {
    expect(resolveWipTarget(status({ staged: [file("b")] }), "a", "unstaged")).toBeNull();
  });
});
