import type { ThemedToken } from "shiki";
import { useT } from "../i18n";
import type { DiffLine } from "../lib/diff";
import { isCode } from "../lib/diff";

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

/** shiki の FontStyle はビットフラグ (1: italic / 2: bold / 4: underline / 8: strikethrough) */
function fontStyle(style: number | undefined) {
  if (!style) return undefined;
  return {
    fontStyle: style & 1 ? ("italic" as const) : undefined,
    fontWeight: style & 2 ? 600 : undefined,
    textDecoration: style & 4 ? "underline" : style & 8 ? "line-through" : undefined,
  };
}

/** ハイライト済みなら色付きトークン、まだ (または対象外) なら素のテキスト */
function lineBody(line: DiffLine, tokens: ThemedToken[] | undefined) {
  if (!tokens || !isCode(line.kind)) return line.text || "​";
  if (!tokens.length) return "​";
  return tokens.map((t, i) => (
    <span key={i} style={{ color: t.color, ...fontStyle(t.fontStyle) }}>
      {t.content}
    </span>
  ));
}

/**
 * 差分ビュー。行の解析と shiki のトークン化は store (openFile) 側で済ませてあり、
 * ここは描画だけを受け持つ。tokens は間に合っていなければ null で、素のテキストになる。
 */
export function DiffView({
  text,
  lines,
  tokens,
  loading,
}: {
  text: string | null;
  lines: DiffLine[];
  tokens: ThemedToken[][] | null;
  loading?: boolean;
}) {
  const m = useT().diffView;
  if (loading) return <div className={DIFF_EMPTY}>{m.loading}</div>;
  if (text === null) return <div className={DIFF_EMPTY}>{m.selectFile}</div>;
  if (!lines.length) return <div className={DIFF_EMPTY}>{m.noDiff}</div>;

  return (
    <div className="flex-1 overflow-auto pb-3 font-mono text-[11.5px] leading-[1.55]">
      {lines.map((l, i) => (
        <div key={i} className={`flex whitespace-pre ${DL_KIND[l.kind]}`}>
          <span className={LN}>{l.kind === "add" || l.kind === "hunk" ? "" : (l.oldNo ?? "")}</span>
          <span className={LN}>{l.kind === "del" || l.kind === "hunk" ? "" : (l.newNo ?? "")}</span>
          <span className={SIGN}>{l.kind === "add" ? "+" : l.kind === "del" ? "-" : ""}</span>
          <span className="flex-1 pr-3">{lineBody(l, tokens?.[i])}</span>
        </div>
      ))}
    </div>
  );
}
