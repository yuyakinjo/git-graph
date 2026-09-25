use serde::Serialize;

use crate::sh;

const FS: &str = "\u{1f}";

// ---------------------------------------------------------------- repo info

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub root: String,
    pub name: String,
    pub head_branch: Option<String>,
    pub head_hash: Option<String>,
    pub detached: bool,
    pub remotes: Vec<String>,
    pub is_linked_worktree: bool,
    /// origin/HEAD が指す既定ブランチ (取れなければ main / master)
    pub default_branch: String,
    pub state: String, // clean | merging | rebasing | cherry-picking | reverting | bisecting
}

/// origin/HEAD が指す既定ブランチ。取れなければ main / master の順に探す
pub fn default_branch(dir: &str) -> String {
    let r = sh::git(
        dir,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    )
    .unwrap_or_default();
    if let Some(name) = r.trim().strip_prefix("origin/") {
        return name.to_string();
    }
    // リモートが無いリポジトリでもローカルの main / master を既定とみなす
    for prefix in ["refs/remotes/origin", "refs/heads"] {
        for name in ["main", "master"] {
            let exists = sh::git(
                dir,
                &[
                    "rev-parse",
                    "--verify",
                    "--quiet",
                    &format!("{prefix}/{name}"),
                ],
            )
            .is_ok();
            if exists {
                return name.to_string();
            }
        }
    }
    "main".to_string()
}

pub fn info(path: &str) -> Result<RepoInfo, String> {
    let root = sh::git(path, &["rev-parse", "--show-toplevel"])?
        .trim()
        .to_string();
    if root.is_empty() {
        return Err("git リポジトリが見つかりません".into());
    }
    let head_ref = sh::git(&root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_default()
        .trim()
        .to_string();
    let detached = head_ref == "HEAD" || head_ref.is_empty();
    let head_hash = sh::git(&root, &["rev-parse", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let remotes: Vec<String> = sh::git(&root, &["remote"])
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let common = sh::git(&root, &["rev-parse", "--git-common-dir"])
        .unwrap_or_default()
        .trim()
        .to_string();
    let git_dir = sh::git(&root, &["rev-parse", "--git-dir"])
        .unwrap_or_default()
        .trim()
        .to_string();
    let is_linked_worktree = !common.is_empty() && common != git_dir;

    let exists = |rel: &str| -> bool {
        let base = if common.is_empty() {
            format!("{root}/.git")
        } else if common.starts_with('/') {
            common.clone()
        } else {
            format!("{root}/{common}")
        };
        std::path::Path::new(&format!("{base}/{rel}")).exists()
    };
    let gd = |rel: &str| -> bool {
        let base = if git_dir.starts_with('/') {
            git_dir.clone()
        } else {
            format!("{root}/{git_dir}")
        };
        std::path::Path::new(&format!("{base}/{rel}")).exists()
    };
    let state = if gd("MERGE_HEAD") {
        "merging"
    } else if gd("rebase-merge") || gd("rebase-apply") {
        "rebasing"
    } else if gd("CHERRY_PICK_HEAD") {
        "cherry-picking"
    } else if gd("REVERT_HEAD") {
        "reverting"
    } else if exists("BISECT_LOG") {
        "bisecting"
    } else {
        "clean"
    };

    let name = root.rsplit('/').next().unwrap_or("repository").to_string();

    let default_branch = default_branch(&root);
    Ok(RepoInfo {
        root,
        name,
        head_branch: if detached { None } else { Some(head_ref) },
        head_hash,
        detached,
        remotes,
        is_linked_worktree,
        default_branch,
        state: state.to_string(),
    })
}

// ---------------------------------------------------------------- scan

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub path: String,
    pub name: String,
    /// どの登録フォルダの配下で見つかったか
    pub root: String,
    /// root からの相対パス (同名リポジトリの区別用)
    pub rel: String,
}

/// 掘っても git リポジトリが出てこないディレクトリは早めに捨てる。
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "vendor",
    "target",
    "dist",
    "build",
    "Library",
    "Applications",
];

fn is_repo(dir: &std::path::Path) -> bool {
    dir.join(".git").exists()
}

/// roots 配下を depth 段まで辿り、git リポジトリのディレクトリを集める。
/// リポジトリを見つけたらその中には降りない (サブモジュールは対象外)。
pub fn scan(roots: &[String], depth: usize) -> Vec<ProjectEntry> {
    let mut out: Vec<ProjectEntry> = vec![];
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for root in roots {
        let root_path = std::path::Path::new(root);
        if !root_path.is_dir() {
            continue;
        }
        // (ディレクトリ, root からの深さ)
        let mut stack: Vec<(std::path::PathBuf, usize)> = vec![(root_path.to_path_buf(), 0)];
        while let Some((dir, level)) = stack.pop() {
            if is_repo(&dir) {
                let path = dir.to_string_lossy().to_string();
                let rel = dir
                    .strip_prefix(root_path)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| path.clone());
                if seen.insert(path.clone()) {
                    out.push(ProjectEntry {
                        name: dir
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_else(|| path.clone()),
                        path,
                        root: root.clone(),
                        rel,
                    });
                }
                continue;
            }
            if level >= depth {
                continue;
            }
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let Ok(ft) = entry.file_type() else { continue };
                if !ft.is_dir() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                stack.push((entry.path(), level + 1));
            }
        }
    }

    out.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.path.cmp(&b.path))
    });
    out
}

