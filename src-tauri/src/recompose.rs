//! ブランチの変更を、まとまりのある単位のコミットに組み直す (recompose / compose)。
//!
//! `context` で「分岐点 (base) から最終状態 (tree) までの変更」を集め、AI が立てた
//! プランを `apply` で実行する。コミットは一時 index と commit-tree で作るので、
//! 作業ツリーにも元のブランチにも触れない。最後のコミットの tree は最終状態と
//! 一致させるので、組み直しても中身は 1 バイトも変わらない。
//!
//! 既定ブランチ (main など) で実行したときは compose と呼び、未プッシュのコミットと
//! 作業中の変更を新しいブランチに切り出す。

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::commands::truncate_diff;
use crate::i18n::Msg;
use crate::repo;
use crate::sh;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    /// git diff --name-status の 1 文字目 (A / M / D / R / C / T)
    pub status: String,
    pub path: String,
    /// リネーム・コピー元
    pub orig_path: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecomposeContext {
    pub branch: String,
    /// いまこのディレクトリでチェックアウトしているブランチか
    pub is_head: bool,
    /// 既定ブランチ上での実行 (新しいブランチ名も AI に考えさせる)
    pub compose: bool,
    pub default_branch: String,
    /// 分岐点を求めた相手 (表示用。origin/main など)
    pub base_ref: String,
    pub base: String,
    /// プランを立てたときのブランチの SHA
    pub tip: String,
    /// 組み直した結果が一致すべき tree (作業中の変更を含む)
    pub tree: String,
    /// 未コミットの変更を含んでいるか
    pub includes_worktree: bool,
    pub files: Vec<ChangedFile>,
    pub diff: String,
    pub truncated: bool,
    /// ブランチにある既存のコミットのメッセージ (古い順)
    pub commits: Vec<String>,
    /// 既定ブランチの直近のコミットの件名 (書き方を合わせるため)
    pub recent_subjects: Vec<String>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlannedCommit {
    pub message: String,
    /// ChangedFile::path。リネームは元のパスも自動で同じコミットに入る
    pub paths: Vec<String>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecomposeOp {
    pub branch: String,
    pub base: String,
    pub tip: String,
    pub tree: String,
    pub new_branch: String,
    pub commits: Vec<PlannedCommit>,
    /// recompose 後に元のローカルブランチを消す
    #[serde(default)]
    pub delete_original: bool,
    /// compose 後に既定ブランチを分岐点へ戻す (切り出したコミットを取り除く)
    #[serde(default)]
    pub reset_default: bool,
}

fn text(dir: &str, args: &[&str]) -> String {
    sh::git(dir, args).unwrap_or_default().trim().to_string()
}

fn rev(dir: &str, r: &str) -> Option<String> {
    let s = text(
        dir,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{r}^{{commit}}"),
        ],
    );
    (!s.is_empty()).then_some(s)
}

fn tree_of(dir: &str, commit: &str) -> String {
    text(dir, &["rev-parse", &format!("{commit}^{{tree}}")])
}

/// 実行ごとに作って捨てる index。本物の index (ステージ状態) には触れない。
struct TempIndex {
    dir: String,
    path: PathBuf,
}

impl TempIndex {
    /// `seed` があればその index をコピーして始める (stat 情報を使い回して add を速くする)
    fn new(dir: &str, seed: Option<&Path>) -> Result<Self, String> {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default();
        let path = std::env::temp_dir().join(format!(
            "git-squid-recompose-{}-{nanos}.index",
            std::process::id()
        ));
        if let Some(src) = seed.filter(|p| p.exists()) {
            std::fs::copy(src, &path)
                .map_err(|e| Msg::TempIndexFailed { err: e.to_string() }.text())?;
        }
        Ok(Self {
            dir: dir.to_string(),
            path,
        })
    }

    fn git(&self, args: &[&str], stdin: Option<&str>) -> Result<String, String> {
        let index = self.path.to_string_lossy().to_string();
        let out = sh::exec_env(&self.dir, "git", args, stdin, &[("GIT_INDEX_FILE", &index)])?;
        if out.ok() {
            Ok(out.stdout.trim().to_string())
        } else {
            Err(out.message())
        }
    }
}

impl Drop for TempIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

/// 作業ツリーの今の状態 (未追跡ファイルも含む。.gitignore は尊重) を tree にする
fn worktree_tree(dir: &str) -> Result<String, String> {
    let real = text(
        dir,
        &["rev-parse", "--path-format=absolute", "--git-path", "index"],
    );
    let idx = TempIndex::new(dir, (!real.is_empty()).then(|| Path::new(&real)))?;
    idx.git(&["add", "-A", "--", ":/"], None)?;
    idx.git(&["write-tree"], None)
}

/// base から tree までに変わったファイル
fn changed_files(dir: &str, base: &str, tree: &str) -> Result<Vec<ChangedFile>, String> {
    let raw = sh::git(dir, &["diff", "--name-status", "-z", "-M", base, tree])?;
    let mut parts = raw.split('\0').filter(|s| !s.is_empty());
    let mut out = vec![];
    while let Some(st) = parts.next() {
        let status = st.chars().next().unwrap_or('M').to_string();
        let Some(first) = parts.next() else { break };
        if status == "R" || status == "C" {
            let Some(second) = parts.next() else { break };
            out.push(ChangedFile {
                status,
                path: second.to_string(),
                orig_path: Some(first.to_string()),
            });
        } else {
            out.push(ChangedFile {
                status,
                path: first.to_string(),
                orig_path: None,
            });
        }
    }
    Ok(out)
}

pub fn context(dir: &str, branch: &str) -> Result<RecomposeContext, String> {
    let info = repo::info(dir)?;
    if info.state != "clean" {
        return Err(Msg::MidOperation { state: info.state }.into());
    }
    let tip = rev(dir, &format!("refs/heads/{branch}")).ok_or_else(|| {
        Msg::BranchNotFound {
            branch: branch.to_string(),
        }
        .text()
    })?;
    let default_branch = info.default_branch.clone();
    let is_head = info.head_branch.as_deref() == Some(branch);
    let compose = branch == default_branch;

    // 分岐点を求める相手: origin の既定ブランチ → ローカルの既定ブランチ
    let upstream = format!("origin/{default_branch}");
    let base_ref = if rev(dir, &upstream).is_some() {
        upstream
    } else if compose || rev(dir, &format!("refs/heads/{default_branch}")).is_some() {
        default_branch.clone()
    } else {
        return Err(Msg::DefaultBranchMissing {
            branch: default_branch,
        }
        .into());
    };
    let base = text(dir, &["merge-base", &base_ref, &tip]);
    if base.is_empty() {
        return Err(Msg::NoCommonAncestor {
            branch: branch.to_string(),
            base: base_ref,
        }
        .into());
    }

    let tip_tree = tree_of(dir, &tip);
    let tree = if is_head {
        worktree_tree(dir)?
    } else {
        tip_tree.clone()
    };
    let includes_worktree = tree != tip_tree;

    let files = changed_files(dir, &base, &tree)?;
    let mut diff = sh::git(
        dir,
        &["diff", "--no-color", "--no-ext-diff", "-M", &base, &tree],
    )?;
    let truncated = truncate_diff(&mut diff);

    let commits = sh::git(
        dir,
        &[
            "log",
            "--reverse",
            "--no-merges",
            "--format=%B%x00",
            &format!("{base}..{tip}"),
        ],
    )
    .unwrap_or_default()
    .split('\0')
    .map(|m| m.trim().to_string())
    .filter(|m| !m.is_empty())
    .collect();
    let recent_subjects = sh::git(dir, &["log", "-15", "--no-merges", "--format=%s", &base])
        .unwrap_or_default()
        .lines()
        .map(|s| s.to_string())
        .collect();

    Ok(RecomposeContext {
        branch: branch.to_string(),
        is_head,
        compose,
        default_branch,
        base_ref,
        base,
        tip,
        tree,
        includes_worktree,
        files,
        diff,
        truncated,
        commits,
        recent_subjects,
    })
}

/// プランがすべての変更をちょうど 1 回ずつ含んでいるかを確かめ、
/// コミットごとに index へ反映するパス (リネーム元を含む) に展開する
fn expand_paths(
    files: &[ChangedFile],
    commits: &[PlannedCommit],
) -> Result<Vec<Vec<String>>, String> {
    let by_path: HashMap<&str, &ChangedFile> = files.iter().map(|f| (f.path.as_str(), f)).collect();
    let mut used: HashSet<&str> = HashSet::new();
    let mut out = vec![];
    for (i, c) in commits.iter().enumerate() {
        if c.message.trim().is_empty() {
            return Err(Msg::CommitMissingMessage { n: i + 1 }.into());
        }
        if c.paths.is_empty() {
            return Err(Msg::CommitMissingFiles { n: i + 1 }.into());
        }
        let mut paths = vec![];
        for p in &c.paths {
            let f = by_path
                .get(p.as_str())
                .ok_or_else(|| Msg::UnchangedFileInPlan { path: p.clone() }.text())?;
            if !used.insert(f.path.as_str()) {
                return Err(Msg::FileInMultipleCommits { path: p.clone() }.into());
            }
            paths.push(f.path.clone());
            if let Some(orig) = &f.orig_path {
                paths.push(orig.clone());
            }
        }
        out.push(paths);
    }
    let missing: Vec<&str> = files
        .iter()
        .map(|f| f.path.as_str())
        .filter(|p| !used.contains(p))
        .collect();
    if !missing.is_empty() {
        return Err(Msg::ChangesNotInPlan {
            paths: missing.join(", "),
        }
        .into());
    }
    Ok(out)
}

/// プランどおりにコミットを作り、最後のコミットの SHA を返す
fn build_commits(dir: &str, op: &RecomposeOp, groups: &[Vec<String>]) -> Result<String, String> {
    // 最終状態の各ファイルの ls-tree 行 (update-index --index-info にそのまま渡せる)
    let listing = sh::git(dir, &["ls-tree", "-r", "-z", &op.tree])?;
    let entries: HashMap<&str, &str> = listing
        .split('\0')
        .filter_map(|line| line.split_once('\t').map(|(_, path)| (path, line)))
        .collect();

    let idx = TempIndex::new(dir, None)?;
    idx.git(&["read-tree", &op.base], None)?;
    let mut parent = op.base.clone();
    for (c, paths) in op.commits.iter().zip(groups) {
        let mut info = String::new();
        for p in paths {
            match entries.get(p.as_str()) {
                Some(line) => info.push_str(line),
                // mode 0 はその path を index から消す
                None => info.push_str(&format!("0 {}\t{p}", "0".repeat(40))),
            }
            info.push('\0');
        }
        idx.git(&["update-index", "-z", "--index-info"], Some(&info))?;
        let tree = idx.git(&["write-tree"], None)?;
        parent = idx.git(
            &["commit-tree", &tree, "-p", &parent, "-F", "-"],
            Some(c.message.trim()),
        )?;
    }
    if tree_of(dir, &parent) != op.tree {
        return Err(Msg::RecomposeMismatch.into());
    }
    Ok(parent)
}

pub fn apply(dir: &str, op: RecomposeOp) -> Result<String, String> {
    let info = repo::info(dir)?;
    if info.state != "clean" {
        return Err(Msg::MidOperation { state: info.state }.into());
    }
    let new_branch = op.new_branch.trim().to_string();
    if !sh::exec(dir, "git", &["check-ref-format", "--branch", &new_branch])?.ok() {
        return Err(Msg::InvalidBranchName { name: new_branch }.into());
    }
    if rev(dir, &format!("refs/heads/{new_branch}")).is_some() {
        return Err(Msg::BranchExists { name: new_branch }.into());
    }

    // プランを立てた後に動いていないか
    if rev(dir, &format!("refs/heads/{}", op.branch)).as_deref() != Some(op.tip.as_str()) {
        return Err(Msg::BranchMovedSincePlan { branch: op.branch }.into());
    }
    let is_head = info.head_branch.as_deref() == Some(op.branch.as_str());
    let now_tree = if is_head {
        worktree_tree(dir)?
    } else {
        tree_of(dir, &op.tip)
    };
    if now_tree != op.tree {
        return Err(Msg::FilesChangedSincePlan.into());
    }
    let compose = op.branch == info.default_branch;
    if op.reset_default && !(compose && is_head) {
        return Err(Msg::ResetDefaultRequiresHead.into());
    }
    if op.delete_original && compose {
        return Err(Msg::CannotDeleteDefault.into());
    }

    let files = changed_files(dir, &op.base, &op.tree)?;
    if files.is_empty() {
        return Err(Msg::NothingToRecompose.into());
    }
    let groups = expand_paths(&files, &op.commits)?;
    let last = build_commits(dir, &op, &groups)?;

    let mut log = vec![Msg::CommitsCreated {
        branch: new_branch.clone(),
        n: op.commits.len(),
    }
    .text()];
    sh::git_log(dir, &["branch", "--no-track", &new_branch, &last])?;

    if is_head {
        // 新しいブランチの tree は作業ツリーと同じなので、HEAD を付け替えて index だけ合わせる
        // (作業ツリーには触れない。直前に増えた変更があっても未ステージとして残る)
        sh::git_log(
            dir,
            &[
                "symbolic-ref",
                "-m",
                &format!("recompose: moving from {} to {new_branch}", op.branch),
                "HEAD",
                &format!("refs/heads/{new_branch}"),
            ],
        )?;
        sh::git_log(dir, &["reset", "-q"])?;
        log.push(
            Msg::SwitchedTo {
                branch: new_branch.clone(),
            }
            .text(),
        );
    }

    if op.delete_original {
        match sh::git_log(dir, &["branch", "-D", &op.branch]) {
            Ok(_) => log.push(
                Msg::BranchDeleted {
                    branch: op.branch.clone(),
                }
                .text(),
            ),
            Err(e) => {
                let msg = Msg::BranchDeleteFailed {
                    branch: op.branch.clone(),
                    err: e,
                };
                return Err(format!("{}\n{}", log.join("\n"), msg.text()));
            }
        }
    }

    if op.reset_default && op.tip != op.base {
        // 期待した SHA のときだけ書き換える (compare-and-swap)
        let reflog = format!("compose: moved commits to {new_branch}");
        match sh::git_log(
            dir,
            &[
                "update-ref",
                "-m",
                &reflog,
                &format!("refs/heads/{}", op.branch),
                &op.base,
                &op.tip,
            ],
        ) {
            Ok(_) => log.push(
                Msg::BranchResetToBase {
                    branch: op.branch.clone(),
                }
                .text(),
            ),
            Err(e) => {
                let msg = Msg::BranchResetFailed {
                    branch: op.branch.clone(),
                    err: e,
                };
                return Err(format!("{}\n{}", log.join("\n"), msg.text()));
            }
        }
    }

    Ok(log.join("\n"))
}
