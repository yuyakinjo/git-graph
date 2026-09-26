//! ユーザーに見せるメッセージ (エラー、成功ログ、tidy の判定理由など) の日本語 / 英語。
//!
//! 表示言語はフロントの設定から `set_locale` コマンドで渡され、グローバルに持つ。
//! 文言は `Msg` のバリアントごとに `ja()` / `en()` で書く。どちらも網羅的な match なので、
//! バリアントを足して片方の言語を書き忘れるとコンパイルエラーになる。
//! git / gh の stderr や reflog のメッセージは翻訳しない。

use std::sync::atomic::{AtomicU8, Ordering};

const JA: u8 = 0;
const EN: u8 = 1;

static LOCALE: AtomicU8 = AtomicU8::new(JA);

/// 表示言語を切り替える。"en" なら英語、それ以外は日本語。
pub fn set_locale(locale: &str) {
    let v = if locale == "en" { EN } else { JA };
    LOCALE.store(v, Ordering::Relaxed);
}

fn is_en() -> bool {
    LOCALE.load(Ordering::Relaxed) == EN
}

fn plural(n: usize, one: &str, many: &str) -> String {
    if n == 1 {
        format!("{n} {one}")
    } else {
        format!("{n} {many}")
    }
}

pub enum Msg {
    // ---- 外部コマンドの実行 (sh.rs)
    DirNotFound { dir: String },
    ProgramNotFound { program: String },
    ProgramFailed { program: String, err: String },
    CommandExited { code: i32 },

    // ---- gh / GitHub (avatar.rs, github.rs, tidy.rs)
    GhParseFailed { err: String },
    NotGithubRepo,
    InvalidRepoName,
    CacheLockFailed,
    CacheDeleteFailed { err: String },
    CacheDirUnknown { err: String },

    // ---- repo.rs
    NotAGitRepo,
    CommitParseFailed { sha: String },
    CommitShaRequired,
    StashRefRequired,
    UnknownDiffKind { kind: String },

    // ---- commands.rs
    CommitMessageRequired,
    NoUpstream { branch: String },
    InvalidRemoteBranch,
    NameRequired,
    InvalidStashRef { refname: String },
    StashNotFound { refname: String },
    StashRenamed { refname: String, message: String },
    BaseBranchNotFound { base: String },

    // ---- recompose.rs
    TempIndexFailed { err: String },
    MidOperation { state: String },
    BranchNotFound { branch: String },
    DefaultBranchMissing { branch: String },
    NoCommonAncestor { branch: String, base: String },
    CommitMissingMessage { n: usize },
    CommitMissingFiles { n: usize },
    UnchangedFileInPlan { path: String },
    FileInMultipleCommits { path: String },
    ChangesNotInPlan { paths: String },
    RecomposeMismatch,
    InvalidBranchName { name: String },
    BranchExists { name: String },
    BranchMovedSincePlan { branch: String },
    FilesChangedSincePlan,
    ResetDefaultRequiresHead,
    CannotDeleteDefault,
    NothingToRecompose,
    CommitsCreated { branch: String, n: usize },
    SwitchedTo { branch: String },
    BranchDeleted { branch: String },
    BranchDeleteFailed { branch: String, err: String },
    BranchResetToBase { branch: String },
    BranchResetFailed { branch: String, err: String },

    // ---- tidy.rs (判定理由とエラー)
    MergedPrsUnavailable { upstream: String, err: String },
    CannotJudge { upstream: String },
    BehindUpstream { upstream: String, n: usize },
    DirMissing,
    CurrentWorktree,
    Locked,
    UncommittedChanges,
    HeadMergedInto { upstream: String },
    PrMerged { n: u64 },
    UnmergedCommits,
    MergedInto { upstream: String },
    PrMergedWithLaterCommits { n: u64 },
    NoMergedPrNotInMain,
    CheckedOutAt { path: String },
    BranchMovedSinceCheck,
    HeadMovedSinceCheck,
    KeptCheckedOut { path: String },
}