// ---------------------------------------------------------------- status

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub orig_path: Option<String>,
    pub index_status: String,
    pub work_status: String,
    pub untracked: bool,
    pub conflict: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StatusData {
    pub staged: Vec<FileEntry>,
    pub unstaged: Vec<FileEntry>,
    pub conflicts: Vec<FileEntry>,
}

pub fn status(dir: &str) -> Result<StatusData, String> {
    let raw = sh::git(
        dir,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    let tokens: Vec<&str> = raw.split('\0').collect();
    let mut i = 0usize;
    let mut staged = vec![];
    let mut unstaged = vec![];
    let mut conflicts = vec![];

    while i < tokens.len() {
        let t = tokens[i];
        if t.len() < 3 {
            i += 1;
            continue;
        }
        let bytes: Vec<char> = t.chars().collect();
        let x = bytes[0];
        let y = bytes[1];
        let path: String = t.chars().skip(3).collect();
        let mut orig_path = None;
        if x == 'R' || x == 'C' {
            if i + 1 < tokens.len() {
                orig_path = Some(tokens[i + 1].to_string());
                i += 1;
            }
        }
        i += 1;

        let is_conflict = matches!((x, y), ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D'));
        let untracked = x == '?' && y == '?';
        let entry = FileEntry {
            path: path.clone(),
            orig_path: orig_path.clone(),
            index_status: x.to_string(),
            work_status: y.to_string(),
            untracked,
            conflict: is_conflict,
        };

        if is_conflict {
            conflicts.push(entry);
            continue;
        }
        if untracked {
            unstaged.push(entry);
            continue;
        }
        if x != ' ' && x != '?' {
            staged.push(entry.clone());
        }
        if y != ' ' && y != '?' {
            unstaged.push(entry);
        }
    }

    let sort = |v: &mut Vec<FileEntry>| v.sort_by(|a, b| a.path.cmp(&b.path));
    sort(&mut staged);
    sort(&mut unstaged);
    sort(&mut conflicts);

    Ok(StatusData {
        staged,
        unstaged,
        conflicts,
    })
}

// ---------------------------------------------------------------- branches

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub full: String,
    pub kind: String, // local | remote
    pub hash: String,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub gone: bool,
    pub is_head: bool,
    pub committed_at: i64,
    pub subject: String,
    pub worktree_path: Option<String>,
}

fn parse_track(track: &str) -> (u32, u32, bool) {
    // 例: "[ahead 2, behind 1]" / "[gone]" / ""
    let t = track.trim().trim_start_matches('[').trim_end_matches(']');
    if t.is_empty() {
        return (0, 0, false);
    }
    if t.contains("gone") {
        return (0, 0, true);
    }
    let mut ahead = 0;
    let mut behind = 0;
    for part in t.split(',') {
        let p = part.trim();
        if let Some(n) = p.strip_prefix("ahead ") {
            ahead = n.trim().parse().unwrap_or(0);
        } else if let Some(n) = p.strip_prefix("behind ") {
            behind = n.trim().parse().unwrap_or(0);
        }
    }
    (ahead, behind, false)
}

pub fn branches(dir: &str) -> Result<Vec<BranchInfo>, String> {
    let fmt = format!(
        "--format=%(refname){F}%(refname:short){F}%(objectname){F}%(upstream:short){F}%(upstream:track){F}%(HEAD){F}%(committerdate:unix){F}%(worktreepath){F}%(contents:subject)",
        F = "%1f"
    );
    let raw = sh::git(dir, &["for-each-ref", &fmt, "refs/heads", "refs/remotes"])?;
    let mut out = vec![];
    for line in raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let f: Vec<&str> = line.split(FS).collect();
        if f.len() < 9 {
            continue;
        }
        let full = f[0].to_string();
        let name = f[1].to_string();
        // refs/remotes/origin/HEAD は refname:short が "origin" に縮むので full で弾く
        if full.ends_with("/HEAD") {
            continue;
        }
        let kind = if full.starts_with("refs/heads/") {
            "local"
        } else {
            "remote"
        };
        let (ahead, behind, gone) = parse_track(f[4]);
        out.push(BranchInfo {
            name,
            full,
            kind: kind.to_string(),
            hash: f[2].to_string(),
            upstream: Some(f[3].to_string()).filter(|s| !s.is_empty()),
            ahead,
            behind,
            gone,
            is_head: f[5].trim() == "*",
            committed_at: f[6].trim().parse().unwrap_or(0),
            worktree_path: Some(f[7].to_string()).filter(|s| !s.is_empty()),
            subject: f[8].to_string(),
        });
    }
    out.sort_by(|a, b| b.committed_at.cmp(&a.committed_at));
    Ok(out)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    pub hash: String,
    pub committed_at: i64,
}

