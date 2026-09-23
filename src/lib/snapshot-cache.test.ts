import { describe, expect, test } from "bun:test";
import type { RepoSnapshot } from "./repo-data";
import { snapshotHash } from "./snapshot-cache";

const snapshot = (subject: string) =>
  ({
    repo: { root: "/repo" },
    graph: { commits: [{ hash: "abc", subject }] },
    status: { staged: [], unstaged: [], conflicts: [] },
    branches: [],
    tags: [],
    stashes: [],
    worktrees: [],
  }) as unknown as RepoSnapshot;

describe("snapshotHash", () => {
  test("同じ内容なら同じハッシュ", () => {
    expect(snapshotHash(snapshot("a"))).toBe(snapshotHash(snapshot("a")));
  });

  test("内容が変われば (同じ長さでも) ハッシュが変わる", () => {
    expect(snapshotHash(snapshot("a"))).not.toBe(snapshotHash(snapshot("b")));
    expect(snapshotHash(snapshot("a"))).not.toBe(snapshotHash(snapshot("aa")));
  });

  test("長さ (36 進) と 8 桁の FNV-1a をつないだ形", () => {
    expect(snapshotHash(snapshot("a"))).toMatch(/^[0-9a-z]+-[0-9a-f]{8}$/);
  });
});
