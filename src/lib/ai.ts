import { api } from "./api";
import type { CommitContext } from "./types";

/**
 * コミットメッセージはインストール済みの Claude Code (`claude -p`) に作らせる。
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