pub fn tags(dir: &str) -> Result<Vec<TagInfo>, String> {
    let fmt = format!(
        "--format=%(refname:short){F}%(objectname){F}%(creatordate:unix)",
        F = "%1f"
    );
    let raw = sh::git(dir, &["for-each-ref", &fmt, "refs/tags"])?;
    let mut out = vec![];
    for line in raw.lines() {
        let f: Vec<&str> = line.split(FS).collect();
        if f.len() < 3 {
            continue;
        }
        out.push(TagInfo {
            name: f[0].to_string(),
            hash: f[1].to_string(),
            committed_at: f[2].trim().parse().unwrap_or(0),
        });
    }
    out.sort_by(|a, b| b.committed_at.cmp(&a.committed_at));
    Ok(out)
}

// ---------------------------------------------------------------- stash

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StashInfo {
    pub index: usize,
    pub name: String,
    pub hash: String,
    pub message: String,
    pub created_at: i64,
}

pub fn stash_list(dir: &str) -> Result<Vec<StashInfo>, String> {
    let raw = sh::git(dir, &["stash", "list", "--format=%gd%x1f%H%x1f%gs%x1f%at"])?;
    let mut out = vec![];
    for (i, line) in raw.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let f: Vec<&str> = line.split(FS).collect();
        if f.len() < 4 {
            continue;
        }
        out.push(StashInfo {
            index: i,
            name: f[0].to_string(),
            hash: f[1].to_string(),
            message: f[2].to_string(),
            created_at: f[3].trim().parse().unwrap_or(0),
        });
    }
    Ok(out)
}

// ---------------------------------------------------------------- worktree

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
    pub bare: bool,
    pub detached: bool,
    pub locked: bool,
    pub prunable: bool,
    pub is_main: bool,
    pub is_current: bool,
}

pub fn worktree_list(dir: &str) -> Result<Vec<WorktreeInfo>, String> {
    let raw = sh::git(dir, &["worktree", "list", "--porcelain"])?;
    let current = sh::git(dir, &["rev-parse", "--show-toplevel"])
        .unwrap_or_default()
        .trim()
        .to_string();
    let mut out: Vec<WorktreeInfo> = vec![];
    for block in raw.split("\n\n") {
        if block.trim().is_empty() {
            continue;
        }
        let mut wt = WorktreeInfo {
            path: String::new(),
            head: String::new(),
            branch: None,
            bare: false,
            detached: false,
            locked: false,
            prunable: false,
            is_main: false,
            is_current: false,
        };
        for line in block.lines() {
            let line = line.trim();
            if let Some(v) = line.strip_prefix("worktree ") {
                wt.path = v.to_string();
            } else if let Some(v) = line.strip_prefix("HEAD ") {
                wt.head = v.to_string();
            } else if let Some(v) = line.strip_prefix("branch ") {
                wt.branch = Some(v.trim_start_matches("refs/heads/").to_string());
            } else if line == "bare" {
                wt.bare = true;
            } else if line == "detached" {
                wt.detached = true;
            } else if line.starts_with("locked") {
                wt.locked = true;
            } else if line.starts_with("prunable") {
                wt.prunable = true;
            }
        }
        if wt.path.is_empty() {
            continue;
        }
        wt.is_current = wt.path == current;
        out.push(wt);
    }
    if let Some(first) = out.first_mut() {
        first.is_main = true;
    }
    Ok(out)
}

