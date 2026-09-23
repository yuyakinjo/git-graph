import { describe, expect, test } from "bun:test";
import { groupRefs } from "./graphRefs";
import type { RefDeco } from "./types";

const ref = (kind: RefDeco["kind"], name: string, isHead = false): RefDeco => ({
  kind,
  name,
  full: name,
  isHead,
});

describe("groupRefs", () => {
  test("チェックアウト中のローカルブランチを主にする", () => {
    const other = ref("head", "dev");
    const head = ref("head", "main", true);
    const tag = ref("tag", "v1");
    const g = groupRefs([other, tag, head], new Map());
    expect(g.primary).toBe(head);
    expect(g.tracking).toBeUndefined();
    expect(g.others).toEqual([other, tag]);
  });

  test("HEAD が無ければ最初のローカルブランチ、それも無ければ先頭", () => {
    const tag = ref("tag", "v1");
    const dev = ref("head", "dev");
    expect(groupRefs([tag, dev], new Map()).primary).toBe(dev);
    expect(groupRefs([tag], new Map()).primary).toBe(tag);
  });

  test("主ブランチの upstream が同じコミットにあれば tracking に畳む", () => {
    const main = ref("head", "main", true);
    const upstream = ref("remote", "origin/main");
    const unrelated = ref("remote", "upstream/main");
    const g = groupRefs([main, unrelated, upstream], new Map([["main", "origin/main"]]));
    expect(g.tracking).toBe(upstream);
    expect(g.others).toEqual([unrelated]);
  });

  test("upstream がこのコミットに無ければ畳まない", () => {
    const main = ref("head", "main", true);
    const other = ref("remote", "origin/dev");
    const g = groupRefs([main, other], new Map([["main", "origin/main"]]));
    expect(g.tracking).toBeUndefined();
    expect(g.others).toEqual([other]);
  });

  test("主がリモートなら upstream は引かない", () => {
    const remote = ref("remote", "origin/main");
    const g = groupRefs([remote], new Map([["origin/main", "origin/main"]]));
    expect(g.primary).toBe(remote);
    expect(g.tracking).toBeUndefined();
  });

  test("空なら何も無い", () => {
    const g = groupRefs([], new Map());
    expect(g.primary).toBeUndefined();
    expect(g.tracking).toBeUndefined();
    expect(g.others).toEqual([]);
  });
});
