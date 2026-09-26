import { getLocale, type Locale, t } from "../i18n";
import { api } from "./api";
import { parsePlan, validatePlan } from "./recompose";
import { KEY_COLORS, type ThemeKeys } from "./theme";
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

/**
 * Claude Code に渡すモデル。エイリアスなので常にその系統の最新が使われる。先頭が既定。
 * 設定画面の表示名は i18n の settings.models から引く。
 */
export const CLAUDE_CODE_MODELS = [
  { id: "sonnet", label: "Sonnet" },
  { id: "opus", label: "Opus" },
  { id: "haiku", label: "Haiku" },
] as const;
export type ClaudeCodeModel = (typeof CLAUDE_CODE_MODELS)[number]["id"];
export const DEFAULT_CLAUDE_CODE_MODEL: ClaudeCodeModel = CLAUDE_CODE_MODELS[0].id;
export const isClaudeCodeModel = (v: unknown): v is ClaudeCodeModel =>
  CLAUDE_CODE_MODELS.some((m) => m.id === v);

/** 手掛かりが無いときに AI に書かせる言語 (表示言語に合わせる) */
const LANGUAGE_NAME: Record<Locale, string> = { ja: "Japanese", en: "English" };
const outputLanguage = () => LANGUAGE_NAME[getLocale()];

/** コミットメッセージ用のシステムプロンプト (呼んだ時点の表示言語を反映する) */
export const commitSystem =
  () => `You write git commit messages for the staged changes a developer is about to commit.

Output only the commit message itself: no preamble, no explanation, no code fences, no quotes.
Match the language, tone, casing and format (e.g. Conventional Commits prefixes or not, subject length) of the repository's recent commit subjects when they are provided. If there are none, write in ${outputLanguage()}.
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
  const text = (await api.claudeGenerate(commitSystem(), buildPrompt(ctx), model, effort)).trim();
  if (!text) throw new Error(t().ai.emptyResponse);
  return text;
}

const prSystem =
  () => `You write GitHub pull request titles and descriptions for a branch a developer is about to open a PR for.

Output format: the first line is the PR title, then one blank line, then the PR body in GitHub-flavored Markdown. Output nothing else: no preamble, no explanation, no code fences around the whole output, no quotes, no "Title:" label.
If a pull request template is provided, the body must follow it: keep its headings and structure, fill in each section from the changes, keep checklists (tick items only when the changes clearly satisfy them), and drop HTML comments that are only instructions to the author. Leave a section short rather than inventing facts you cannot see.
If there is no template, write a concise body that explains what changed and why, with a short list of the notable changes.
Match the language of the commit messages and the template when they are provided. If there are none, write in ${outputLanguage()}.`;

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
  const text = (await api.claudeGenerate(prSystem(), buildPrPrompt(ctx), model, effort)).trim();
  const res = parsePrDescription(text);
  if (!res.title) throw new Error(t().ai.emptyResponse);
  return res;
}

const stashSystem =
  () => `You name a git stash so the developer can recognize it later in a list of stashes.

Output only the name itself on one line: no preamble, no explanation, no quotes, no trailing period, and no "On <branch>:" prefix.
Keep it short (about 40 characters at most) and describe what the work in progress is about, not the list of files.
Match the language of the current name when it is written in natural language. Otherwise write in ${outputLanguage()}.`;

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
    stashSystem(),
    buildStashPrompt(ctx, currentName),
    model,
    effort,
  );
  const name = text.trim().split("\n")[0].trim();
  if (!name) throw new Error(t().ai.emptyResponse);
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
- Commit messages: match the language, tone and format (e.g. Conventional Commits prefixes or not) of the repository's recent commit subjects when provided. If there are none, write in ${outputLanguage()}. A concise subject line; add a blank line and a short body only when the why genuinely needs explaining.
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
    if (ctx.compose && !plan.branch) errors.push(t().ai.missingBranch);
    if (!errors.length) return plan;
    invalid = { plan, errors };
  }
  throw new Error(t().ai.incompletePlan(invalid!.errors.join("\n")));
}

const themeSystem =
  () => `You design color themes for a desktop Git client. The developer gives you a palette of exactly ${KEY_COLORS.length} colors; assign each color to one of the theme's key color roles.

