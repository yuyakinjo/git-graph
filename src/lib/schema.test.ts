import { describe, expect, test } from "bun:test";
import * as z from "zod/mini";
import { lenientArray, readStored } from "./schema";

describe("lenientArray", () => {
  test("合わない要素だけを捨てる", () => {
    expect(lenientArray(z.string().check(z.trim())).parse([" a ", 1, null, "b"])).toEqual([
      "a",
      "b",
    ]);
  });

  test("配列でなければ失敗する", () => {
    expect(lenientArray(z.string()).safeParse("abc").success).toBe(false);
  });
});

describe("readStored", () => {
  const key = "gitsquid.test.readStored";
  const schema = z.record(z.string(), z.boolean());

  test("形が合えばその値を返す", () => {
    localStorage.setItem(key, JSON.stringify({ a: true }));
    expect(readStored(key, schema, {})).toEqual({ a: true });
  });

  test("無い・壊れた JSON・形が違うときは fallback", () => {
    localStorage.removeItem(key);
    expect(readStored(key, schema, null)).toBeNull();
    localStorage.setItem(key, "{broken");
    expect(readStored(key, schema, {})).toEqual({});
    localStorage.setItem(key, JSON.stringify({ a: "yes" }));
    expect(readStored(key, schema, {})).toEqual({});
  });
});
