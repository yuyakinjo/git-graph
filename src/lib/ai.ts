import { api } from "./api";
import type { CommitContext, PrContext } from "./types";

/**
 * コミットメッセージや PR の説明はインストール済みの Claude Code (`claude -p`) に作らせる。
 * Claude のサブスクリプションでログインしていれば、キーの登録は要らない。
 */

/** Claude Code に渡すモデル。エイリアスなので常にその系統の最新が使われる。先頭が既定。 */
export const CLAUDE_CODE_MODELS = [
  { id: "sonnet", label: "Sonnet（最新・バランス）" },
  { id: "opus", label: "Opus（最新・高品質）" },
  { id: "haiku", label: "Haiku（最新・高速）" },
] as const;
export type ClaudeCodeModel = (typeof CLAUDE_CODE_MODELS)[number]["id"];
export const DEFAULT_CLAUDE_CODE_MODEL: ClaudeCodeModel = CLAUDE_CODE_MODELS[0].id;
export const isClaudeCodeModel = (v: unknown): v is ClaudeCodeModel =>
  CLAUDE_CODE_MODELS.some((m) => m.id === v);

const SYSTEM = `You write git commit messages for the staged changes a developer is about to commit.

Output only the commit message itself: no preamble, no explanation, no code fences, no quotes.
Match the language, tone, casing and format (e.g. Conventional Commits prefixes or not, subject length) of the repository's recent commit subjects when they are provided. If there are none, write in Japanese.
Start with a concise subject line. Add a blank line and a short body only when the change genuinely needs explaining (the why, not a file-by-file list).`;

function buildPrompt(ctx: CommitContext): string {
  const parts: string[] = [];
  if (ctx.recentSubjects.length) {
    parts.push(
      `<recent_commit_subjects>\n${ctx.recentSubjects.join("\n")}\n</recent_commit_subjects>`,
    );
  }
  if (ctx.previousMessage) {
    parts.push(
      `This is an amend. The commit being amended currently has this message; revise it so it describes the combined change:\n<previous_message>\n${ctx.previousMessage}\n</previous_message>`,
    );
  }
  parts.push(`<diff>\n${ctx.diff}\n</diff>`);
  if (ctx.truncated) {
    parts.push(
      "The diff above was cut off because it is very large; infer the rest from what is shown.",
    );
  }
  parts.push("Write the commit message for this change.");
  return parts.join("\n\n");
}

/** 差分からコミットメッセージを作る。未インストール・未ログインなどは例外のメッセージに出る。 */
export async function generateCommitMessage(
  model: ClaudeCodeModel,
  ctx: CommitContext,
): Promise<string> {
  // Haiku は effort に対応していない
  const effort = model === "haiku" ? undefined : "low";
  const text = (await api.claudeGenerate(SYSTEM, buildPrompt(ctx), model, effort)).trim();
  if (!text) throw new Error("Claude Code から空の応答が返りました。");
  return text;
}

const PR_SYSTEM = `You write GitHub pull request titles and descriptions for a branch a developer is about to open a PR for.

Output format: the first line is the PR title, then one blank line, then the PR body in GitHub-flavored Markdown. Output nothing else: no preamble, no explanation, no code fences around the whole output, no quotes, no "Title:" label.
If a pull request template is provided, the body must follow it: keep its headings and structure, fill in each section from the changes, keep checklists (tick items only when the changes clearly satisfy them), and drop HTML comments that are only instructions to the author. Leave a section short rather than inventing facts you cannot see.
If there is no template, write a concise body that explains what changed and why, with a short list of the notable changes.
Match the language of the commit messages and the template when they are provided. If there are none, write in Japanese.`;

function buildPrPrompt(ctx: PrContext): string {
  const parts: string[] = [];
  if (ctx.template?.trim()) {
    parts.push(`<pull_request_template>\n${ctx.template.trim()}\n</pull_request_template>`);
  }
  if (ctx.commits.length) {
    parts.push(`<commits>\n${ctx.commits.join("\n\n---\n\n")}\n</commits>`);
  }
  parts.push(`<diff>\n${ctx.diff}\n</diff>`);
  if (ctx.truncated) {
    parts.push(
      "The diff above was cut off because it is very large; infer the rest from what is shown.",
    );
  }
  parts.push("Write the pull request title and body for this change.");
  return parts.join("\n\n");
}

/** 「1 行目がタイトル、空行のあと本文」の応答を分ける */
export function parsePrDescription(text: string): { title: string; body: string } {
  const trimmed = text.trim();
  const nl = trimmed.indexOf("\n");
  const first = nl < 0 ? trimmed : trimmed.slice(0, nl);
  const title = first.replace(/^#+\s*/, "").trim();
  const body = nl < 0 ? "" : trimmed.slice(nl + 1).trim();
  return { title, body };
}

/** ブランチの差分とコミット (テンプレートがあればそれに沿って) から PR のタイトルと本文を作る */
export async function generatePrDescription(
  model: ClaudeCodeModel,
  ctx: PrContext,
): Promise<{ title: string; body: string }> {
  const effort = model === "haiku" ? undefined : "low";
  const text = (await api.claudeGenerate(PR_SYSTEM, buildPrPrompt(ctx), model, effort)).trim();
  const res = parsePrDescription(text);
  if (!res.title) throw new Error("Claude Code から空の応答が返りました。");
  return res;
}
