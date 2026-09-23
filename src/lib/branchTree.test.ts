import { describe, expect, test } from "bun:test";
import { buildBranchTree, type BranchNode } from "./branchTree";
import type { BranchInfo } from "./types";

const branch = (name: string, kind: BranchInfo["kind"] = "local"): BranchInfo => ({
  name,
  full: kind === "local" ? `refs/heads/${name}` : `refs/remotes/${name}`,
  kind,
  hash: "0000000",
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
  isHead: false,
  committedAt: 0,
  subject: "",
  worktreePath: null,
});

/** 比較しやすいようにラベルとキーだけの形に落とす */
type Shape = string | { folder: string; key: string; count: number; children: Shape[] };
const shape = (nodes: BranchNode[]): Shape[] =>
  nodes.map((n) =>
    n.type === "leaf"
      ? n.label
      : { folder: n.label, key: n.key, count: n.count, children: shape(n.children) },
  );

describe("buildBranchTree", () => {
  test("階層の無いブランチはそのまま葉になる", () => {
    const tree = buildBranchTree([branch("main"), branch("dev")]);
    expect(shape(tree)).toEqual(["main", "dev"]);
    expect(tree[0]).toMatchObject({ type: "leaf", key: "refs/heads/main" });
  });

  test("/ 区切りをフォルダにし、フォルダを葉より先に並べる", () => {
    const tree = buildBranchTree([
      branch("main"),
      branch("feature/a"),
      branch("feature/b"),
      branch("fix/x"),
      branch("fix/y"),
    ]);
    expect(shape(tree)).toEqual([
      { folder: "feature", key: "feature", count: 2, children: ["a", "b"] },
      { folder: "fix", key: "fix", count: 2, children: ["x", "y"] },
      "main",
    ]);
  });

  test("子が中間フォルダ 1 つだけなら a/b と畳む", () => {
    const tree = buildBranchTree([branch("user/yuya/topic1"), branch("user/yuya/topic2")]);
    expect(shape(tree)).toEqual([
      { folder: "user/yuya", key: "user/yuya", count: 2, children: ["topic1", "topic2"] },
    ]);
  });

  test("葉を持つフォルダは畳まない", () => {
    const tree = buildBranchTree([branch("a/x"), branch("a/b/y"), branch("a/b/z")]);
    expect(shape(tree)).toEqual([
      {
        folder: "a",
        key: "a",
        count: 3,
        children: [{ folder: "b", key: "a/b", count: 2, children: ["y", "z"] }, "x"],
      },
    ]);
  });

  test("リモート名も 1 階層として扱う", () => {
    const tree = buildBranchTree([
      branch("origin/main", "remote"),
      branch("origin/feature/a", "remote"),
    ]);
    expect(shape(tree)).toEqual([
      {
        folder: "origin",
        key: "origin",
        count: 2,
        children: [{ folder: "feature", key: "origin/feature", count: 1, children: ["a"] }, "main"],
      },
    ]);
  });

  test("空配列なら空のツリー", () => {
    expect(buildBranchTree([])).toEqual([]);
  });
});
