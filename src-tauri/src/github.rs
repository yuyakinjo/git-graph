use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

use crate::sh;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GhStatus {
    pub installed: bool,
    pub authenticated: bool,
    pub login: Option<String>,
    pub repo: Option<String>,
    pub default_branch: Option<String>,
    pub url: Option<String>,
    pub message: Option<String>,
}

pub fn status(dir: &str) -> GhStatus {
    let mut st = GhStatus {
        installed: false,
        authenticated: false,
        login: None,
        repo: None,
        default_branch: None,
        url: None,
        message: None,
    };

    let version = sh::exec(dir, "gh", &["--version"]);
    match version {
        Ok(o) if o.ok() => st.installed = true,
        Ok(o) => {
            st.message = Some(o.message());
            return st;
        }
        Err(e) => {
            st.message = Some(e);
            return st;
        }
    }

    match sh::exec(dir, "gh", &["auth", "status"]) {
        Ok(o) if o.ok() => {
            st.authenticated = true;
            // "✓ Logged in to github.com account foo (keyring)"
            let text = format!("{}{}", o.stdout, o.stderr);
            for line in text.lines() {
                if let Some(idx) = line.find("account ") {
                    let rest = &line[idx + 8..];
                    let login = rest.split_whitespace().next().unwrap_or("").to_string();
                    if !login.is_empty() {
                        st.login = Some(login);
                        break;
                    }
                }
            }
        }
        Ok(o) => {
            st.message = Some(o.message());
            return st;
        }
        Err(e) => {
            st.message = Some(e);
            return st;
        }
    }

    if let Ok(json) = sh::gh(
        dir,
        &[
            "repo",
            "view",
            "--json",
            "nameWithOwner,defaultBranchRef,url",
        ],
    ) {
        if let Ok(v) = serde_json::from_str::<Value>(&json) {
            st.repo = v["nameWithOwner"].as_str().map(|s| s.to_string());
            st.default_branch = v["defaultBranchRef"]["name"]
                .as_str()
                .map(|s| s.to_string());
            st.url = v["url"].as_str().map(|s| s.to_string());
        }
    }
    st
}

const PR_FIELDS: &str = "number,title,state,isDraft,author,headRefName,baseRefName,url,updatedAt,createdAt,reviewDecision,mergeable,additions,deletions,statusCheckRollup";

pub fn pr_list(dir: &str, state: &str, limit: u32) -> Result<Value, String> {
    let limit = limit.to_string();
    let raw = sh::gh(
        dir,
        &[
            "pr", "list", "--json", PR_FIELDS, "--state", state, "--limit", &limit,
        ],
    )?;
    serde_json::from_str(&raw).map_err(|e| format!("gh の出力を解析できません: {e}"))
}

pub fn pr_for_branch(dir: &str, branch: &str) -> Result<Value, String> {
    let raw = sh::gh(
        dir,
        &[
            "pr", "list", "--head", branch, "--state", "all", "--json", PR_FIELDS, "--limit", "5",
        ],
    )?;
    serde_json::from_str(&raw).map_err(|e| format!("gh の出力を解析できません: {e}"))
}

pub fn pr_view(dir: &str, number: u32) -> Result<Value, String> {
    let n = number.to_string();
    let fields = format!("{PR_FIELDS},body,commits,files,labels,assignees,reviews");
    let raw = sh::gh(dir, &["pr", "view", &n, "--json", &fields])?;
    serde_json::from_str(&raw).map_err(|e| format!("gh の出力を解析できません: {e}"))
}

#[allow(clippy::too_many_arguments)]
pub fn pr_create(
    dir: &str,
    title: &str,
    body: &str,
    base: &str,
    head: &str,
    draft: bool,
    web: bool,
) -> Result<String, String> {
    let mut args: Vec<String> = vec!["pr".into(), "create".into()];
    if web {
        args.push("--web".into());
    }
    args.push("--title".into());
    args.push(title.to_string());
    args.push("--body".into());
    args.push(body.to_string());
    if !base.is_empty() {
        args.push("--base".into());
        args.push(base.to_string());
    }
    if !head.is_empty() {
        args.push("--head".into());
        args.push(head.to_string());
    }
    if draft {
        args.push("--draft".into());
    }
    let out = sh::exec(dir, "gh", &args)?;
    if out.ok() {
        Ok(out.message())
    } else {
        Err(out.message())
    }
}

