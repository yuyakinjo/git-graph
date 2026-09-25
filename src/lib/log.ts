/**
 * デバッグ用のログ。
 *
 * - フロント側の出来事 (操作の開始・トースト・捕まえ損ねた例外) はここで直近のぶんを持つ
 * - Rust 側で実行した外部コマンドは api.appLogs() で取り、表示時に時刻順で混ぜる
 *
 * ログ画面 (LogModal) から丸ごとクリップボードへコピーして不具合報告に貼れる形にする。
 */
import type { CmdLog } from "./types";

export type LogLevel = "info" | "error";

export interface LogEntry {
  /** エポックミリ秒 */
  time: number;
  level: LogLevel;
  source: "app" | "cmd";
  title: string;
  detail?: string;
}

const MAX_APP_LOGS = 300;
const appEntries: LogEntry[] = [];

export function appLog(level: LogLevel, title: string, detail?: string) {
  appEntries.push({ time: Date.now(), level, source: "app", title, detail });
  if (appEntries.length > MAX_APP_LOGS) appEntries.splice(0, appEntries.length - MAX_APP_LOGS);
  // 開発中は WebView の DevTools でも追えるようにしておく
  if (level === "error") console.error(`[git-squid] ${title}`, detail ?? "");
  else console.info(`[git-squid] ${title}`, detail ?? "");
}

export function appLogs(): LogEntry[] {
  return appEntries.slice();
}

export function clearAppLogs() {
  appEntries.length = 0;
}

/** シェルに貼ってそのまま再実行できる程度にクォートする */
export function shellQuote(arg: string): string {
  if (arg !== "" && /^[\w@%+=:,./-]+$/.test(arg)) return arg;
  return `'${arg.replaceAll("'", `'\\''`)}'`;
}

export function fromCmdLog(c: CmdLog): LogEntry {
  const failed = c.code !== 0;
  const cmdline = [c.program, ...c.args].map(shellQuote).join(" ");
  // 成功時の stdout は status の定期取得などで膨らむだけなので、失敗時だけ載せる
  const detail = [
    `cwd: ${c.cwd || "-"}`,
    c.stderr ? `stderr:\n${c.stderr}` : "",
    failed && c.stdout ? `stdout:\n${c.stdout}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    time: c.time,
    level: failed ? "error" : "info",
    source: "cmd",
    title: `$ ${cmdline}  → exit ${c.code} (${c.durationMs}ms)`,
    detail,
  };
}

/** フロントのログとコマンドのログを時刻順に混ぜる (同時刻は元の順を保つ) */
export function mergeLogs(app: LogEntry[], cmds: CmdLog[]): LogEntry[] {
  return [...app, ...cmds.map(fromCmdLog)].sort((a, b) => a.time - b.time);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function logTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function formatEntry(e: LogEntry): string {
  const head = `[${logTime(e.time)}] ${e.level === "error" ? "ERROR" : "INFO "} ${e.title}`;
  if (!e.detail) return head;
  const body = e.detail
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
  return `${head}\n${body}`;
}

export function formatLogs(entries: LogEntry[]): string {
  return entries.map(formatEntry).join("\n");
}
