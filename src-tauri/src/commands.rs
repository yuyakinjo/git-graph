use std::collections::HashMap;
use std::path::PathBuf;

use serde_json::Value;
use tauri::Manager;

use crate::avatar;
use crate::github;
use crate::graph;
use crate::repo;
use crate::sh;

// ------------------------------------------------------------------ 読み取り

#[tauri::command]
pub fn repo_open(path: String) -> Result<repo::RepoInfo, String> {
    repo::info(&path)
}

#[tauri::command]
pub fn graph_load(dir: String, limit: usize) -> Result<graph::GraphData, String> {
    graph::load(&dir, limit)
}

#[tauri::command]
pub fn status_load(dir: String) -> Result<repo::StatusData, String> {
    repo::status(&dir)
}

#[tauri::command]
pub fn branches_load(dir: String) -> Result<Vec<repo::BranchInfo>, String> {
    repo::branches(&dir)
}

#[tauri::command]
pub fn tags_load(dir: String) -> Result<Vec<repo::TagInfo>, String> {
    repo::tags(&dir)
}

#[tauri::command]
pub fn stash_load(dir: String) -> Result<Vec<repo::StashInfo>, String> {
    repo::stash_list(&dir)
}

#[tauri::command]
pub fn worktree_load(dir: String) -> Result<Vec<repo::WorktreeInfo>, String> {
    repo::worktree_list(&dir)
}

#[tauri::command]
pub fn commit_detail(dir: String, sha: String) -> Result<repo::CommitDetail, String> {
    repo::commit_detail(&dir, &sha)
}

#[tauri::command]
pub fn wip_files(dir: String, staged: bool) -> Result<Vec<repo::DiffFile>, String> {
    repo::wip_files(&dir, staged)
}

#[tauri::command]
pub fn stash_files(dir: String, refname: String) -> Result<Vec<repo::DiffFile>, String> {
    repo::stash_files(&dir, &refname)
}

#[tauri::command]
pub fn diff_text(
    dir: String,
    kind: String,
    path: String,
    sha: Option<String>,
    context: Option<u32>,
) -> Result<String, String> {
    repo::diff_text(&dir, &kind, &path, sha, context.unwrap_or(3))
}

// ------------------------------------------------------------------ add / commit

#[tauri::command]
pub fn git_stage(dir: String, paths: Vec<String>) -> Result<String, String> {
    if paths.is_empty() {
        return Ok(String::new());
    }
    let mut args: Vec<String> = vec!["add".into(), "-A".into(), "--".into()];
    args.extend(paths);
    sh::git_log(&dir, &args)
}

#[tauri::command]
pub fn git_stage_all(dir: String) -> Result<String, String> {
    sh::git_log(&dir, &["add", "-A"])
}

#[tauri::command]
pub fn git_unstage(dir: String, paths: Vec<String>) -> Result<String, String> {
    if paths.is_empty() {
        return Ok(String::new());
    }
    let mut args: Vec<String> = vec!["restore".into(), "--staged".into(), "--".into()];
    args.extend(paths);
    sh::git_log(&dir, &args)
}

#[tauri::command]
pub fn git_unstage_all(dir: String) -> Result<String, String> {
    sh::git_log(&dir, &["reset", "--mixed"])
}

#[tauri::command]
pub fn git_discard(dir: String, paths: Vec<String>) -> Result<String, String> {
    let mut log = String::new();
    for p in paths {
        let tracked = sh::git(&dir, &["ls-files", "--error-unmatch", "--", &p]).is_ok();
        let out = if tracked {
            sh::git_log(
                &dir,
                &[
                    "restore",
                    "--source=HEAD",
                    "--staged",
                    "--worktree",
                    "--",
                    &p,
                ],
            )?
        } else {
            sh::git_log(&dir, &["clean", "-fd", "--", &p])?
        };
        if !out.trim().is_empty() {
            log.push_str(out.trim());
            log.push('\n');
        }
    }
    Ok(log)
}

#[tauri::command]
pub fn git_commit(dir: String, message: String, amend: bool) -> Result<String, String> {
    let mut args: Vec<String> = vec!["commit".into()];
    if amend {
        args.push("--amend".into());
    }
    if message.trim().is_empty() {
        if !amend {
            return Err("コミットメッセージを入力してください".into());
        }
        args.push("--no-edit".into());
    } else {
        args.push("-m".into());
        args.push(message);
    }
    sh::git_log(&dir, &args)
}

// ------------------------------------------------------------------ 同期

