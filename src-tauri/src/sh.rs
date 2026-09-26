use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Instant;

use crate::applog;
use crate::i18n::Msg;

/// GUI プロセスは PATH が最小限になりがちなので、よくあるインストール先を足しておく。
/// (gh / git を Homebrew や asdf 経由で入れているケースを救う)
fn patched_path() -> String {
    let extra = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ];
    let current = std::env::var("PATH").unwrap_or_default();
    let mut parts: Vec<String> = current.split(':').map(|s| s.to_string()).collect();
    for e in extra {
        if !parts.iter().any(|p| p == e) {
            parts.push(e.to_string());
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        parts.push(format!("{home}/.local/bin"));
        // Claude Code の旧来のローカルインストール先
        parts.push(format!("{home}/.claude/local"));
    }
    parts.join(":")
}

pub struct Out {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

impl Out {
    pub fn ok(&self) -> bool {
        self.code == 0
    }
    /// エラー表示用に stderr / stdout をまとめる
    pub fn message(&self) -> String {
        let mut s = String::new();
        if !self.stderr.trim().is_empty() {
            s.push_str(self.stderr.trim());
        }
        if !self.stdout.trim().is_empty() {
            if !s.is_empty() {
                s.push('\n');
            }
            s.push_str(self.stdout.trim());
        }
        if s.is_empty() {
            s = Msg::CommandExited { code: self.code }.text();
        }
        s
    }
}

pub fn exec<S: AsRef<str>>(cwd: &str, program: &str, args: &[S]) -> Result<Out, String> {
    exec_with_stdin(cwd, program, args, None)
}

/// stdin に文字列を流し込んで実行する (引数に載せきれない大きな入力用)。
/// 実行結果はデバッグ用のログ (applog) にも残す。
pub fn exec_with_stdin<S: AsRef<str>>(
    cwd: &str,
    program: &str,
    args: &[S],
    stdin: Option<&str>,
) -> Result<Out, String> {
    exec_env(cwd, program, args, stdin, &[])
}

/// 環境変数を足して実行する (一時 index を使う `GIT_INDEX_FILE` など)
pub fn exec_env<S: AsRef<str>>(
    cwd: &str,
    program: &str,
    args: &[S],
    stdin: Option<&str>,
    env: &[(&str, &str)],
) -> Result<Out, String> {
    let time = applog::now_ms();
    let started = Instant::now();
    let res = spawn(cwd, program, args, stdin, env);
    let (code, stdout, stderr) = match &res {
        Ok(out) => (out.code, out.stdout.clone(), out.stderr.clone()),
        Err(e) => (-1, String::new(), e.clone()),
    };
    applog::record(applog::CmdLog {
        time,
        cwd: cwd.to_string(),
        program: program.to_string(),
        args: args.iter().map(|a| a.as_ref().to_string()).collect(),
        code,
        duration_ms: started.elapsed().as_millis() as u64,
        stdout,
        stderr,
    });
    res
}

fn spawn<S: AsRef<str>>(
    cwd: &str,
    program: &str,
    args: &[S],
    stdin: Option<&str>,
    env: &[(&str, &str)],
) -> Result<Out, String> {
    if !cwd.is_empty() && !Path::new(cwd).exists() {
        return Err(Msg::DirNotFound {
            dir: cwd.to_string(),
        }
        .into());
    }
    let mut cmd = Command::new(program);
    for a in args {
        cmd.arg(a.as_ref());
    }
    if !cwd.is_empty() {
        cmd.current_dir(cwd);
    }
    cmd.env("PATH", patched_path());
    // pager / エディタ / 対話プロンプトを完全に無効化する
    cmd.env("GIT_PAGER", "cat");
    cmd.env("PAGER", "cat");
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GIT_OPTIONAL_LOCKS", "0");
    cmd.env("CLICOLOR", "0");
    cmd.env("GH_PAGER", "cat");
    cmd.env("GH_PROMPT_DISABLED", "1");
    cmd.env("NO_COLOR", "1");
    // VSCode のデバッグ用ターミナルから起動するとデバッガ接続用の変数が付き、
    // Bun 製の claude などが同じソケットで inspector を開こうとして落ちるので渡さない
    for var in [
        "BUN_INSPECT",
        "BUN_INSPECT_CONNECT_TO",
        "BUN_INSPECT_NOTIFY",
        "NODE_OPTIONS",
        "VSCODE_INSPECTOR_OPTIONS",
    ] {
        cmd.env_remove(var);
    }
    for (k, v) in env {
        cmd.env(k, v);
    }

    let spawn_err = |e: std::io::Error| match e.kind() {
        std::io::ErrorKind::NotFound => Msg::ProgramNotFound {
            program: program.to_string(),
        }
        .text(),
        _ => Msg::ProgramFailed {
            program: program.to_string(),
            err: e.to_string(),
        }
        .text(),
    };
    let output = match stdin {
        None => cmd.output().map_err(spawn_err)?,
        Some(input) => {
            cmd.stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            let mut child = cmd.spawn().map_err(spawn_err)?;
            // 書き込みは別スレッドで行い、出力が詰まってのデッドロックを避ける
            let mut pipe = child.stdin.take().expect("stdin is piped");
            let input = input.to_string();
            let writer = std::thread::spawn(move || pipe.write_all(input.as_bytes()));
            let output = child.wait_with_output().map_err(spawn_err)?;
            let _ = writer.join();
            output
        }
    };

    Ok(Out {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

/// git を実行し、成功時は stdout を返す
pub fn git<S: AsRef<str>>(cwd: &str, args: &[S]) -> Result<String, String> {
    let out = exec(cwd, "git", args)?;
    if out.ok() {
        Ok(out.stdout)
    } else {
        Err(out.message())
    }
}

/// git を実行し、stdout + stderr をログとして返す (push/pull など進捗が stderr に出るもの)
pub fn git_log<S: AsRef<str>>(cwd: &str, args: &[S]) -> Result<String, String> {
    let out = exec(cwd, "git", args)?;
    if out.ok() {
        let mut s = out.stdout.trim().to_string();
        if !out.stderr.trim().is_empty() {
            if !s.is_empty() {
                s.push('\n');
            }
            s.push_str(out.stderr.trim());
        }
        Ok(s)
    } else {
        Err(out.message())
    }
}

/// gh CLI を実行
pub fn gh<S: AsRef<str>>(cwd: &str, args: &[S]) -> Result<String, String> {
    let out = exec(cwd, "gh", args)?;
    if out.ok() {
        Ok(out.stdout)
    } else {
        Err(out.message())
    }
}
