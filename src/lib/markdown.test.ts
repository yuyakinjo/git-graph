import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  test("GFM の表・取り消し線・タスクリスト・自動リンクを描く", () => {
    const html = renderMarkdown(
      [
        "| a | b |",
        "| - | - |",
        "| 1 | 2 |",
        "",
        "~~old~~",
        "",
        "- [x] done",
        "- [ ] todo",
        "",
        "https://github.com",
      ].join("\n"),
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<del>old</del>");
    expect(html).toContain('<input checked="" disabled="" type="checkbox">');
    expect(html).toContain('<input disabled="" type="checkbox">');
    expect(html).toContain('<a href="https://github.com">https://github.com</a>');
  });

  test("段落内の単独改行を <br> にする (GitHub のコメントと同じ)", () => {
    expect(renderMarkdown("1 行目\n2 行目")).toBe("<p>1 行目<br>2 行目</p>\n");
  });

  test("[!NOTE] の引用を GitHub アラートにする", () => {
    const html = renderMarkdown("> [!WARNING]\n> 気をつけて");
    expect(html).toContain('<div class="markdown-alert markdown-alert-warning">');
    expect(html).toContain('<p class="markdown-alert-title">Warning</p>');
    expect(html).toContain("<p>気をつけて</p>");
    expect(html).not.toContain("[!WARNING]");
  });

  test("マーカー行の後に空行があっても本文を残す", () => {
    const html = renderMarkdown("> [!TIP]\n>\n> 本文");
    expect(html).toContain("markdown-alert-tip");
    expect(html).toContain("<p>本文</p>");
    expect(html).not.toContain("<p></p>");
  });

  test("マーカーと本文が同じ行ならただの引用のまま", () => {
    const html = renderMarkdown("> [!NOTE] 本文");
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("markdown-alert");
  });
});
