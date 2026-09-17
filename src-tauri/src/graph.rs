use serde::Serialize;
use std::collections::HashMap;

use crate::sh;

const FS: char = '\u{1f}'; // field separator
const RS: char = '\u{1e}'; // record separator

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RefDeco {
    pub kind: String, // head | remote | tag | stash | other
    pub name: String, // 表示名 (main / origin/main / v1.0.0)
    pub full: String, // refs/heads/main
    pub is_head: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphCommit {
    pub hash: String,
    pub short: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub subject: String,
    pub refs: Vec<RefDeco>,
    pub row: usize,
    pub column: usize,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub from_row: usize,
    pub from_col: usize,
    /// グラフ外 (取得件数の外側) に出る親は -1
    pub to_row: i64,
    pub to_col: usize,
    pub color: usize,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphData {
    pub commits: Vec<GraphCommit>,
    pub edges: Vec<GraphEdge>,
    pub max_column: usize,
    pub truncated: bool,
}

fn parse_refs(deco: &str) -> Vec<RefDeco> {
    let mut out = vec![];
    for raw in deco.split(", ") {
        let item = raw.trim();
        if item.is_empty() {
            continue;
        }
        let (is_head, full) = match item.strip_prefix("HEAD -> ") {
            Some(rest) => (true, rest.trim().to_string()),
            None => (item == "HEAD", item.to_string()),
        };
        // `--decorate=full` の %D はタグを "tag: refs/tags/x" の形で出すので前置きを落とす
        let full = match full.strip_prefix("tag: ") {
            Some(rest) => rest.trim().to_string(),
            None => full,
        };
        if full == "HEAD" {
            out.push(RefDeco {
                kind: "other".into(),
                name: "HEAD".into(),
                full: "HEAD".into(),
                is_head: true,
            });
            continue;
        }
        let (kind, name) = if let Some(n) = full.strip_prefix("refs/heads/") {
            ("head", n.to_string())
        } else if let Some(n) = full.strip_prefix("refs/remotes/") {
            ("remote", n.to_string())
        } else if let Some(n) = full.strip_prefix("refs/tags/") {
            ("tag", n.to_string())
        } else if full.starts_with("refs/stash") {
            ("stash", "stash".to_string())
        } else {
            ("other", full.trim_start_matches("refs/").to_string())
        };
        // 注釈付きタグの ^{} は落とす
        let name = name.trim_end_matches("^{}").to_string();
        out.push(RefDeco {
            kind: kind.into(),
            name,
            full,
            is_head,
        });
    }
    // HEAD -> main のとき "main" と "HEAD" が重複しないように並べ替え (branch を先に)
    out.sort_by_key(|r| match r.kind.as_str() {
        "head" => 0,
        "remote" => 1,
        "tag" => 2,
        _ => 3,
    });
    out
}

/// git log を読み、レーン (column) を割り当てたグラフデータを返す
pub fn load(dir: &str, limit: usize) -> Result<GraphData, String> {
    let format = format!(
        "--format=%H{FS}%P{FS}%an{FS}%ae{FS}%at{FS}%D{FS}%s{RS}",
        FS = FS,
        RS = RS
    );
    let args = vec![
        "log".to_string(),
        "--all".to_string(),
        "--date-order".to_string(),
        "--decorate=full".to_string(),
        format!("--max-count={}", limit + 1),
        format,
    ];
    let raw = sh::git(dir, &args)?;

    let mut commits: Vec<GraphCommit> = vec![];
    for rec in raw.split(RS) {
        let rec = rec.trim_start_matches('\n').trim_start_matches('\r');
        if rec.trim().is_empty() {
            continue;
        }
        let f: Vec<&str> = rec.split(FS).collect();
        if f.len() < 7 {
            continue;
        }
        let hash = f[0].trim().to_string();
        if hash.is_empty() {
            continue;
        }
        let parents: Vec<String> = f[1]
            .split_whitespace()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .collect();
        commits.push(GraphCommit {
            short: hash.chars().take(7).collect(),
            hash,
            parents,
            author_name: f[2].to_string(),
            author_email: f[3].to_string(),
            timestamp: f[4].trim().parse::<i64>().unwrap_or(0),
            refs: parse_refs(f[5]),
            subject: f[6].to_string(),
            row: 0,
            column: 0,
        });
    }

    let truncated = commits.len() > limit;
    commits.truncate(limit);

    // --- レーン割り当て ---
    // lanes[i] = そのレーンが次に描画を待っているコミットハッシュ
    let mut lanes: Vec<Option<String>> = vec![];
    let mut max_column = 0usize;

    for row in 0..commits.len() {
        let hash = commits[row].hash.clone();
        let parents = commits[row].parents.clone();

        let column = match lanes.iter().position(|l| l.as_deref() == Some(hash.as_str())) {
            Some(i) => i,
            None => match lanes.iter().position(|l| l.is_none()) {
                Some(i) => i,
                None => {
                    lanes.push(None);
                    lanes.len() - 1
                }
            },
        };

        // 同じコミットを待っていた他レーンは解放 (複数の子がいるケース)
        for l in lanes.iter_mut() {
            if l.as_deref() == Some(hash.as_str()) {
                *l = None;
            }
        }

        // 第一親は自分のレーンをそのまま引き継ぐ
        if let Some(p0) = parents.first() {
            let already = lanes.iter().any(|l| l.as_deref() == Some(p0.as_str()));
            if already {
                // 親が既に左のレーンで待っている = ここで枝が閉じる
                if column < lanes.len() {
                    lanes[column] = None;
                }
            } else {
                if column >= lanes.len() {
                    lanes.resize(column + 1, None);
                }
                lanes[column] = Some(p0.clone());
            }
        } else if column < lanes.len() {
            lanes[column] = None;
        }

        // 第二親以降 (マージ) は右側の空きレーンに置く
        for p in parents.iter().skip(1) {
            if lanes.iter().any(|l| l.as_deref() == Some(p.as_str())) {
                continue;
            }
            let idx = lanes
                .iter()
                .enumerate()
                .skip(column + 1)
                .find(|(_, l)| l.is_none())
                .map(|(i, _)| i);
            match idx {
                Some(i) => lanes[i] = Some(p.clone()),
                None => lanes.push(Some(p.clone())),
            }
        }

        while matches!(lanes.last(), Some(None)) {
            lanes.pop();
        }

        commits[row].row = row;
        commits[row].column = column;
        max_column = max_column.max(column);
        max_column = max_column.max(lanes.len().saturating_sub(1));
    }

    // --- エッジ生成 ---
    let pos: HashMap<&str, (usize, usize)> = commits
        .iter()
        .map(|c| (c.hash.as_str(), (c.row, c.column)))
        .collect();

    let mut edges: Vec<GraphEdge> = vec![];
    for c in &commits {
        for (i, p) in c.parents.iter().enumerate() {
            match pos.get(p.as_str()) {
                Some((prow, pcol)) => edges.push(GraphEdge {
                    from_row: c.row,
                    from_col: c.column,
                    to_row: *prow as i64,
                    to_col: *pcol,
                    // 第一親への線は自分のレーン色、マージ線は取り込み元の色
                    color: if i == 0 { c.column } else { *pcol },
                }),
                None => edges.push(GraphEdge {
                    from_row: c.row,
                    from_col: c.column,
                    to_row: -1,
                    to_col: c.column,
                    color: c.column,
                }),
            }
        }
    }

    Ok(GraphData {
        commits,
        edges,
        max_column,
        truncated,
    })
}
