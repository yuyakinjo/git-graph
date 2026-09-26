import * as z from "zod/mini";
import { t } from "../i18n";
import { lenientArray } from "./schema";
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

const trimmed = z.string().check(z.trim());

/**
 * AI が返すプランの形。commits さえ配列なら、崩れた項目は空にして validatePlan で理由を伝える
 * (文字列でないファイルは捨てる)。
 */
const PlanSchema = z.object({
  branch: z.catch(trimmed, ""),
  commits: z.array(
    z.catch(
      z.object({ message: z.catch(trimmed, ""), files: z.catch(lenientArray(trimmed), []) }),
      { message: "", files: [] },
    ),
  ),
});

/** AI の応答から JSON のプランを取り出す。コードフェンスや前置きが付いていても拾う。 */
export function parsePlan(text: string): RecomposePlan {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(t().recompose.noJsonPlan);
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new Error(t().recompose.invalidJson(String(e)));
  }
  const r = PlanSchema.safeParse(raw);
  if (!r.success) throw new Error(t().recompose.noCommitsField);
  const { branch, commits } = r.data;
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
  const m = t().recompose;
  if (plan.commits.length === 0) errors.push(m.noCommits);
  plan.commits.forEach((c, i) => {
    const n = i + 1;
    if (!c.message) errors.push(m.commitNoMessage(n));
    if (c.files.length === 0) errors.push(m.commitNoFiles(n));
    for (const f of c.files) {
      if (!known.has(f)) errors.push(m.unknownFile(f));
      else if (seen.has(f)) errors.push(m.duplicateFile(f));
      seen.add(f);
    }
  });
  const missing = files.filter((f) => !seen.has(f.path)).map((f) => f.path);
  if (missing.length) errors.push(m.missingFiles(missing.join(", ")));
  return errors;
}
