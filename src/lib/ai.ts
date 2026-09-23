import Anthropic from "@anthropic-ai/sdk";
import { api } from "./api";
import type { CommitContext } from "./types";

/**
 * API キー本体はキーチェーンに置き、localStorage には「登録済みか」だけを残す。
 * 起動のたびにキーチェーンを読まずにボタンの表示を決めるため。
 */
export const AI_KEY_SET_FLAG = "gitgraph.aiKeySet";
/** 以前 localStorage に平文で置いていたキー。起動時にキーチェーンへ移す。 */
const LEGACY_AI_KEY = "gitgraph.aiApiKey";

/**
 * API キーとして使えない値なら理由を返す。
 * sk-ant-oat... は Claude のサブスクリプション (Claude Code の setup-token など) の OAuth トークンで、
 * Messages API の x-api-key には使えない。
 */
export function invalidAiKeyReason(key: string): string | null {
  if (key.startsWith("sk-ant-oat")) {
    return "これは Claude の OAuth トークン (sk-ant-oat...) です。Anthropic Console で発行した API キー (sk-ant-api...) を入力してください。";
  }
  return null;
}

export async function migrateLegacyAiKey(): Promise<void> {
  const legacy = localStorage.getItem(LEGACY_AI_KEY);
  if (legacy === null) return;
  try {
    if (legacy.trim()) {
      await api.aiKeySet(legacy);
      localStorage.setItem(AI_KEY_SET_FLAG, "1");
    }
    localStorage.removeItem(LEGACY_AI_KEY);
  } catch {
    // キーチェーンに書けなかったときは平文のまま残し、次回の起動で再挑戦する
  }
}

/**
 * 生成に使う経路。
 * - claude-code: インストール済みの Claude Code (`claude -p`) に頼む。サブスクリプションのログインで動く。
 * - api: Anthropic Console の API キーで Messages API を直接呼ぶ。
 */
export const AI_PROVIDERS = [
  { id: "claude-code", label: "Claude Code（サブスクリプション）" },
  { id: "api", label: "Anthropic API キー" },
] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number]["id"];
export const DEFAULT_AI_PROVIDER: AiProvider = AI_PROVIDERS[0].id;
export const isAiProvider = (v: unknown): v is AiProvider => AI_PROVIDERS.some((p) => p.id === v);

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

/** API キーで使うモデル。先頭が既定。 */
export const AI_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5（高品質）" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5（バランス）" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5（高速・安価）" },
] as const;
export type AiModel = (typeof AI_MODELS)[number]["id"];
export const DEFAULT_AI_MODEL: AiModel = AI_MODELS[0].id;

export const isAiModel = (v: unknown): v is AiModel => AI_MODELS.some((m) => m.id === v);

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

/** API のエラーを画面に出す文言にする */
export function describeAiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError)
    return "API キーが正しくありません。設定を確認してください。";
  if (e instanceof Anthropic.PermissionDeniedError)
    return "この API キーではモデルを利用できません。";
  if (e instanceof Anthropic.RateLimitError)
    return "レート制限に達しました。少し待ってから再度お試しください。";
  if (e instanceof Anthropic.APIConnectionError) return "Anthropic API に接続できませんでした。";
  if (e instanceof Anthropic.APIError) return `API エラー (${e.status ?? "?"}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

/** Claude Code (`claude -p`) で作る。未インストール・未ログインなどは例外のメッセージに出る。 */
export async function generateWithClaudeCode(
  model: ClaudeCodeModel,
  ctx: CommitContext,
): Promise<string> {
  // Haiku は effort に対応していない
  const effort = model === "haiku" ? undefined : "low";
  const text = (await api.claudeGenerate(SYSTEM, buildPrompt(ctx), model, effort)).trim();
  if (!text) throw new Error("Claude Code から空の応答が返りました。");
  return text;
}

/** API キーで作る。失敗時は例外を投げる (describeAiError で文言にする)。 */
export async function generateWithApi(
  apiKey: string,
  model: AiModel,
  ctx: CommitContext,
): Promise<string> {
  // デスクトップアプリの WebView から直接呼ぶ。キーは利用者本人のもの。
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(ctx) }],
    // Haiku 4.5 は effort に対応していない
    ...(model === "claude-haiku-4-5" ? {} : { output_config: { effort: "low" as const } }),
    // Opus 5.5 は安全分類で断られた場合にサーバー側で別モデルに引き継がせる
    ...(model === "claude-opus-5-5"
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  });

  if (response.stop_reason === "refusal") {
    throw new Error("AI がこの差分に対するメッセージの生成を断りました。");
  }
  const text = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
  if (!text) throw new Error("AI から空の応答が返りました。");
  return text;
}