pub fn pr_checkout(dir: &str, number: u32) -> Result<String, String> {
    let n = number.to_string();
    let out = sh::exec(dir, "gh", &["pr", "checkout", &n])?;
    if out.ok() {
        Ok(out.message())
    } else {
        Err(out.message())
    }
}

pub fn pr_merge(
    dir: &str,
    number: u32,
    method: &str,
    delete_branch: bool,
) -> Result<String, String> {
    let n = number.to_string();
    let mut args: Vec<String> = vec!["pr".into(), "merge".into(), n];
    args.push(match method {
        "squash" => "--squash".into(),
        "rebase" => "--rebase".into(),
        _ => "--merge".into(),
    });
    if delete_branch {
        args.push("--delete-branch".into());
    }
    let out = sh::exec(dir, "gh", &args)?;
    if out.ok() {
        Ok(out.message())
    } else {
        Err(out.message())
    }
}

/// PR 作成時のデフォルト本文テンプレート (.github/PULL_REQUEST_TEMPLATE.md)
pub fn pr_template(dir: &str) -> Option<String> {
    let candidates = [
        ".github/pull_request_template.md",
        ".github/PULL_REQUEST_TEMPLATE.md",
        "docs/pull_request_template.md",
        ".gitlab/merge_request_templates/default.md",
        "PULL_REQUEST_TEMPLATE.md",
    ];
    for c in candidates {
        let p = format!("{dir}/{c}");
        if let Ok(text) = std::fs::read_to_string(&p) {
            return Some(text);
        }
    }
    // 複数テンプレート形式 (.github/PULL_REQUEST_TEMPLATE/*.md) は名前順で先頭のものを使う
    let mut files: Vec<PathBuf> = std::fs::read_dir(format!("{dir}/.github/PULL_REQUEST_TEMPLATE"))
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("md")))
        .collect();
    files.sort();
    files.first().and_then(|p| std::fs::read_to_string(p).ok())
}

/// リポジトリの作成先に選べるアカウント (自分のログイン + 所属 org)。
/// org の取得には read:org スコープが要るので、取れなければ自分だけを返す。
pub fn owners(dir: &str) -> Vec<String> {
    let mut list: Vec<String> = Vec::new();
    if let Ok(login) = sh::gh(dir, &["api", "user", "--jq", ".login"]) {
        let login = login.trim();
        if !login.is_empty() {
            list.push(login.to_string());
        }
    }
    if let Ok(orgs) = sh::gh(
        dir,
        &["api", "user/orgs", "--paginate", "--jq", ".[].login"],
    ) {
        for line in orgs.lines() {
            let name = line.trim();
            if !name.is_empty() && !list.iter().any(|o| o == name) {
                list.push(name.to_string());
            }
        }
    }
    list
}

/// GitHub にリポジトリを作成し、このリポジトリのリモートとして登録する。
/// `--source` を使うので、リモート未設定のローカルリポジトリが前提。
pub fn repo_create(
    dir: &str,
    name: &str,
    visibility: &str,
    description: &str,
    remote: &str,
    push: bool,
) -> Result<String, String> {
    let mut args: Vec<String> = vec!["repo".into(), "create".into(), name.into()];
    args.push(match visibility {
        "public" => "--public".into(),
        "internal" => "--internal".into(),
        _ => "--private".into(),
    });
    args.push("--source".into());
    args.push(".".into());
    args.push("--remote".into());
    args.push(remote.to_string());
    if !description.trim().is_empty() {
        args.push("--description".into());
        args.push(description.trim().to_string());
    }
    if push {
        args.push("--push".into());
    }
    let out = sh::exec(dir, "gh", &args)?;
    if out.ok() {
        Ok(out.message())
    } else {
        Err(out.message())
    }
}
