//! E2E テスト用のブリッジ。
//!
//! Tauri の WebView は Playwright から操作できないので、E2E ではフロントを普通の
//! ブラウザで動かし、`invoke` をこのプロセスへ転送する (e2e/fixtures.ts)。
//! Tauri コマンドの関数をそのまま呼ぶので、git の操作はアプリと同じコードを通る。
//!
//! プロトコルは 1 行 1 JSON:
//!   stdin : {"id": 1, "cmd": "graph_load", "args": {"dir": "...", "limit": 200}}
//!   stdout: {"id": 1, "ok": <戻り値>} または {"id": 1, "err": "<メッセージ>"}
//!
//! 引数のキーは Tauri と同じく camelCase。AppHandle が要るコマンド (gh_avatars など) は
//! 扱わないので、必要ならテスト側でスタブする。

use std::io::{BufRead, Write};

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};

use app_lib::commands as c;

/// 引数を 1 つ取り出す。無いキーは null として読むので Option の引数は省略できる。
fn arg<T: DeserializeOwned>(args: &Value, key: &str) -> Result<T, String> {
    let v = args.get(key).cloned().unwrap_or(Value::Null);
    serde_json::from_value(v).map_err(|e| format!("引数 {key} が不正です: {e}"))
}

fn reply<T: Serialize>(r: Result<T, String>) -> Result<Value, String> {
    r.and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
}

/// `call!(関数, "引数1", "引数2", ...)`: 引数を取り出して呼び、戻り値を JSON にする
macro_rules! call {
    ($args:ident, $f:path $(, $key:literal)*) => {
        reply($f($(arg($args, $key)?),*))
    };
}

fn dispatch(cmd: &str, a: &Value) -> Result<Value, String> {
    match cmd {
        // 読み取り
        "repo_open" => call!(a, c::repo_open, "path"),
        "graph_load" => call!(a, c::graph_load, "dir", "limit"),
        "status_load" => call!(a, c::status_load, "dir"),
        "branches_load" => call!(a, c::branches_load, "dir"),
        "tags_load" => call!(a, c::tags_load, "dir"),
        "stash_load" => call!(a, c::stash_load, "dir"),
        "worktree_load" => call!(a, c::worktree_load, "dir"),
        "commit_detail" => call!(a, c::commit_detail, "dir", "sha"),
        "wip_files" => call!(a, c::wip_files, "dir", "staged"),
        "stash_files" => call!(a, c::stash_files, "dir", "refname"),
        "diff_text" => call!(a, c::diff_text, "dir", "kind", "path", "sha", "context"),
        "last_commit_message" => call!(a, c::last_commit_message, "dir"),
        "commit_context" => call!(a, c::commit_context, "dir", "amend"),
        "stash_context" => call!(a, c::stash_context, "dir", "refname"),
        "pr_context" => call!(a, c::pr_context, "dir", "remote", "base", "head"),
        "scan_repos" => reply(Ok(c::scan_repos(arg(a, "roots")?, arg(a, "depth")?))),
        "home_dir" => reply(Ok(c::home_dir())),
        "initial_repo" => reply(Ok(c::initial_repo())),
        "app_logs" => reply(Ok(c::app_logs())),
        "app_logs_clear" => {
            c::app_logs_clear();
            reply(Ok(()))
        }

        // add / commit
        "git_stage" => call!(a, c::git_stage, "dir", "paths"),
        "git_stage_all" => call!(a, c::git_stage_all, "dir"),
        "git_unstage" => call!(a, c::git_unstage, "dir", "paths"),
        "git_unstage_all" => call!(a, c::git_unstage_all, "dir"),
        "git_discard" => call!(a, c::git_discard, "dir", "paths"),
        "git_commit" => call!(a, c::git_commit, "dir", "message", "amend"),

        // 同期
        "git_fetch" => call!(a, c::git_fetch, "dir", "prune"),
        "git_pull" => call!(a, c::git_pull, "dir", "rebase", "autostash"),
        "git_fast_forward" => call!(a, c::git_fast_forward, "dir", "branch"),
        "git_push" => call!(
            a,
            c::git_push,
            "dir",
            "remote",
            "branch",
            "setUpstream",
            "forceWithLease"
        ),

        // branch / checkout
        "git_checkout" => call!(a, c::git_checkout, "dir", "target"),
        "git_checkout_remote" => call!(a, c::git_checkout_remote, "dir", "remoteBranch"),
        "git_create_branch" => {
            call!(
                a,
                c::git_create_branch,
                "dir",
                "name",
                "startPoint",
                "checkout"
            )
        }
        "git_delete_branch" => call!(a, c::git_delete_branch, "dir", "name", "force"),
        "git_delete_remote_branch" => {
            call!(a, c::git_delete_remote_branch, "dir", "remoteBranch")
        }
        "git_delete_tag" => call!(a, c::git_delete_tag, "dir", "name"),
        "git_delete_remote_tag" => call!(a, c::git_delete_remote_tag, "dir", "remote", "name"),

        // stash
        "git_stash_push" => call!(
            a,
            c::git_stash_push,
            "dir",
            "message",
            "includeUntracked",
            "keepIndex"
        ),
        "git_stash_apply" => call!(a, c::git_stash_apply, "dir", "refname", "pop"),
        "git_stash_drop" => call!(a, c::git_stash_drop, "dir", "refname"),
        "git_stash_rename" => call!(a, c::git_stash_rename, "dir", "refname", "message"),

        // worktree
        "git_worktree_add" => call!(
            a,
            c::git_worktree_add,
            "dir",
            "path",
            "branch",
            "createBranch",
            "base"
        ),
        "git_worktree_remove" => call!(a, c::git_worktree_remove, "dir", "path", "force"),
        "git_worktree_prune" => call!(a, c::git_worktree_prune, "dir"),

        // tidy
        "git_tidy_plan" => call!(a, c::git_tidy_plan, "dir", "fetch"),
        "git_tidy_apply" => call!(a, c::git_tidy_apply, "dir", "ops"),

        // recompose
        "recompose_context" => call!(a, c::recompose_context, "dir", "branch"),
        "recompose_apply" => call!(a, c::recompose_apply, "dir", "op"),

        // GitHub (gh CLI)
        "gh_status" => call!(a, c::gh_status, "dir"),
        "gh_owners" => call!(a, c::gh_owners, "dir"),
        "gh_pr_list" => call!(a, c::gh_pr_list, "dir", "state", "limit"),
        "gh_pr_for_branch" => call!(a, c::gh_pr_for_branch, "dir", "branch"),
        "gh_pr_view" => call!(a, c::gh_pr_view, "dir", "number"),
        "gh_pr_template" => call!(a, c::gh_pr_template, "dir"),

        _ => Err(format!("e2e-bridge: 未対応のコマンドです: {cmd}")),
    }
}

fn main() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let req: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("e2e-bridge: 不正なリクエスト: {e}");
                continue;
            }
        };
        let id = req.get("id").cloned().unwrap_or(Value::Null);
        let cmd = req.get("cmd").and_then(Value::as_str).unwrap_or_default();
        let args = req.get("args").cloned().unwrap_or_else(|| json!({}));
        let res = match dispatch(cmd, &args) {
            Ok(v) => json!({ "id": id, "ok": v }),
            Err(e) => json!({ "id": id, "err": e }),
        };
        let _ = writeln!(stdout, "{res}");
        let _ = stdout.flush();
    }
}
