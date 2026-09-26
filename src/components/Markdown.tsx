import { useMemo, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown } from "../lib/markdown";

/** リンクは WebView 内で遷移させず、既定のブラウザで開く */
function openLink(e: MouseEvent<HTMLDivElement>) {
  const a = (e.target as HTMLElement).closest("a");
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute("href") ?? "";
  if (/^https?:\/\//i.test(href)) void openUrl(href).catch(() => undefined);
}

/** GitHub 互換の Markdown 表示。見た目は styles.css の .markdown-body */
export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(renderMarkdown(source)), [source]);
  return (
    <div
      className={`markdown-body ${className}`}
      onClick={openLink}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
