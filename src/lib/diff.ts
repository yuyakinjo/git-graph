import type { ThemedToken } from "shiki";
import type { DiffTheme } from "./highlight";
import { tokenizeLines } from "./highlight";

export interface DiffLine {
  kind: "hunk" | "add" | "del" | "ctx" | "meta";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** コードとして色を付ける行 (@@ ヘッダやバイナリ通知は対象外) */
export const isCode = (kind: DiffLine["kind"]) =>
  kind === "add" || kind === "del" || kind === "ctx";

/** git の unified diff を 1 行ずつの表示用データにほどく。 */
export function parseDiff(raw: string): DiffLine[] {
  const out: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const line of raw.split("\n")) {
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename ") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode")
    ) {
      continue;
    }
    if (line.startsWith("@@")) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (m) {
        oldNo = Number(m[1]);
        newNo = Number(m[2]);
      }
      out.push({ kind: "hunk", text: line });
      continue;
    }
    if (line.startsWith("Binary files") || line.startsWith("\\ No newline")) {
      out.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith("+")) {
      out.push({ kind: "add", text: line.slice(1), newNo: newNo++ });
    } else if (line.startsWith("-")) {
      out.push({ kind: "del", text: line.slice(1), oldNo: oldNo++ });
    } else if (line.startsWith(" ") || line === "") {
      if (line === "" && out.length === 0) continue;
      out.push({ kind: "ctx", text: line.slice(1), oldNo: oldNo++, newNo: newNo++ });
    }
  }
  while (out.length && out[out.length - 1].kind === "ctx" && out[out.length - 1].text === "")
    out.pop();
  return out;
}

/**
 * 差分行をシンタックスハイライトする (行番号 = トークン配列の添字)。
 * 追加行と削除行が混ざるので文法としては厳密ではないが、色の手掛かりとしては十分。
 * ハイライトできない場合 (言語不明・大きすぎる・行数がずれた) は null。
 */
export async function tokenizeDiff(
  lines: DiffLine[],
  path: string | undefined,
  theme: DiffTheme,
): Promise<ThemedToken[][] | null> {
  if (!lines.length) return null;
  // @@ 行などは空行に置き換えて渡す。行数を保ったまま文法を汚さないため。
  const code = lines.map((l) => (isCode(l.kind) ? l.text : "")).join("\n");
  const tokens = await tokenizeLines(code, path, theme);
  return tokens && tokens.length === lines.length ? tokens : null;
}
