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
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("new file") || line.startsWith("deleted file") || line.startsWith("similarity index") || line.startsWith("rename ") || line.startsWith("old mode") || line.startsWith("new mode")) {
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
  while (out.length && out[out.length - 1].kind === "ctx" && out[out.length - 1].text === "") out.pop();
  return out;
}

export function DiffView({ raw, loading }: { raw: string | null; loading?: boolean }) {
  const lines = useMemo(() => (raw ? parseDiff(raw) : []), [raw]);

  if (loading) return <div className="diff-empty">読み込み中...</div>;
  if (raw === null) return <div className="diff-empty">ファイルを選択すると差分を表示します</div>;
  if (!lines.length) return <div className="diff-empty">表示できる差分がありません</div>;

  return (
    <div className="diff">
      {lines.map((l, i) => (
        <div key={i} className={`dl ${l.kind}`}>
          <span className="ln">{l.kind === "add" || l.kind === "hunk" ? "" : (l.oldNo ?? "")}</span>
          <span className="ln">{l.kind === "del" || l.kind === "hunk" ? "" : (l.newNo ?? "")}</span>
          <span className="sign">{l.kind === "add" ? "+" : l.kind === "del" ? "-" : ""}</span>
          <span className="code">{l.text || "​"}</span>
        </div>
      ))}
    </div>
  );
}
