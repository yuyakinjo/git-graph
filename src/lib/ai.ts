import { api } from "./api";
import { parsePlan, validatePlan } from "./recompose";
import type {
  CommitContext,
  PrContext,
  RecomposeContext,
  RecomposePlan,
  StashContext,
} from "./types";

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

const STASH_SYSTEM = `You name a git stash so the developer can recognize it later in a list of stashes.

Output only the name itself on one line: no preamble, no explanation, no quotes, no trailing period, and no "On <branch>:" prefix.
Keep it short (about 40 characters at most) and describe what the work in progress is about, not the list of files.
Match the language of the current name when it is written in natural language. Otherwise write in Japanese.`;

function buildStashPrompt(ctx: StashContext, currentName: string): string {
  const parts = [`<current_name>\n${currentName}\n</current_name>`, `<diff>\n${ctx.diff}\n</diff>`];
  if (ctx.truncated) {
    parts.push(
      "The diff above was cut off because it is very large; infer the rest from what is shown.",
    );
  }
  parts.push("Write the name for this stash.");
  return parts.join("\n\n");
}

/** stash の中身から、一覧で見分けやすい名前を作る */
export async function generateStashName(
  model: ClaudeCodeModel,
  ctx: StashContext,
  currentName: string,
): Promise<string> {
  const effort = model === "haiku" ? undefined : "low";
  const text = await api.claudeGenerate(
    STASH_SYSTEM,
    buildStashPrompt(ctx, currentName),
    model,
    effort,
  );
  const name = text.trim().split("\n")[0].trim();
  if (!name) throw new Error("Claude Code から空の応答が返りました。");
  return name;
}

const recomposeSystem = (
  compose: boolean,
) => `You reorganize the changes on a git branch into a clean series of commits.

You are given every file changed between the branch's fork point and its final state, with the diff. Group the files into commits so that each commit is one coherent, self-contained change (a feature, a fix, a refactor, tests, docs, config, ...). Order the commits so that each builds on the previous ones: shared types, utilities and refactors come before the code that depends on them.

Rules:
- Every listed file must appear in exactly one commit. A file cannot be split across commits.
- Use the file paths exactly as listed. For a rename, use the new path; the old path moves with it.
- Prefer a few meaningful commits over many tiny ones, but do not lump unrelated changes together.
- The developer's existing commit messages on the branch hint at the intent; use them, but do not copy their grouping.
- Commit messages: match the language, tone and format (e.g. Conventional Commits prefixes or not) of the repository's recent commit subjects when provided. If there are none, write in Japanese. A concise subject line; add a blank line and a short body only when the why genuinely needs explaining.
${
  compose
    ? "- Also propose a short git branch name for the whole change: lowercase ASCII, kebab-case, with a type prefix such as feature/, fix/, refactor/, docs/ or chore/.\n"
    : ""
}
Output only a JSON object, with no code fences and no explanation:
${compose ? '{"branch": "<branch name>", "commits": [{"message": "<commit message>", "files": ["<path>", ...]}, ...]}' : '{"commits": [{"message": "<commit message>", "files": ["<path>", ...]}, ...]}'}`;

/** ユーザーとのやり取り (再プランのたびに積む) */
export interface RecomposeRound {
  plan: RecomposePlan;
  /** そのプランに対するユーザーのコメント */
  comment: string;
}

function buildRecomposePrompt(
  ctx: RecomposeContext,
  rounds: RecomposeRound[],
  invalid?: { plan: RecomposePlan; errors: string[] },
): string {
  const parts: string[] = [];
  if (ctx.recentSubjects.length) {
    parts.push(
      `<recent_commit_subjects>\n${ctx.recentSubjects.join("\n")}\n</recent_commit_subjects>`,
    );
  }
  if (ctx.commits.length) {
    parts.push(`<existing_commits>\n${ctx.commits.join("\n\n---\n\n")}\n</existing_commits>`);
  }
  const files = ctx.files.map((f) =>
    f.origPath ? `${f.status}\t${f.origPath} -> ${f.path}` : `${f.status}\t${f.path}`,
  );
  parts.push(`<changed_files>\n${files.join("\n")}\n</changed_files>`);
  parts.push(`<diff>\n${ctx.diff}\n</diff>`);
  if (ctx.truncated) {
    parts.push(
      "The diff above was cut off because it is very large; infer the rest from the file list and what is shown.",
    );
  }
  if (rounds.length) {
    const history = rounds
      .map(
        (r, i) =>
          `<round index="${i + 1}">\n<plan>\n${JSON.stringify(r.plan)}\n</plan>\n<feedback>\n${r.comment}\n</feedback>\n</round>`,
      )
      .join("\n");
    parts.push(
      `The developer reviewed earlier plans and left feedback (latest last):\n${history}\n\nRevise the latest plan to address all of the feedback, keeping what they did not ask to change.`,
    );
  }
  if (invalid) {
    parts.push(
      `Your previous answer was invalid:\n<plan>\n${JSON.stringify(invalid.plan)}\n</plan>\n<errors>\n${invalid.errors.join("\n")}\n</errors>\nFix these problems.`,
    );
  }
  parts.push(rounds.length ? "Write the revised plan." : "Write the plan.");
  return parts.join("\n\n");
}

/**
 * ブランチの変更からコミットプランを作る。すべての変更をちょうど 1 回ずつ含まない
 * プランが返ったら、理由を添えて 1 回だけ作り直させる。
 */
export async function generateRecomposePlan(
  model: ClaudeCodeModel,
  ctx: RecomposeContext,
  rounds: RecomposeRound[] = [],
): Promise<RecomposePlan> {
  // 変更のまとまりと順序を考えさせるので、コミットメッセージより少し深く考えさせる
  const effort = model === "haiku" ? undefined : "medium";
  const system = recomposeSystem(ctx.compose);
  let invalid: { plan: RecomposePlan; errors: string[] } | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await api.claudeGenerate(
      system,
      buildRecomposePrompt(ctx, rounds, invalid),
      model,
      effort,
    );
    const plan = parsePlan(text);
    const errors = validatePlan(plan, ctx.files);
    if (ctx.compose && !plan.branch) errors.push("branch (ブランチ名) がありません");
    if (!errors.length) return plan;
    invalid = { plan, errors };
  }
  throw new Error(`AI のプランが不完全です:\n${invalid!.errors.join("\n")}`);
}