#[tauri::command]
pub fn git_fetch(dir: String, prune: bool) -> Result<String, String> {
    let mut args: Vec<String> = vec!["fetch".into(), "--all".into(), "--tags".into()];
    if prune {
        args.push("--prune".into());
    }
    sh::git_log(&dir, &args)
}

#[tauri::command]
pub fn git_pull(dir: String, rebase: bool, autostash: bool) -> Result<String, String> {
    let mut args: Vec<String> = vec!["pull".into()];
    args.push(if rebase {
        "--rebase".into()
    } else {
        "--no-rebase".into()
    });
    if autostash {
        args.push("--autostash".into());
    }
    sh::git_log(&dir, &args)
}

#[tauri::command]
pub fn git_push(
    dir: String,
    remote: Option<String>,
    branch: Option<String>,
    set_upstream: bool,
    force_with_lease: bool,
) -> Result<String, String> {
    let mut args: Vec<String> = vec!["push".into()];
    if force_with_lease {
        args.push("--force-with-lease".into());
    }
    if set_upstream {
        args.push("-u".into());
    }
    let remote = remote.unwrap_or_else(|| "origin".to_string());
    args.push(remote);
    if let Some(b) = branch {
        if !b.is_empty() {
            args.push(b);
        }
    }
    sh::git_log(&dir, &args)
}

// ------------------------------------------------------------------ branch / checkout

#[tauri::command]
pub fn git_checkout(dir: String, target: String) -> Result<String, String> {
    sh::git_log(&dir, &["checkout", &target])
}

/// リモートブランチから追跡ブランチを作って checkout する
#[tauri::command]
pub fn git_checkout_remote(dir: String, remote_branch: String) -> Result<String, String> {
    let local = remote_branch
        .split_once('/')
        .map(|(_, rest)| rest.to_string())
        .unwrap_or_else(|| remote_branch.clone());
    let exists = sh::git(
        &dir,
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{local}"),
        ],
    )
    .is_ok();
    if exists {
        sh::git_log(&dir, &["checkout", &local])
    } else {
        sh::git_log(&dir, &["checkout", "-b", &local, "--track", &remote_branch])
    }
}

#[tauri::command]
pub fn git_create_branch(
    dir: String,
    name: String,
    start_point: Option<String>,
    checkout: bool,
) -> Result<String, String> {
    let mut args: Vec<String> = vec![];
    if checkout {
        args.push("checkout".into());
        args.push("-b".into());
    } else {
        args.push("branch".into());
    }
    args.push(name);
    if let Some(sp) = start_point {
        if !sp.is_empty() {
            args.push(sp);
        }
    }
    sh::git_log(&dir, &args)
}

#[tauri::command]
pub fn git_delete_branch(dir: String, name: String, force: bool) -> Result<String, String> {
    let flag = if force { "-D" } else { "-d" };
    sh::git_log(&dir, &["branch", flag, &name])
}

#[tauri::command]
pub fn git_delete_remote_branch(dir: String, remote_branch: String) -> Result<String, String> {
    let (remote, branch) = remote_branch
        .split_once('/')
        .ok_or("リモートブランチ名が不正です")?;
    sh::git_log(&dir, &["push", remote, "--delete", branch])
}

// ------------------------------------------------------------------ stash

#[tauri::command]
pub fn git_stash_push(
    dir: String,
    message: Option<String>,
    include_untracked: bool,
    keep_index: bool,
) -> Result<String, String> {
    let mut args: Vec<String> = vec!["stash".into(), "push".into()];
    if include_untracked {
        args.push("--include-untracked".into());
    }
    if keep_index {
        args.push("--keep-index".into());
    }
    if let Some(m) = message {
        if !m.trim().is_empty() {
            args.push("-m".into());
            args.push(m);
        }
    }
    sh::git_log(&dir, &args)
}

#[tauri::command]
pub fn git_stash_apply(dir: String, refname: String, pop: bool) -> Result<String, String> {
    let sub = if pop { "pop" } else { "apply" };
    sh::git_log(&dir, &["stash", sub, &refname])
}

#[tauri::command]
pub fn git_stash_drop(dir: String, refname: String) -> Result<String, String> {
    sh::git_log(&dir, &["stash", "drop", &refname])
}

// ------------------------------------------------------------------ worktree

