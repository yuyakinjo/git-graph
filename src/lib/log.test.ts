import { describe, expect, test } from "bun:test";
import { formatEntry, fromCmdLog, mergeLogs, shellQuote, type LogEntry } from "./log";
import type { CmdLog } from "./types";

const cmd = (over: Partial<CmdLog> = {}): CmdLog => ({
  time: 2000,
  cwd: "/repo",
  program: "git",
  args: ["status"],
  code: 0,
  durationMs: 12,
  stdout: "",
  stderr: "",
  ...over,
});

describe("shellQuote", () => {
  test("記号を含まない引数はそのまま、空白や引用符を含むものは単引用符で囲む", () => {
    expect(shellQuote("--format=%H")).toBe("--format=%H");
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(shellQuote("")).toBe("''");
  });
});

describe("fromCmdLog", () => {
  test("成功したコマンドは stdout を載せない", () => {
    const e = fromCmdLog(cmd({ stdout: "big output" }));
    expect(e.level).toBe("info");
    expect(e.title).toBe("$ git status  → exit 0 (12ms)");
    expect(e.detail).toBe("cwd: /repo");
  });

  test("失敗したコマンドは error にして stderr と stdout を載せる", () => {
    const e = fromCmdLog(
      cmd({ args: ["commit", "-m", "fix bug"], code: 1, stdout: "out", stderr: "err" }),
    );
    expect(e.level).toBe("error");
    expect(e.title).toContain("git commit -m 'fix bug'");
    expect(e.detail).toBe("cwd: /repo\nstderr:\nerr\nstdout:\nout");
  });
});

describe("mergeLogs", () => {
  test("フロントとコマンドのログを時刻順に並べる", () => {
    const app: LogEntry[] = [
      { time: 1000, level: "info", source: "app", title: "a" },
      { time: 3000, level: "info", source: "app", title: "b" },
    ];
    expect(mergeLogs(app, [cmd()]).map((e) => e.source)).toEqual(["app", "cmd", "app"]);
  });
});

describe("formatEntry", () => {
  test("詳細は字下げして次の行に出す", () => {
    const e: LogEntry = {
      time: new Date(2026, 0, 2, 3, 4, 5, 6).getTime(),
      level: "error",
      source: "app",
      title: "失敗",
      detail: "x\ny",
    };
    expect(formatEntry(e)).toBe("[03:04:05.006] ERROR 失敗\n    x\n    y");
  });
});