// ---------------------------------------------------------------- diff

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffFile {
    pub path: String,
    pub orig_path: Option<String>,
    pub status: String, // A M D R C T
    pub additions: i64,
    pub deletions: i64,
    pub binary: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub hash: String,
    pub short: String,
    pub subject: String,
    pub body: String,
    pub author_name: String,
    pub author_email: String,
    pub author_at: i64,
    pub committer_name: String,
    pub committer_at: i64,
    pub parents: Vec<String>,
    pub refs: Vec<String>,
    pub files: Vec<DiffFile>,
}

/// name-status -z / numstat -z をまとめてファイル一覧にする
fn parse_files(name_status: &str, numstat: &str) -> Vec<DiffFile> {
    let mut files: Vec<DiffFile> = vec![];

    let ns: Vec<&str> = name_status.split('\0').filter(|s| !s.is_empty()).collect();
    let mut i = 0;
    while i < ns.len() {
        let st = ns[i];
        let code = st.chars().next().unwrap_or('M');
        if code == 'R' || code == 'C' {
            if i + 2 < ns.len() {
                files.push(DiffFile {
                    path: ns[i + 2].to_string(),
                    orig_path: Some(ns[i + 1].to_string()),
                    status: code.to_string(),
                    additions: 0,
                    deletions: 0,
                    binary: false,
                });
            }
            i += 3;
        } else {
            if i + 1 < ns.len() {
                files.push(DiffFile {
                    path: ns[i + 1].to_string(),
                    orig_path: None,
                    status: code.to_string(),
                    additions: 0,
                    deletions: 0,
                    binary: false,
                });
            }
            i += 2;
        }
    }

    let nums: Vec<&str> = numstat.split('\0').collect();
    let mut j = 0;
    while j < nums.len() {
        let tok = nums[j];
        if tok.trim().is_empty() {
            j += 1;
            continue;
        }
        let parts: Vec<&str> = tok.split('\t').collect();
        if parts.len() < 2 {
            j += 1;
            continue;
        }
        let a = parts[0];
        let d = parts[1];
        let path: String;
        if parts.len() >= 3 && !parts[2].is_empty() {
            path = parts[2].to_string();
            j += 1;
        } else {
            // rename: adds\tdels\t\0old\0new\0
            if j + 2 < nums.len() {
                path = nums[j + 2].to_string();
            } else {
                break;
            }
            j += 3;
        }
        let binary = a == "-" || d == "-";
        if let Some(f) = files.iter_mut().find(|f| f.path == path) {
            f.additions = a.parse().unwrap_or(0);
            f.deletions = d.parse().unwrap_or(0);
            f.binary = binary;
        }
    }

    files
}

pub fn commit_detail(dir: &str, sha: &str) -> Result<CommitDetail, String> {
    let fmt = "--format=%H%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ct%x1f%P%x1f%D";
    let meta = sh::git(dir, &["show", "--no-patch", fmt, sha])?;
    let f: Vec<&str> = meta.trim_end_matches('\n').split(FS).collect();
    if f.len() < 10 {
        return Err(format!("コミット情報を解析できません: {sha}"));
    }
    let name_status = sh::git(
        dir,
        &[
            "show",
            "--format=",
            "-M",
            "--name-status",
            "-z",
            "--first-parent",
            sha,
        ],
    )
    .unwrap_or_default();
    let numstat = sh::git(
        dir,
        &[
            "show",
            "--format=",
            "-M",
            "--numstat",
            "-z",
            "--first-parent",
            sha,
        ],
    )
    .unwrap_or_default();

    Ok(CommitDetail {
        hash: f[0].to_string(),
        short: f[0].chars().take(7).collect(),
        subject: f[1].to_string(),
        body: f[2].trim_end().to_string(),
        author_name: f[3].to_string(),
        author_email: f[4].to_string(),
        author_at: f[5].trim().parse().unwrap_or(0),
        committer_name: f[6].to_string(),
        committer_at: f[7].trim().parse().unwrap_or(0),
        parents: f[8].split_whitespace().map(|s| s.to_string()).collect(),
        refs: f[9]
            .split(", ")
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        files: parse_files(&name_status, &numstat),
    })
}

