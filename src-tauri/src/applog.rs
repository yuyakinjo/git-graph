//! 実行した外部コマンド (git / gh / claude など) の履歴。
//! デバッグ用にメモリ上へ直近のぶんだけ残し、ログ画面からまとめてコピーできるようにする。

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// 保持する件数。定期的な status 取得などで流れていくので、ある程度は多めに持つ。
const MAX_ENTRIES: usize = 500;
/// stdout / stderr はこの文字数で切る (graph の出力などは丸ごと持つと重い)
const MAX_TEXT: usize = 2000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CmdLog {
    /// 開始時刻 (UNIX エポックからのミリ秒)
    pub time: u64,
    pub cwd: String,
    pub program: String,
    pub args: Vec<String>,
    /// 終了コード。起動できなかったときは -1
    pub code: i32,
    pub duration_ms: u64,
    pub stdout: String,
    pub stderr: String,
}

static LOGS: Mutex<VecDeque<CmdLog>> = Mutex::new(VecDeque::new());

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn truncate(s: &str) -> String {
    let s = s.trim();
    match s.char_indices().nth(MAX_TEXT) {
        Some((i, _)) => format!("{}… ({} bytes)", &s[..i], s.len()),
        None => s.to_string(),
    }
}

pub fn record(mut entry: CmdLog) {
    entry.stdout = truncate(&entry.stdout);
    entry.stderr = truncate(&entry.stderr);
    if entry.code == 0 {
        log::info!(
            "[{}ms] {} {} (cwd: {})",
            entry.duration_ms,
            entry.program,
            entry.args.join(" "),
            entry.cwd
        );
    } else {
        log::warn!(
            "[{}ms] {} {} (cwd: {}) exited {}: {}",
            entry.duration_ms,
            entry.program,
            entry.args.join(" "),
            entry.cwd,
            entry.code,
            entry.stderr
        );
    }
    let Ok(mut logs) = LOGS.lock() else { return };
    if logs.len() >= MAX_ENTRIES {
        logs.pop_front();
    }
    logs.push_back(entry);
}

pub fn snapshot() -> Vec<CmdLog> {
    LOGS.lock().map(|l| l.iter().cloned().collect()).unwrap_or_default()
}

pub fn clear() {
    if let Ok(mut logs) = LOGS.lock() {
        logs.clear();
    }
}
