import { useMemo } from "react";

interface Line {
  kind: "hunk" | "add" | "del" | "ctx" | "meta";
  text: string;
  oldNo?: number;
  newNo?: number;
}

function parseDiff(raw: string): Line[] {
  const out: Line[] = [];
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

const DIFF_EMPTY = "flex flex-1 items-center justify-center text-[12px] text-fg-faint";

/** 行番号と符号は選択対象から外し、コピーしたときにコードだけ残るようにする */
const LN = "w-[42px] flex-none pr-2 text-right text-fg-faint opacity-70 select-none";
const SIGN = "w-3 flex-none text-center select-none";

const DL_KIND: Record<string, string> = {
  add: "bg-green-10 text-diff-add",
  del: "bg-red-10 text-diff-del",
  hunk: "mt-1.5 mb-0.5 bg-bg-3 text-accent",
  meta: "text-fg-faint",
  ctx: "",
};

export function DiffView({ raw, loading }: { raw: string | null; loading?: boolean }) {
  const lines = useMemo(() => (raw ? parseDiff(raw) : []), [raw]);

  if (loading) return <div className={DIFF_EMPTY}>読み込み中...</div>;
  if (raw === null) return <div className={DIFF_EMPTY}>ファイルを選択すると差分を表示します</div>;
  if (!lines.length) return <div className={DIFF_EMPTY}>表示できる差分がありません</div>;

  return (
    <div className="flex-1 overflow-auto pb-3 font-mono text-[11.5px] leading-[1.55]">
      {lines.map((l, i) => (
        <div key={i} className={`flex whitespace-pre ${DL_KIND[l.kind]}`}>
          <span className={LN}>{l.kind === "add" || l.kind === "hunk" ? "" : (l.oldNo ?? "")}</span>
          <span className={LN}>{l.kind === "del" || l.kind === "hunk" ? "" : (l.newNo ?? "")}</span>
          <span className={SIGN}>{l.kind === "add" ? "+" : l.kind === "del" ? "-" : ""}</span>
          <span className="flex-1 pr-3">{l.text || "​"}</span>
        </div>
      ))}
    </div>
  );
}
