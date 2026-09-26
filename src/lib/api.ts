import { invoke } from "@tauri-apps/api/core";
import type {
  BranchInfo,
  CmdLog,
  CommitContext,
  PrContext,
  CommitDetail,
  DiffFile,
  GhStatus,
  GraphData,
  ProjectEntry,
  PullRequest,
  RecomposeContext,
  RecomposeOp,
  RepoInfo,
  StashContext,
  StashInfo,
  StatusData,
  TagInfo,
  TidyItem,
  TidyPlan,
  TidyResult,
  WorktreeInfo,
} from "./types";

export const api = {
  // 読み取り
  repoOpen: (path: string) => invoke<RepoInfo>("repo_open", { path }),
  graphLoad: (dir: string, limit: number) => invoke<GraphData>("graph_load", { dir, limit }),
  statusLoad: (dir: string) => invoke<StatusData>("status_load", { dir }),
  branchesLoad: (dir: string) => invoke<BranchInfo[]>("branches_load", { dir }),
  tagsLoad: (dir: string) => invoke<TagInfo[]>("tags_load", { dir }),
  stashLoad: (dir: string) => invoke<StashInfo[]>("stash_load", { dir }),
  worktreeLoad: (dir: string) => invoke<WorktreeInfo[]>("worktree_load", { dir }),
  commitDetail: (dir: string, sha: string) => invoke<CommitDetail>("commit_detail", { dir, sha }),
  wipFiles: (dir: string, staged: boolean) => invoke<DiffFile[]>("wip_files", { dir, staged }),
  stashFiles: (dir: string, refname: string) => invoke<DiffFile[]>("stash_files", { dir, refname }),
  diffText: (dir: string, kind: string, path: string, sha?: string, context = 3) =>
    invoke<string>("diff_text", { dir, kind, path, sha, context }),
  lastCommitMessage: (dir: string) => invoke<string>("last_commit_message", { dir }),
  /** 次のコミットに入る差分 (AI のコミットメッセージ生成用) */
  commitContext: (dir: string, amend: boolean) =>
    invoke<CommitContext>("commit_context", { dir, amend }),
  prContext: (dir: string, p: { remote: string; base: string; head: string }) =>
    invoke<PrContext>("pr_context", { dir, ...p }),
  scanRepos: (roots: string[], depth: number) =>
    invoke<ProjectEntry[]>("scan_repos", { roots, depth }),
  homeDir: () => invoke<string>("home_dir"),
  initialRepo: () => invoke<string | null>("initial_repo"),

  // デバッグ用ログ
  appLogs: () => invoke<CmdLog[]>("app_logs"),
  /** Rust 側が返すメッセージの言語を合わせる */
  setLocale: (locale: string) => invoke<void>("set_locale", { locale }),
  clearAppLogs: () => invoke<void>("app_logs_clear"),

  // add / commit
  stage: (dir: string, paths: string[]) => invoke<string>("git_stage", { dir, paths }),
  stageAll: (dir: string) => invoke<string>("git_stage_all", { dir }),
  unstage: (dir: string, paths: string[]) => invoke<string>("git_unstage", { dir, paths }),
  unstageAll: (dir: string) => invoke<string>("git_unstage_all", { dir }),
  discard: (dir: string, paths: string[]) => invoke<string>("git_discard", { dir, paths }),
  commit: (dir: string, message: string, amend = false) =>
    invoke<string>("git_commit", { dir, message, amend }),

  // 同期
  fetch: (dir: string, prune = true) => invoke<string>("git_fetch", { dir, prune }),
  pull: (dir: string, rebase: boolean, autostash: boolean) =>
    invoke<string>("git_pull", { dir, rebase, autostash }),
  /** checkout せずにローカルブランチを upstream へ早送りする */
  fastForward: (dir: string, branch: string) => invoke<string>("git_fast_forward", { dir, branch }),
  push: (
    dir: string,
    opts: {
      remote?: string;
      branch?: string;
      setUpstream?: boolean;
      forceWithLease?: boolean;
    } = {},
  ) =>
    invoke<string>("git_push", {
      dir,
      remote: opts.remote ?? "origin",
      branch: opts.branch,
      setUpstream: opts.setUpstream ?? false,
      forceWithLease: opts.forceWithLease ?? false,
    }),

  // branch / checkout
  checkout: (dir: string, target: string) => invoke<string>("git_checkout", { dir, target }),
  checkoutRemote: (dir: string, remoteBranch: string) =>
    invoke<string>("git_checkout_remote", { dir, remoteBranch }),
  createBranch: (dir: string, name: string, startPoint?: string, checkout = true) =>
    invoke<string>("git_create_branch", { dir, name, startPoint, checkout }),
  deleteBranch: (dir: string, name: string, force = false) =>
    invoke<string>("git_delete_branch", { dir, name, force }),
  deleteRemoteBranch: (dir: string, remoteBranch: string) =>
    invoke<string>("git_delete_remote_branch", { dir, remoteBranch }),
  deleteTag: (dir: string, name: string) => invoke<string>("git_delete_tag", { dir, name }),
  deleteRemoteTag: (dir: string, remote: string, name: string) =>
    invoke<string>("git_delete_remote_tag", { dir, remote, name }),

  // stash
  stashPush: (dir: string, message: string, includeUntracked: boolean, keepIndex = false) =>
    invoke<string>("git_stash_push", { dir, message, includeUntracked, keepIndex }),
  stashApply: (dir: string, refname: string, pop: boolean) =>
    invoke<string>("git_stash_apply", { dir, refname, pop }),
  stashDrop: (dir: string, refname: string) => invoke<string>("git_stash_drop", { dir, refname }),
  stashRename: (dir: string, refname: string, message: string) =>
    invoke<string>("git_stash_rename", { dir, refname, message }),
  stashContext: (dir: string, refname: string) =>
    invoke<StashContext>("stash_context", { dir, refname }),

  // worktree
  worktreeAdd: (dir: string, path: string, branch: string, createBranch: boolean, base?: string) =>
    invoke<string>("git_worktree_add", { dir, path, branch, createBranch, base }),
  worktreeRemove: (dir: string, path: string, force = false) =>
    invoke<string>("git_worktree_remove", { dir, path, force }),
  worktreePrune: (dir: string) => invoke<string>("git_worktree_prune", { dir }),

  // tidy (マージ済みブランチ / worktree の整理)
  /** 判定だけ行う。fetch=true なら先に origin を fetch --prune する */
  tidyPlan: (dir: string, fetch = true) => invoke<TidyPlan>("git_tidy_plan", { dir, fetch }),
  tidyApply: (dir: string, ops: Pick<TidyItem, "kind" | "target" | "sha">[]) =>
    invoke<TidyResult[]>("git_tidy_apply", { dir, ops }),

  // recompose (ブランチのコミットを組み直す)
  /** 分岐点から最終状態 (HEAD なら作業中の変更込み) までの変更を集める */
  recomposeContext: (dir: string, branch: string) =>
    invoke<RecomposeContext>("recompose_context", { dir, branch }),
  recomposeApply: (dir: string, op: RecomposeOp) => invoke<string>("recompose_apply", { dir, op }),

  // GitHub (gh CLI)
  ghStatus: (dir: string) => invoke<GhStatus>("gh_status", { dir }),
  ghOwners: (dir: string) => invoke<string[]>("gh_owners", { dir }),
  ghRepoCreate: (
    dir: string,
    p: {
      name: string;
      visibility: string;
      description: string;
      remote: string;
      push: boolean;
    },
  ) => invoke<string>("gh_repo_create", { dir, ...p }),
  prList: (dir: string, state = "open", limit = 30) =>
    invoke<PullRequest[]>("gh_pr_list", { dir, state, limit }),
  prForBranch: (dir: string, branch: string) =>
    invoke<PullRequest[]>("gh_pr_for_branch", { dir, branch }),
  prView: (dir: string, number: number) => invoke<PullRequest>("gh_pr_view", { dir, number }),
  prCreate: (
    dir: string,
    p: { title: string; body: string; base: string; head: string; draft: boolean; web: boolean },
  ) => invoke<string>("gh_pr_create", { dir, ...p }),
  prCheckout: (dir: string, number: number) => invoke<string>("gh_pr_checkout", { dir, number }),
  prMerge: (dir: string, number: number, method: string, deleteBranch: boolean) =>
    invoke<string>("gh_pr_merge", { dir, number, method, deleteBranch }),
  prTemplate: (dir: string) => invoke<string | null>("gh_pr_template", { dir }),
  /** 作者のメール → アバター URL (Rust 側でディスクキャッシュ済み。null は解決不能) */
  ghAvatars: (dir: string, queries: { email: string; sha: string }[]) =>
    invoke<Record<string, string | null>>("gh_avatars", { dir, queries }),
  ghAvatarsClear: () => invoke<void>("gh_avatars_clear"),

  /** Claude Code (`claude -p`) に一回だけ答えさせる */
  claudeGenerate: (system: string, prompt: string, model: string, effort?: string) =>
    invoke<string>("claude_generate", { system, prompt, model, effort }),
};
