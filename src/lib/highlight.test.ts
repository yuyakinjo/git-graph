import { describe, expect, test } from "bun:test";
import { DEFAULT_DIFF_THEME, isDiffTheme, langOf } from "./highlight";

describe("langOf", () => {
  test("拡張子をそのまま言語 ID の候補にする", () => {
    expect(langOf("src/App.tsx")).toBe("tsx");
    expect(langOf("src-tauri/src/lib.rs")).toBe("rs");
    expect(langOf("README.MD")).toBe("md");
  });

  test("ずれる拡張子は別名で直す", () => {
    expect(langOf("a/b.hpp")).toBe("cpp");
    expect(langOf("x.h")).toBe("c");
    expect(langOf("icon.svg")).toBe("xml");
    expect(langOf(".zsh")).toBeNull();
    expect(langOf("dot.zsh")).toBe("shellscript");
  });

  test("拡張子の無い設定ファイルはファイル名で決める", () => {
    expect(langOf("docker/Dockerfile")).toBe("dockerfile");
    expect(langOf("Makefile")).toBe("makefile");
    expect(langOf("Gemfile")).toBe("ruby");
  });

  test("判定できなければ null", () => {
    expect(langOf(undefined)).toBeNull();
    expect(langOf("LICENSE")).toBeNull();
    expect(langOf(".gitignore")).toBeNull();
  });
});

describe("isDiffTheme", () => {
  test("用意したテーマ ID だけ真", () => {
    expect(isDiffTheme(DEFAULT_DIFF_THEME)).toBe(true);
    expect(isDiffTheme("dracula")).toBe(true);
    expect(isDiffTheme("solarized-light")).toBe(false);
    expect(isDiffTheme(null)).toBe(false);
  });
});
