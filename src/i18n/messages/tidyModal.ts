export const ja = {
  title: "ブランチとワークツリーを整理",
  footerHint: "消すのは選んだものだけです。判定後に動いたブランチ / ワークツリーは消しません。",
  cancel: "キャンセル",
  apply: (n: number) => `${n} 件を整理`,
  basis: (upstream: string) =>
    `${upstream} への取り込みと、マージ済み PR の head (SHA まで一致するもの) を基準に判定しました。`,
  groupFastForward: (main: string) => `${main} を早送り`,
  groupWorktrees: "削除するワークツリー",
  groupBranches: "削除するブランチ",
  nothing: "整理するものはありません",
  blocked: (path: string) => `${path} を残すため削除できません`,
  afterWorktree: (reason: string, path: string) =>
    `${reason} / ワークツリー ${path} の削除後に消します`,
  kept: (n: number) => `残すもの (${n})`,
  worktreePrefix: "ワークツリー ",
};

export const en: typeof ja = {
  title: "Tidy Branches and Worktrees",
  footerHint:
    "Only the selected items are removed. Branches or worktrees that moved after the check are kept.",
  cancel: "Cancel",
  apply: (n) => `Tidy ${n} ${n === 1 ? "Item" : "Items"}`,
  basis: (upstream) =>
    `Checked against what has been merged into ${upstream} and the heads of merged PRs (matching down to the SHA).`,
  groupFastForward: (main) => `Fast-forward ${main}`,
  groupWorktrees: "Worktrees to remove",
  groupBranches: "Branches to delete",
  nothing: "Nothing to tidy",
  blocked: (path) => `Can't delete because ${path} is being kept`,
  afterWorktree: (reason, path) => `${reason} / deleted after removing worktree ${path}`,
  kept: (n) => `Kept (${n})`,
  worktreePrefix: "worktree ",
};
