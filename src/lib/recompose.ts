import type { ChangedFile, RecomposePlan, RepoInfo } from "./types";

/**
 * recompose: ブランチの変更をまとまりのある単位のコミットに組み直し、
 * `RECOMPOSE_PREFIX` を付けた新しいブランチに積む。
 * compose: 既定ブランチ上の未プッシュのコミットと作業中の変更を、AI が名付けた新しいブランチに切り出す。
 */
export const RECOMPOSE_PREFIX = "recompose/";

export type RecomposeMode = "recompose" | "compose";

/**
 * 今のブランチで何ができるか。既定ブランチにいて差分 (未プッシュのコミット・作業中の変更) も
 * 無いとき、detached HEAD やコミットが無いとき、マージなどの途中は null (無効)。
 */
export function recomposeMode(
  repo: Pick<RepoInfo, "headBranch" | "headHash" | "defaultBranch" | "state"> | null,
  head: { ahead: number } | null,
  dirty: boolean,
): RecomposeMode | null {
  if (!repo?.headBranch || !repo.headHash || repo.state !== "clean") return null;
  if (repo.headBranch !== repo.defaultBranch) return "recompose";
  return dirty || (head?.ahead ?? 0) > 0 ? "compose" : null;
}

/** 新しいブランチ名の初期値 */
export const recomposeBranchName = (branch: string) => `${RECOMPOSE_PREFIX}${branch}`;

/** AI の応答から JSON のプランを取り出す。コードフェンスや前置きが付いていても拾う。 */
export function parsePlan(text: string): RecomposePlan {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI の応答に JSON のプランがありません");
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new Error(`AI の応答を JSON として読めません: ${String(e)}`);
  }
  const obj = (raw ?? {}) as { branch?: unknown; commits?: unknown };
  if (!Array.isArray(obj.commits)) throw new Error("AI の応答に commits がありません");
  const commits = obj.commits.map((c) => {
    const item = (c ?? {}) as { message?: unknown; files?: unknown };
    return {
      message: typeof item.message === "string" ? item.message.trim() : "",
      files: Array.isArray(item.files)
        ? item.files.filter((f): f is string => typeof f === "string").map((f) => f.trim())
        : [],
    };
  });
  const branch = typeof obj.branch === "string" ? obj.branch.trim() : "";
  return branch ? { branch, commits } : { commits };
}

/**
 * すべての変更がちょうど 1 回ずつ含まれているかを確かめる。問題が無ければ空配列。
 * (実行時は Rust 側でも同じ検証をする)
 */
export function validatePlan(plan: RecomposePlan, files: ChangedFile[]): string[] {
  const known = new Set(files.map((f) => f.path));
  const seen = new Set<string>();
  const errors: string[] = [];
  if (plan.commits.length === 0) errors.push("コミットが 1 つもありません");
  plan.commits.forEach((c, i) => {
    const n = i + 1;
    if (!c.message) errors.push(`${n} 番目のコミットにメッセージがありません`);
    if (c.files.length === 0) errors.push(`${n} 番目のコミットにファイルがありません`);
    for (const f of c.files) {
      if (!known.has(f)) errors.push(`変更の一覧に無いファイルがあります: ${f}`);
      else if (seen.has(f)) errors.push(`${f} が複数のコミットに含まれています`);
      seen.add(f);
    }
  });
  const missing = files.filter((f) => !seen.has(f.path)).map((f) => f.path);
  if (missing.length)
    errors.push(`どのコミットにも入っていないファイルがあります: ${missing.join(", ")}`);
  return errors;
}