#[tauri::command]
pub fn git_worktree_add(
    dir: String,
    path: String,
    branch: String,
    create_branch: bool,
    base: Option<String>,
) -> Result<String, String> {
    let mut args: Vec<String> = vec!["worktree".into(), "add".into()];
    if create_branch {
        args.push("-b".into());
        args.push(branch.clone());
        args.push(path);
        if let Some(b) = base {
            if !b.is_empty() {
                args.push(b);
            }
        }
    } else {
        args.push(path);
        args.push(branch);
    }
    sh::git_log(&dir, &args)
}

#[tauri::command]
pub fn git_worktree_remove(dir: String, path: String, force: bool) -> Result<String, String> {
    let mut args: Vec<String> = vec!["worktree".into(), "remove".into()];
    if force {
        args.push("--force".into());
    }
    args.push(path);
    sh::git_log(&dir, &args)
}

#[tauri::command]
pub fn git_worktree_prune(dir: String) -> Result<String, String> {
    sh::git_log(&dir, &["worktree", "prune", "-v"])
}

// ------------------------------------------------------------------ GitHub (gh CLI)

#[tauri::command]
pub fn gh_status(dir: String) -> Result<github::GhStatus, String> {
    Ok(github::status(&dir))
}

#[tauri::command]
pub fn gh_pr_list(dir: String, state: String, limit: Option<u32>) -> Result<Value, String> {
    github::pr_list(&dir, &state, limit.unwrap_or(30))
}

#[tauri::command]
pub fn gh_pr_for_branch(dir: String, branch: String) -> Result<Value, String> {
    github::pr_for_branch(&dir, &branch)
}

#[tauri::command]
pub fn gh_pr_view(dir: String, number: u32) -> Result<Value, String> {
    github::pr_view(&dir, number)
}

#[tauri::command]
pub fn gh_pr_create(
    dir: String,
    title: String,
    body: String,
    base: String,
    head: String,
    draft: bool,
    web: bool,
) -> Result<String, String> {
    github::pr_create(&dir, &title, &body, &base, &head, draft, web)
}

#[tauri::command]
pub fn gh_pr_checkout(dir: String, number: u32) -> Result<String, String> {
    github::pr_checkout(&dir, number)
}

#[tauri::command]
pub fn gh_pr_merge(
    dir: String,
    number: u32,
    method: String,
    delete_branch: bool,
) -> Result<String, String> {
    github::pr_merge(&dir, number, &method, delete_branch)
}

#[tauri::command]
pub fn gh_pr_template(dir: String) -> Result<Option<String>, String> {
    Ok(github::pr_template(&dir))
}

/// アバターキャッシュの置き場 (~/Library/Caches/dev.gitgraph.app/avatars.json など)
fn avatar_cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("キャッシュディレクトリを特定できません: {e}"))?;
    Ok(dir.join("avatars.json"))
}

/// コミット作者のメール → GitHub アバター URL。解決できないものは null。
/// 結果はディスクにキャッシュされるので、同じ作者で gh を何度も叩かない。
#[tauri::command]
pub fn gh_avatars(
    app: tauri::AppHandle,
    dir: String,
    queries: Vec<avatar::AvatarQuery>,
) -> Result<HashMap<String, Option<String>>, String> {
    avatar::resolve(&dir, &avatar_cache_path(&app)?, queries)
}

#[tauri::command]
pub fn gh_avatars_clear(app: tauri::AppHandle) -> Result<(), String> {
    avatar::clear(&avatar_cache_path(&app)?)
}

// ------------------------------------------------------------------ misc

/// 設定で登録したプロジェクト置き場から git リポジトリを探す。
#[tauri::command]
pub fn scan_repos(roots: Vec<String>, depth: usize) -> Vec<repo::ProjectEntry> {
    repo::scan(&roots, depth)
}

#[tauri::command]
pub fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}

/// コミットメッセージのテンプレ用: 直近のコミットメッセージ
#[tauri::command]
pub fn last_commit_message(dir: String) -> Result<String, String> {
    Ok(sh::git(&dir, &["log", "-1", "--format=%B"])
        .unwrap_or_default()
        .trim_end()
        .to_string())
}

/// 起動時に開くリポジトリ: コマンドライン引数 → GIT_GRAPH_REPO → カレントディレクトリ
#[tauri::command]
pub fn initial_repo() -> Option<String> {
    let arg = std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && std::path::Path::new(a).is_dir());
    let candidate = arg
        .or_else(|| std::env::var("GIT_GRAPH_REPO").ok())
        .or_else(|| {
            std::env::current_dir()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
        })?;
    // git リポジトリでなければ何も返さない
    sh::git(&candidate, &["rev-parse", "--show-toplevel"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}