impl Msg {
    /// 現在の表示言語での文言
    pub fn text(&self) -> String {
        if is_en() {
            self.en()
        } else {
            self.ja()
        }
    }

    fn ja(&self) -> String {
        use Msg::*;
        match self {
            DirNotFound { dir } => format!("ディレクトリが存在しません: {dir}"),
            ProgramNotFound { program } => {
                format!("`{program}` が見つかりません。インストールと PATH を確認してください。")
            }
            ProgramFailed { program, err } => format!("`{program}` の実行に失敗しました: {err}"),
            CommandExited { code } => format!("コマンドが終了コード {code} で終了しました"),

            GhParseFailed { err } => format!("gh の出力を解析できません: {err}"),
            NotGithubRepo => "GitHub リポジトリではありません".into(),
            InvalidRepoName => "リポジトリ名が不正です".into(),
            CacheLockFailed => "キャッシュを読めません".into(),
            CacheDeleteFailed { err } => format!("キャッシュを削除できません: {err}"),
            CacheDirUnknown { err } => format!("キャッシュディレクトリを特定できません: {err}"),

            NotAGitRepo => "git リポジトリが見つかりません".into(),
            CommitParseFailed { sha } => format!("コミット情報を解析できません: {sha}"),
            CommitShaRequired => "コミットハッシュが必要です".into(),
            StashRefRequired => "stash の参照が必要です".into(),
            UnknownDiffKind { kind } => format!("未知の diff 種別: {kind}"),

            CommitMessageRequired => "コミットメッセージを入力してください".into(),
            NoUpstream { branch } => format!("{branch} に upstream が設定されていません"),
            InvalidRemoteBranch => "リモートブランチ名が不正です".into(),
            NameRequired => "名前を入力してください".into(),
            InvalidStashRef { refname } => format!("stash の参照が不正です: {refname}"),
            StashNotFound { refname } => format!("{refname} が見つかりません"),
            StashRenamed { refname, message } => {
                format!("{refname} の名前を「{message}」に変更しました")
            }
            BaseBranchNotFound { base } => format!("マージ先のブランチ {base} が見つかりません"),

            TempIndexFailed { err } => format!("一時 index を作れません: {err}"),
            MidOperation { state } => format!("{state} の途中のため実行できません"),
            BranchNotFound { branch } => format!("ブランチ {branch} が見つかりません"),
            DefaultBranchMissing { branch } => {
                format!("既定ブランチ {branch} が見つからないため、分岐点を決められません")
            }
            NoCommonAncestor { branch, base } => {
                format!("{branch} と {base} に共通の祖先がありません")
            }
            CommitMissingMessage { n } => format!("{n} 番目のコミットにメッセージがありません"),
            CommitMissingFiles { n } => format!("{n} 番目のコミットにファイルがありません"),
            UnchangedFileInPlan { path } => {
                format!("変更のないファイルがプランに含まれています: {path}")
            }
            FileInMultipleCommits { path } => format!("{path} が複数のコミットに含まれています"),
            ChangesNotInPlan { paths } => format!("プランに含まれていない変更があります: {paths}"),
            RecomposeMismatch => "組み直した結果が元の内容と一致しないため中止しました".into(),
            InvalidBranchName { name } => format!("ブランチ名として使えません: {name}"),
            BranchExists { name } => format!("ブランチ {name} は既に存在します"),
            BranchMovedSincePlan { branch } => {
                format!("プラン作成後に {branch} が動いたため中止しました")
            }
            FilesChangedSincePlan => "プラン作成後にファイルが変更されたため中止しました".into(),
            ResetDefaultRequiresHead => {
                "既定ブランチを戻せるのは、既定ブランチをチェックアウトしているときだけです".into()
            }
            CannotDeleteDefault => "既定ブランチは削除できません".into(),
            NothingToRecompose => "組み直す変更がありません".into(),
            CommitsCreated { branch, n } => format!("{branch} に {n} 件のコミットを作成しました"),
            SwitchedTo { branch } => format!("{branch} に切り替えました"),
            BranchDeleted { branch } => format!("{branch} を削除しました"),
            BranchDeleteFailed { branch, err } => format!("{branch} を削除できませんでした: {err}"),
            BranchResetToBase { branch } => format!("{branch} を分岐点に戻しました"),
            BranchResetFailed { branch, err } => format!("{branch} を戻せませんでした: {err}"),

            MergedPrsUnavailable { upstream, err } => format!(
                "マージ済み PR を取得できないため、{upstream} への取り込みだけで判定しています ({err})"
            ),
            CannotJudge { upstream } => {
                format!("{upstream} が見つからず、gh も使えないため判定できません")
            }
            BehindUpstream { upstream, n } => format!("{upstream} より {n} コミット遅れている"),
            DirMissing => "ディレクトリが存在しない".into(),
            CurrentWorktree => "今開いている worktree".into(),
            Locked => "ロックされている".into(),
            UncommittedChanges => "未コミットの変更がある".into(),
            HeadMergedInto { upstream } => format!("HEAD が {upstream} に取り込み済み"),
            PrMerged { n } => format!("PR #{n} がマージ済み"),
            UnmergedCommits => "未マージのコミットがある".into(),
            MergedInto { upstream } => format!("{upstream} に取り込み済み"),
            PrMergedWithLaterCommits { n } => {
                format!("PR #{n} はマージ済みだが、その後のコミットがある")
            }
            NoMergedPrNotInMain => "マージされた PR がなく、main にも未取り込み".into(),
            CheckedOutAt { path } => format!("{path} でチェックアウト中"),
            BranchMovedSinceCheck => "判定後にブランチが動いたため中止しました".into(),
            HeadMovedSinceCheck => "判定後に HEAD が動いたため中止しました".into(),
            KeptCheckedOut { path } => format!("{path} でチェックアウト中のため残しました"),
        }
    }

