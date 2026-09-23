//! マージ済みのブランチと worktree の整理 (`my git tidy` 相当)。
//!
//! 判定 (`plan`) と削除 (`apply`) を分けてあり、UI は判定結果を見せてから
//! ユーザーが選んだものだけを `apply` に渡す。`apply` は判定時の SHA と
//! 今の SHA を突き合わせ、その間に動いたものは消さない。

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::repo;
use crate::sh;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TidyItem {
    /// "branch" | "worktree" | "prune" | "fastForward"
    pub kind: String,
    /// ブランチ名 / worktree のパス
    pub target: String,
    /// 判定したときの SHA。apply 時に一致しなければ消さない
    pub sha: String,
    /// true なら削除 (早送り) 候補、false なら残す
    pub remove: bool,
    pub reason: String,
    pub pr_number: Option<u64>,
    /// このブランチを消すには先に消す必要がある worktree のパス
    pub requires: Option<String>,
    /// worktree のブランチ名 (表示用)
    pub branch: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TidyPlan {
    pub main: String,
    pub upstream: String,
    /// gh が使えず PR の判定を省いたときの理由
    pub gh_note: Option<String>,
    pub items: Vec<TidyItem>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TidyOp {
    pub kind: String,
    pub target: String,
    pub sha: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TidyResult {
    pub kind: String,
    pub target: String,
    pub ok: bool,
    pub message: String,
}

struct MergedPr {
    number: u64,
    head_oid: String,
}

fn ok(dir: &str, args: &[&str]) -> bool {
    sh::exec(dir, "git", args).map(|o| o.ok()).unwrap_or(false)
}

fn text(dir: &str, args: &[&str]) -> String {
    sh::git(dir, args).unwrap_or_default().trim().to_string()
}

fn is_ancestor(dir: &str, a: &str, b: &str) -> bool {
    ok(dir, &["merge-base", "--is-ancestor", a, b])
}

/// origin/HEAD が指す既定ブランチ。取れなければ main / master の順に探す
fn default_branch(dir: &str) -> String {
    let r = text(
        dir,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    );
    if let Some(name) = r.strip_prefix("origin/") {
        return name.to_string();
    }
    for name in ["main", "master"] {
        if ok(
            dir,
            &[
                "rev-parse",
                "--verify",
                "--quiet",
                &format!("refs/remotes/origin/{name}"),
            ],
        ) {
            return name.to_string();
        }
    }
    "main".to_string()
}

/// マージ済み PR を head ブランチ名ごとにまとめる (gh は 1 回だけ呼ぶ)
fn merged_prs(dir: &str) -> Result<HashMap<String, Vec<MergedPr>>, String> {
    let raw = sh::gh(
        dir,
        &[
            "pr",
            "list",
            "--state",
            "merged",
            "--limit",
            "300",
            "--json",
            "number,headRefName,headRefOid",
        ],
    )?;
    let list: Value =
        serde_json::from_str(&raw).map_err(|e| format!("gh の出力を解析できません: {e}"))?;
    let mut map: HashMap<String, Vec<MergedPr>> = HashMap::new();
    for pr in list.as_array().into_iter().flatten() {
        let (Some(name), Some(number), Some(oid)) = (
            pr["headRefName"].as_str(),
            pr["number"].as_u64(),
            pr["headRefOid"].as_str(),
        ) else {
            continue;
        };
        map.entry(name.to_string()).or_default().push(MergedPr {
            number,
            head_oid: oid.to_string(),
        });
    }
    Ok(map)
}

/// `sha` の内容がすべてマージ済み PR に含まれるなら、その PR 番号。
/// 名前だけでなく SHA も見るので、同名ブランチを使い回していても誤爆しない。
/// (squash マージでも PR の head は tip と一致するか、tip を祖先に持つ)
fn covering_pr(dir: &str, prs: Option<&Vec<MergedPr>>, sha: &str) -> Option<u64> {
    prs?.iter()
        .find(|pr| pr.head_oid == sha || is_ancestor(dir, sha, &pr.head_oid))
        .map(|pr| pr.number)
}

pub fn plan(dir: &str, fetch: bool) -> Result<TidyPlan, String> {
    if fetch && ok(dir, &["remote", "get-url", "origin"]) {
        sh::git_log(dir, &["fetch", "--prune", "--quiet", "origin"])?;
    }
    let main = default_branch(dir);
    let upstream = format!("origin/{main}");
    let has_upstream = ok(dir, &["rev-parse", "--verify", "--quiet", &upstream]);

    let (prs, gh_note) = match merged_prs(dir) {
        Ok(m) => (m, None),
        Err(e) => (
            HashMap::new(),
            Some(format!("マージ済み PR を取得できないため、{upstream} への取り込みだけで判定しています ({e})")),
        ),
    };
    if !has_upstream && gh_note.is_some() {
        return Err(format!(
            "{upstream} が見つからず、gh も使えないため判定できません"
        ));
    }

    let trees = repo::worktree_list(dir)?;
    let mut items: Vec<TidyItem> = vec![];

    // ---- main の早送り
    let main_sha = text(
        dir,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/heads/{main}"),
        ],
    );
    if has_upstream && !main_sha.is_empty() {
        let up_sha = text(dir, &["rev-parse", &upstream]);
        if up_sha != main_sha && is_ancestor(dir, &main_sha, &up_sha) {
            let behind = text(
                dir,
                &["rev-list", "--count", &format!("{main_sha}..{up_sha}")],
            );
            items.push(TidyItem {
                kind: "fastForward".into(),
                target: main.clone(),
                sha: main_sha.clone(),
                remove: true,
                reason: format!("{upstream} より {behind} コミット遅れている"),
                pr_number: None,
                requires: None,
                branch: None,
            });
        }
    }

    // ---- worktree
    let mut removable_trees: HashSet<String> = HashSet::new();
    for wt in &trees {
        if wt.is_main || wt.bare {
            continue;
        }
        let item = |remove: bool, reason: String, pr: Option<u64>| TidyItem {
            kind: if wt.prunable {
                "prune".into()
            } else {
                "worktree".into()
            },
            target: wt.path.clone(),
            sha: wt.head.clone(),
            remove,
            reason,
            pr_number: pr,
            requires: None,
            branch: wt.branch.clone(),
        };
        let verdict = if wt.prunable {
            item(true, "ディレクトリが存在しない".into(), None)
        } else if wt.is_current {
            item(false, "今開いている worktree".into(), None)
        } else if wt.locked {
            item(false, "ロックされている".into(), None)
        } else if !text(&wt.path, &["status", "--porcelain"]).is_empty() {
            item(false, "未コミットの変更がある".into(), None)
        } else if has_upstream && is_ancestor(dir, &wt.head, &upstream) {
            item(true, format!("HEAD が {upstream} に取り込み済み"), None)
        } else if let Some(n) = wt
            .branch
            .as_ref()
            .and_then(|b| covering_pr(dir, prs.get(b), &wt.head))
        {
            item(true, format!("PR #{n} がマージ済み"), Some(n))
        } else {
            item(false, "未マージのコミットがある".into(), None)
        };
        if verdict.remove {
            removable_trees.insert(wt.path.clone());
        }
        items.push(verdict);
    }

    // ---- ローカルブランチ
    let checked_out: HashMap<String, &repo::WorktreeInfo> = trees
        .iter()
        .filter_map(|wt| wt.branch.clone().map(|b| (b, wt)))
        .collect();
    let refs = text(
        dir,
        &[
            "for-each-ref",
            "--format=%(refname:short)%09%(objectname)",
            "refs/heads/",
        ],
    );
    for line in refs.lines() {
        let Some((name, sha)) = line.split_once('\t') else {
            continue;
        };
        if name == main {
            continue;
        }
        let item =
            |remove: bool, reason: String, pr: Option<u64>, requires: Option<String>| TidyItem {
                kind: "branch".into(),
                target: name.to_string(),
                sha: sha.to_string(),
                remove,
                reason,
                pr_number: pr,
                requires,
                branch: None,
            };
        let (merged, pr) = if has_upstream && is_ancestor(dir, sha, &upstream) {
            (Some(format!("{upstream} に取り込み済み")), None)
        } else if let Some(n) = covering_pr(dir, prs.get(name), sha) {
            (Some(format!("PR #{n} がマージ済み")), Some(n))
        } else {
            (None, None)
        };
        let verdict = match (merged, checked_out.get(name)) {
            // 同名の PR はマージ済みでも、その後に積んだコミットがあるなら残す
            (None, _) => match prs.get(name).and_then(|v| v.first()) {
                Some(old) => item(
                    false,
                    format!(
                        "PR #{} はマージ済みだが、その後のコミットがある",
                        old.number
                    ),
                    Some(old.number),
                    None,
                ),
                None => item(
                    false,
                    "マージされた PR がなく、main にも未取り込み".into(),
                    None,
                    None,
                ),
            },
            (Some(reason), None) => item(true, reason, pr, None),
            (Some(reason), Some(wt)) if removable_trees.contains(&wt.path) => {
                item(true, reason, pr, Some(wt.path.clone()))
            }
            (Some(_), Some(wt)) => item(false, format!("{} でチェックアウト中", wt.path), pr, None),
        };
        items.push(verdict);
    }

    Ok(TidyPlan {
        main,
        upstream,
        gh_note,
        items,
    })
}

fn result(op: &TidyOp, r: Result<String, String>) -> TidyResult {
    TidyResult {
        kind: op.kind.clone(),
        target: op.target.clone(),
        ok: r.is_ok(),
        message: match r {
            Ok(s) | Err(s) => s.trim().to_string(),
        },
    }
}

fn fast_forward(
    dir: &str,
    op: &TidyOp,
    upstream: &str,
    trees: &[repo::WorktreeInfo],
) -> Result<String, String> {
    let now = text(dir, &["rev-parse", &format!("refs/heads/{}", op.target)]);
    if now != op.sha {
        return Err("判定後にブランチが動いたため中止しました".into());
    }
    match trees
        .iter()
        .find(|wt| wt.branch.as_deref() == Some(op.target.as_str()))
    {
        // チェックアウト中のブランチは fetch で更新できないので、その worktree で merge する
        Some(wt) => sh::git_log(&wt.path, &["merge", "--ff-only", upstream]),
        None => sh::git_log(
            dir,
            &[
                "fetch",
                ".",
                &format!("{upstream}:refs/heads/{}", op.target),
            ],
        ),
    }
}

fn remove_worktree(dir: &str, op: &TidyOp) -> Result<String, String> {
    if text(&op.target, &["rev-parse", "HEAD"]) != op.sha {
        return Err("判定後に HEAD が動いたため中止しました".into());
    }
    // --force は付けない: 未コミットの変更が生じていれば git が拒否する
    sh::git_log(dir, &["worktree", "remove", &op.target])
}

fn delete_branch(dir: &str, op: &TidyOp) -> Result<String, String> {
    let now = text(
        dir,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/heads/{}", op.target),
        ],
    );
    if now != op.sha {
        return Err("判定後にブランチが動いたため中止しました".into());
    }
    // マージ済みかどうかは plan で SHA まで確認済み。squash マージは -d が通らないので -D
    sh::git_log(dir, &["branch", "-D", &op.target])
}

/// 早送り → worktree の削除 → prune → ブランチ削除 の順に実行する。
/// worktree を消してからでないと、そこでチェックアウト中のブランチは消せない。
pub fn apply(dir: &str, ops: Vec<TidyOp>) -> Result<Vec<TidyResult>, String> {
    let upstream = format!("origin/{}", default_branch(dir));
    let trees = repo::worktree_list(dir)?;
    let by_kind = |k: &'static str| ops.iter().filter(move |o| o.kind == k);
    let mut out = vec![];

    for op in by_kind("fastForward") {
        out.push(result(op, fast_forward(dir, op, &upstream, &trees)));
    }
    let mut removed: HashSet<String> = HashSet::new();
    for op in by_kind("worktree") {
        let r = result(op, remove_worktree(dir, op));
        if r.ok {
            removed.insert(op.target.clone());
        }
        out.push(r);
    }
    if by_kind("prune").next().is_some() || !removed.is_empty() {
        let pruned = sh::git_log(dir, &["worktree", "prune", "-v"]);
        for op in by_kind("prune") {
            if pruned.is_ok() {
                removed.insert(op.target.clone());
            }
            out.push(result(op, pruned.clone()));
        }
    }
    for op in by_kind("branch") {
        // worktree の削除に失敗したブランチは、まだチェックアウト中なので触らない
        let blocked = trees.iter().find(|wt| {
            wt.branch.as_deref() == Some(op.target.as_str()) && !removed.contains(&wt.path)
        });
        out.push(match blocked {
            Some(wt) => result(
                op,
                Err(format!("{} でチェックアウト中のため残しました", wt.path)),
            ),
            None => result(op, delete_branch(dir, op)),
        });
    }
    Ok(out)
}
