import { describe, expect, test } from "bun:test";
import { isCode, parseDiff } from "./diff";

describe("parseDiff", () => {
  test("ヘッダ行を捨て、hunk から行番号を振る", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "index 1111111..2222222 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -10,3 +10,4 @@ function f() {",
      " keep",
      "-old",
      "+new",
      "+added",
      " tail",
    ].join("\n");
    expect(parseDiff(raw)).toEqual([
      { kind: "hunk", text: "@@ -10,3 +10,4 @@ function f() {" },
      { kind: "ctx", text: "keep", oldNo: 10, newNo: 10 },
      { kind: "del", text: "old", oldNo: 11 },
      { kind: "add", text: "new", newNo: 11 },
      { kind: "add", text: "added", newNo: 12 },
      { kind: "ctx", text: "tail", oldNo: 12, newNo: 13 },
    ]);
  });

  test("件数省略の hunk (@@ -1 +1 @@) も読める", () => {
    const lines = parseDiff("@@ -5 +7 @@\n-a\n+b");
    expect(lines[1]).toEqual({ kind: "del", text: "a", oldNo: 5 });
    expect(lines[2]).toEqual({ kind: "add", text: "b", newNo: 7 });
  });

  test("複数 hunk では行番号を hunk ごとに振り直す", () => {
    const lines = parseDiff("@@ -1,1 +1,1 @@\n x\n@@ -50,1 +60,1 @@\n y");
    expect(lines.filter((l) => l.kind === "ctx")).toEqual([
      { kind: "ctx", text: "x", oldNo: 1, newNo: 1 },
      { kind: "ctx", text: "y", oldNo: 50, newNo: 60 },
    ]);
  });

  test("バイナリ通知と改行なし通知は meta になる", () => {
    const lines = parseDiff(
      "Binary files a/x.png and b/x.png differ\n@@ -1 +1 @@\n-a\n\\ No newline at end of file",
    );
    expect(lines.map((l) => l.kind)).toEqual(["meta", "hunk", "del", "meta"]);
  });

  test("rename / mode / new file などのヘッダも捨てる", () => {
    const raw = [
      "similarity index 90%",
      "rename from a.ts",
      "rename to b.ts",
      "old mode 100644",
      "new mode 100755",
      "new file mode 100644",
      "deleted file mode 100644",
    ].join("\n");
    expect(parseDiff(raw)).toEqual([]);
  });

  test("空行は文脈行として扱い、末尾の空行だけ落とす", () => {
    const lines = parseDiff("@@ -1,3 +1,3 @@\n a\n\n b\n\n");
    expect(lines.map((l) => [l.kind, l.text])).toEqual([
      ["hunk", "@@ -1,3 +1,3 @@"],
      ["ctx", "a"],
      ["ctx", ""],
      ["ctx", "b"],
    ]);
  });

  test("空文字列は空配列", () => {
    expect(parseDiff("")).toEqual([]);
  });
});

test("isCode は add / del / ctx だけ真", () => {
  expect(isCode("add")).toBe(true);
  expect(isCode("del")).toBe(true);
  expect(isCode("ctx")).toBe(true);
  expect(isCode("hunk")).toBe(false);
  expect(isCode("meta")).toBe(false);
});