    fn en(&self) -> String {
        use Msg::*;
        match self {
            DirNotFound { dir } => format!("Directory does not exist: {dir}"),
            ProgramNotFound { program } => {
                format!("`{program}` not found. Check that it is installed and on your PATH.")
            }
            ProgramFailed { program, err } => format!("Failed to run `{program}`: {err}"),
            CommandExited { code } => format!("Command exited with status {code}"),

            GhParseFailed { err } => format!("Couldn't parse gh output: {err}"),
            NotGithubRepo => "Not a GitHub repository".into(),
            InvalidRepoName => "Invalid repository name".into(),
            CacheLockFailed => "Couldn't read the cache".into(),
            CacheDeleteFailed { err } => format!("Couldn't delete the cache: {err}"),
            CacheDirUnknown { err } => format!("Couldn't locate the cache directory: {err}"),

            NotAGitRepo => "No git repository found".into(),
            CommitParseFailed { sha } => format!("Couldn't parse commit info: {sha}"),
            CommitShaRequired => "A commit hash is required".into(),
            StashRefRequired => "A stash reference is required".into(),
            UnknownDiffKind { kind } => format!("Unknown diff kind: {kind}"),

            CommitMessageRequired => "Enter a commit message".into(),
            NoUpstream { branch } => format!("{branch} has no upstream"),
            InvalidRemoteBranch => "Invalid remote branch name".into(),
            NameRequired => "Enter a name".into(),
            InvalidStashRef { refname } => format!("Invalid stash reference: {refname}"),
            StashNotFound { refname } => format!("{refname} not found"),
            StashRenamed { refname, message } => format!("Renamed {refname} to \"{message}\""),
            BaseBranchNotFound { base } => format!("Base branch {base} not found"),

            TempIndexFailed { err } => format!("Couldn't create a temporary index: {err}"),
            MidOperation { state } => format!("Can't run while a {state} is in progress"),
            BranchNotFound { branch } => format!("Branch {branch} not found"),
            DefaultBranchMissing { branch } => {
                format!("Default branch {branch} not found, so the fork point can't be determined")
            }
            NoCommonAncestor { branch, base } => {
                format!("{branch} and {base} have no common ancestor")
            }
            CommitMissingMessage { n } => format!("Commit {n} has no message"),
            CommitMissingFiles { n } => format!("Commit {n} has no files"),
            UnchangedFileInPlan { path } => format!("The plan includes an unchanged file: {path}"),
            FileInMultipleCommits { path } => format!("{path} is in more than one commit"),
            ChangesNotInPlan { paths } => format!("Some changes are not in the plan: {paths}"),
            RecomposeMismatch => {
                "Aborted: the recomposed result doesn't match the original content".into()
            }
            InvalidBranchName { name } => format!("Not a valid branch name: {name}"),
            BranchExists { name } => format!("Branch {name} already exists"),
            BranchMovedSincePlan { branch } => {
                format!("Aborted: {branch} moved after the plan was made")
            }
            FilesChangedSincePlan => "Aborted: files changed after the plan was made".into(),
            ResetDefaultRequiresHead => {
                "The default branch can only be reset while it is checked out".into()
            }
            CannotDeleteDefault => "The default branch can't be deleted".into(),
            NothingToRecompose => "No changes to recompose".into(),
            CommitsCreated { branch, n } => {
                format!("Created {} on {branch}", plural(*n, "commit", "commits"))
            }
            SwitchedTo { branch } => format!("Switched to {branch}"),
            BranchDeleted { branch } => format!("Deleted {branch}"),
            BranchDeleteFailed { branch, err } => format!("Couldn't delete {branch}: {err}"),
            BranchResetToBase { branch } => format!("Reset {branch} to the fork point"),
            BranchResetFailed { branch, err } => format!("Couldn't reset {branch}: {err}"),

            MergedPrsUnavailable { upstream, err } => format!(
                "Couldn't fetch merged PRs, so only merges into {upstream} are checked ({err})"
            ),
            CannotJudge { upstream } => {
                format!("Can't check: {upstream} not found and gh is unavailable")
            }
            BehindUpstream { upstream, n } => {
                format!("{} behind {upstream}", plural(*n, "commit", "commits"))
            }
            DirMissing => "Directory no longer exists".into(),
            CurrentWorktree => "Currently open worktree".into(),
            Locked => "Locked".into(),
            UncommittedChanges => "Has uncommitted changes".into(),
            HeadMergedInto { upstream } => format!("HEAD is merged into {upstream}"),
            PrMerged { n } => format!("PR #{n} is merged"),
            UnmergedCommits => "Has unmerged commits".into(),
            MergedInto { upstream } => format!("Merged into {upstream}"),
            PrMergedWithLaterCommits { n } => {
                format!("PR #{n} is merged, but has later commits")
            }
            NoMergedPrNotInMain => "No merged PR, and not merged into main".into(),
            CheckedOutAt { path } => format!("Checked out at {path}"),
            BranchMovedSinceCheck => "Aborted: the branch moved after the check".into(),
            HeadMovedSinceCheck => "Aborted: HEAD moved after the check".into(),
            KeptCheckedOut { path } => format!("Kept because it is checked out at {path}"),
        }
    }
}

impl From<Msg> for String {
    fn from(m: Msg) -> String {
        m.text()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// 言語はグローバルなので、切り替えるテストは直列に走らせる
    static LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn switches_language() {
        let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let msg = || Msg::CommitsCreated {
            branch: "feat".into(),
            n: 2,
        };
        assert_eq!(msg().text(), "feat に 2 件のコミットを作成しました");

        set_locale("en");
        assert_eq!(msg().text(), "Created 2 commits on feat");
        let one: String = Msg::CommitsCreated {
            branch: "feat".into(),
            n: 1,
        }
        .into();
        assert_eq!(one, "Created 1 commit on feat");

        // 未知の値は日本語に戻す
        set_locale("fr");
        assert_eq!(Msg::NotAGitRepo.text(), "git リポジトリが見つかりません");

        set_locale("ja");
        assert_eq!(Msg::Locked.text(), "ロックされている");
    }
}