pub fn wip_files(dir: &str, staged: bool) -> Result<Vec<DiffFile>, String> {
    let mut args: Vec<String> = vec!["diff".into(), "-M".into()];
    if staged {
        args.push("--cached".into());
    }
    let mut a1 = args.clone();
    a1.extend(["--name-status".to_string(), "-z".to_string()]);
    let mut a2 = args.clone();
    a2.extend(["--numstat".to_string(), "-z".to_string()]);
    let ns = sh::git(dir, &a1).unwrap_or_default();
    let num = sh::git(dir, &a2).unwrap_or_default();
    Ok(parse_files(&ns, &num))
}

/// kind: commit | staged | unstaged | untracked | stash
pub fn diff_text(
    dir: &str,
    kind: &str,
    path: &str,
    sha: Option<String>,
    context: u32,
) -> Result<String, String> {
    let ctx = format!("-U{}", context);
    let out = match kind {
        "commit" => {
            let sha = sha.ok_or("コミットハッシュが必要です")?;
            sh::exec(
                dir,
                "git",
                &[
                    "show".to_string(),
                    "--format=".to_string(),
                    "-M".to_string(),
                    ctx,
                    "--first-parent".to_string(),
                    sha,
                    "--".to_string(),
                    path.to_string(),
                ],
            )?
        }
        "staged" => sh::exec(
            dir,
            "git",
            &[
                "diff".to_string(),
                "--cached".to_string(),
                "-M".to_string(),
                ctx,
                "--".to_string(),
                path.to_string(),
            ],
        )?,
        "unstaged" => sh::exec(
            dir,
            "git",
            &[
                "diff".to_string(),
                "-M".to_string(),
                ctx,
                "--".to_string(),
                path.to_string(),
            ],
        )?,
        "untracked" => sh::exec(
            dir,
            "git",
            &[
                "diff".to_string(),
                "--no-index".to_string(),
                ctx,
                "--".to_string(),
                "/dev/null".to_string(),
                path.to_string(),
            ],
        )?,
        "stash" => {
            // `git stash show` はパス指定を受け付けないので、元のコミット (^1) との差分を取る。
            // 追跡中のファイルは stash 本体、未追跡のファイルは第三親 (^3) に入っている。
            let sha = sha.ok_or("stash の参照が必要です")?;
            let diff = |to: String| {
                sh::exec(
                    dir,
                    "git",
                    &[
                        "diff".to_string(),
                        "-M".to_string(),
                        ctx.clone(),
                        format!("{sha}^1"),
                        to,
                        "--".to_string(),
                        path.to_string(),
                    ],
                )
            };
            let tracked = diff(sha.clone())?;
            if tracked.ok() && tracked.stdout.trim().is_empty() {
                match diff(format!("{sha}^3")) {
                    Ok(o) if o.ok() => o,
                    _ => tracked,
                }
            } else {
                tracked
            }
        }
        _ => return Err(format!("未知の diff 種別: {kind}")),
    };
    // --no-index は差分があると exit code 1 を返すので許容する
    if out.ok() || out.code == 1 {
        Ok(out.stdout)
    } else {
        Err(out.message())
    }
}

pub fn stash_files(dir: &str, refname: &str) -> Result<Vec<DiffFile>, String> {
    let ns = sh::git(
        dir,
        &[
            "stash",
            "show",
            "--include-untracked",
            "--name-status",
            "-z",
            "-M",
            refname,
        ],
    )
    .unwrap_or_default();
    let num = sh::git(
        dir,
        &[
            "stash",
            "show",
            "--include-untracked",
            "--numstat",
            "-z",
            "-M",
            refname,
        ],
    )
    .unwrap_or_default();
    Ok(parse_files(&ns, &num))
}
