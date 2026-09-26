import { Marked } from "marked";

/**
 * GitHub の PR / Issue 本文と同じ見た目に寄せた Markdown → HTML 変換。
 * - GFM (表・取り消し線・タスクリスト・自動リンク)
 * - 本文中の単独改行も改行として出す (GitHub のコメント欄と同じ)
 * - `> [!NOTE]` などの GitHub アラート
 *
 * 返す HTML は未サニタイズ。DOM に入れる側で DOMPurify を通すこと。
 */

const ALERTS = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
} as const;

// 引用の先頭段落が `[!KIND]` だけの行で始まるときだけアラートにする (GitHub と同じ条件)
const ALERT_HEAD = /^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(<br>\n?|<\/p>\n?)/;

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    blockquote({ tokens }) {
      const inner = this.parser.parse(tokens);
      const m = ALERT_HEAD.exec(inner);
      if (!m) return `<blockquote>\n${inner}</blockquote>\n`;
      const kind = m[1].toLowerCase() as keyof typeof ALERTS;
      // `[!NOTE]<br>本文` なら段落は開いたまま残す。`[!NOTE]</p>` なら段落ごと消す
      const rest = m[2].startsWith("<br>")
        ? `<p>${inner.slice(m[0].length)}`
        : inner.slice(m[0].length);
      return (
        `<div class="markdown-alert markdown-alert-${kind}">\n` +
        `<p class="markdown-alert-title">${ALERTS[kind]}</p>\n${rest}</div>\n`
      );
    },
  },
});

export function renderMarkdown(src: string): string {
  return marked.parse(src, { async: false });
}