Roles:
- bg: the background of the whole app. Panels, borders and hover states are mixed from bg and fg. Usually the darkest or the lightest color.
- fg: the main text color. Must be very readable on bg (high contrast), usually at the opposite end of brightness from bg.
- accent: selection, focus rings, links, primary buttons and the current branch. The most distinctive, eye-catching color.
- green: success and added lines in diffs. Pick the color closest to green.
- red: errors, deleted lines in diffs and destructive actions. Pick the color closest to red.
- amber: warnings and modified files. Pick the color closest to yellow or orange.
- violet: secondary highlights such as tags and stashes. Whatever fits best among the rest.

Rules:
- Use every palette color exactly once, copied exactly as given (lowercase #rrggbb). Do not invent, adjust or reuse colors.
- Keep text roles (every role except bg) readable on bg where the palette allows it.

Output only a JSON object, with no code fences and no explanation:
{${KEY_COLORS.map((c) => `"${c}": "#rrggbb"`).join(", ")}}`;

function buildThemePrompt(
  palette: readonly string[],
  invalid?: { text: string; errors: string[] },
) {
  const parts = [`<palette>\n${palette.join("\n")}\n</palette>`];
  if (invalid) {
    parts.push(
      `Your previous answer was invalid:\n<answer>\n${invalid.text}\n</answer>\n<errors>\n${invalid.errors.join("\n")}\n</errors>\nFix these problems.`,
    );
  }
  parts.push("Assign the palette colors to the roles.");
  return parts.join("\n\n");
}

/**
 * AI の割り当てを読む。パレットの色をちょうど 1 回ずつ使っていないものは errors に理由を返す
 * (理由は AI に作り直させるときにそのまま渡すので英語)。
 */
export function parseThemeAssignment(
  text: string,
  palette: readonly string[],
): { keys: ThemeKeys; errors: [] } | { keys?: undefined; errors: string[] } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let raw: unknown;
  try {
    raw = start < 0 || end <= start ? undefined : JSON.parse(text.slice(start, end + 1));
  } catch {
    raw = undefined;
  }
  if (typeof raw !== "object" || raw === null)
    return { errors: ["The answer is not a JSON object."] };
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];
  const keys: Partial<ThemeKeys> = {};
  for (const c of KEY_COLORS) {
    const v = typeof obj[c] === "string" ? obj[c].trim().toLowerCase() : "";
    if (!palette.includes(v)) {
      errors.push(v ? `"${c}" is ${v}, which is not in the palette.` : `"${c}" is missing.`);
    } else keys[c] = v;
  }
  const used = Object.values(keys);
  for (const color of palette) {
    const n = used.filter((v) => v === color).length;
    if (n === 0) errors.push(`${color} is not used.`);
    else if (n > 1) errors.push(`${color} is used ${n} times.`);
  }
  return errors.length ? { errors } : { keys: keys as ThemeKeys, errors: [] };
}

/**
 * キーカラーと同じ数の色のパレットを、背景・文字・アクセントなどのどれに使うか AI に決めさせる。
 * パレットの色をちょうど 1 回ずつ使っていなければ、理由を添えて 1 回だけ作り直させる。
 */
export async function generateThemeKeys(
  model: ClaudeCodeModel,
  palette: readonly string[],
): Promise<ThemeKeys> {
  const effort = model === "haiku" ? undefined : "low";
  let invalid: { text: string; errors: string[] } | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = (
      await api.claudeGenerate(themeSystem(), buildThemePrompt(palette, invalid), model, effort)
    ).trim();
    if (!text) throw new Error(t().ai.emptyResponse);
    const res = parseThemeAssignment(text, palette);
    if (res.keys) return res.keys;
    invalid = { text, errors: res.errors };
  }
  throw new Error(t().ai.invalidThemeAssignment(invalid!.errors.join("\n")));
}
