import { createElement, Fragment, type ReactNode } from "react";

export const ja = {
  noChanges: (baseRef: string) => `${baseRef} との分岐点から変更がありません`,
  titleCompose: "作成: 変更を新しいブランチに切り出す",
  titleRecompose: "組み直し: ブランチを整理",
  footerHint: "中身は変えず、コミットだけを組み直します。コミットフックは実行されません。",
  cancel: "キャンセル",
  execute: "このプランで実行",
  descCompose: (defaultBranch: string) =>
    `${defaultBranch} 上の未プッシュのコミットと作業中の変更を、AI がまとまりのある単位のコミットに分け、新しいブランチに積みます。`,
  descRecompose:
    "ブランチの変更 (チェックアウト中なら未コミットの変更も) を AI がまとまりのある単位のコミットに組み直し、新しいブランチに積みます。",
  branch: "ブランチ",
  checkedOut: " (チェックアウト中)",
  restartTitle: "変更を集め直し、コメントを捨てて最初から立て直す",
  restart: "最初から作り直す",
  makePlan: "プランを作成",
  otherWorktree: (path: string) =>
    `${path} でチェックアウト中のため、そこの未コミットの変更は含まれません。`,
  /** base は等幅で見せたいので要素で受け取る (語順が言語で違うため文ごと組み立てる) */
  summary: (p: {
    baseRef: string;
    base: ReactNode;
    files: number;
    commits: number;
    worktree: boolean;
  }): ReactNode =>
    createElement(
      Fragment,
      null,
      `${p.baseRef} との分岐点 `,
      p.base,
      ` から ${p.files} ファイル / 既存のコミット ${p.commits} 件${p.worktree ? " + 未コミットの変更" : ""}`,
    ),
  truncated: " (差分が大きいため一部だけを AI に渡しています)",
  collecting: "変更を集めています…",
  planning: "Claude Code がコミットプランを作成しています…",
  planHeading: (n: number) => `コミットプラン (${n} 件)`,
  replanCount: (n: number) => ` ・ 再プラン ${n} 回目`,
  commentHeading: "修正したいところがあればコメント",
  commentPlaceholder: "例: テストは対応する機能のコミットにまとめて / メッセージは英語で",
  replan: "コメントして再プラン",
  executeHeading: "実行",
  newBranchName: "新しいブランチ名",
  newBranchNameAi: "新しいブランチ名 (AI の提案)",
  resetDefault: (branch: string, baseRef: string) => `${branch} を ${baseRef} との分岐点に戻す`,
  resetDefaultHint: (branch: string) =>
    `切り出した未プッシュのコミットを ${branch} から取り除きます`,
  deleteOriginal: (branch: string) => `組み直し後に元のローカルブランチ ${branch} を削除`,
  deleteBlocked: "別のワークツリーでチェックアウト中のため削除できません",
  remoteUntouched: "リモートのブランチには触れません",
  switchTo: (branch: string) => `実行後は ${branch} に切り替わります。`,
  newBranchFallback: "新しいブランチ",
};

export const en: typeof ja = {
  noChanges: (baseRef) => `No changes since the fork point with ${baseRef}`,
  titleCompose: "Compose: Move Changes to a New Branch",
  titleRecompose: "Recompose: Tidy Up the Branch",
  footerHint:
    "Only the commits are reorganized; the content stays the same. Commit hooks are not run.",
  cancel: "Cancel",
  execute: "Run This Plan",
  descCompose: (defaultBranch) =>
    `AI splits the unpushed commits and working changes on ${defaultBranch} into coherent commits and stacks them on a new branch.`,
  descRecompose:
    "AI reorganizes the branch's changes (including uncommitted changes if it is checked out) into coherent commits and stacks them on a new branch.",
  branch: "Branch",
  checkedOut: " (checked out)",
  restartTitle: "Collect the changes again, discard comments, and start over",
  restart: "Start Over",
  makePlan: "Create Plan",
  otherWorktree: (path) => `Checked out at ${path}, so uncommitted changes there are not included.`,
  summary: (p) =>
    createElement(
      Fragment,
      null,
      `${p.files} ${p.files === 1 ? "file" : "files"} / ${p.commits} existing ${p.commits === 1 ? "commit" : "commits"} since the fork point `,
      p.base,
      ` with ${p.baseRef}${p.worktree ? " + uncommitted changes" : ""}`,
    ),
  truncated: " (the diff is large, so only part of it is sent to AI)",
  collecting: "Collecting changes…",
  planning: "Claude Code is creating a commit plan…",
  planHeading: (n) => `Commit plan (${n} ${n === 1 ? "commit" : "commits"})`,
  replanCount: (n) => ` · Revision ${n}`,
  commentHeading: "Comment on anything you'd like changed",
  commentPlaceholder:
    "e.g. Put tests in the same commit as their feature / Write messages in Japanese",
  replan: "Comment and Replan",
  executeHeading: "Run",
  newBranchName: "New branch name",
  newBranchNameAi: "New branch name (suggested by AI)",
  resetDefault: (branch, baseRef) => `Reset ${branch} to the fork point with ${baseRef}`,
  resetDefaultHint: (branch) => `Removes the moved unpushed commits from ${branch}`,
  deleteOriginal: (branch) => `Delete the original local branch ${branch} after recomposing`,
  deleteBlocked: "Can't delete because it is checked out in another worktree",
  remoteUntouched: "Remote branches are not touched",
  switchTo: (branch) => `You'll be switched to ${branch} afterwards.`,
  newBranchFallback: "the new branch",
};
