//! コミット作者 → GitHub アバター URL の解決とキャッシュ。
//!
//! メールアドレスから GitHub ユーザーを引くのに gh CLI を使うが、これは遅く
//! API レート制限もあるので、結果は 2 段構えでキャッシュする。
//!   1. プロセス内の HashMap (同一セッション中は gh を一切叩かない)
//!   2. アプリのキャッシュディレクトリ配下の avatars.json (再起動しても残る)
//!
//! さらに `1234+login@users.noreply.github.com` 形式のメールは URL を機械的に
//! 導出できるので、そもそも gh を呼ばない。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::i18n::Msg;
use crate::sh;

/// 解決できた URL を信用する期間 (30 日)
const TTL_HIT: u64 = 60 * 60 * 24 * 30;
/// 解決できなかったメールを再挑戦するまでの期間 (1 日)。
/// 未 push のコミットは後から解決できるようになるため、失敗は長く持たない。
const TTL_MISS: u64 = 60 * 60 * 24;
/// GraphQL 1 リクエストで問い合わせるコミット数
const CHUNK: usize = 50;
const AVATAR_SIZE: u32 = 64;

/// フロントから渡される「このメールの持ち主を、このコミットを手掛かりに調べて」の組
#[derive(Deserialize, Clone, Debug)]
pub struct AvatarQuery {
    pub email: String,
    /// 解決の手掛かりにするコミット SHA (GitHub 側が email → user を紐付けている)
    pub sha: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Entry {
    /// None = GitHub ユーザーが見つからなかった (ネガティブキャッシュ)
    url: Option<String>,
    login: Option<String>,
    fetched_at: u64,
}

impl Entry {
    fn fresh(&self, now: u64) -> bool {
        let ttl = if self.url.is_some() {
            TTL_HIT
        } else {
            TTL_MISS
        };
        now.saturating_sub(self.fetched_at) < ttl
    }
}

#[derive(Serialize, Deserialize, Default)]
struct CacheFile {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    entries: HashMap<String, Entry>,
}

struct Cache {
    entries: HashMap<String, Entry>,
    loaded_from: Option<PathBuf>,
    dirty: bool,
}

fn cache() -> &'static Mutex<Cache> {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    CACHE.get_or_init(|| {
        Mutex::new(Cache {
            entries: HashMap::new(),
            loaded_from: None,
            dirty: false,
        })
    })
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn norm(email: &str) -> String {
    email.trim().to_lowercase()
}

/// ディスクのキャッシュを (まだなら) 読み込む
fn ensure_loaded(c: &mut Cache, path: &Path) {
    if c.loaded_from.as_deref() == Some(path) {
        return;
    }
    if let Ok(text) = std::fs::read_to_string(path) {
        if let Ok(file) = serde_json::from_str::<CacheFile>(&text) {
            for (k, v) in file.entries {
                c.entries.entry(k).or_insert(v);
            }
        }
    }
    c.loaded_from = Some(path.to_path_buf());
}

fn save(c: &mut Cache, path: &Path) {
    if !c.dirty {
        return;
    }
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let file = CacheFile {
        version: 1,
        entries: c.entries.clone(),
    };
    if let Ok(text) = serde_json::to_string(&file) {
        if std::fs::write(path, text).is_ok() {
            c.dirty = false;
        }
    }
}

/// `1234+login@users.noreply.github.com` / `login@users.noreply.github.com`
/// から gh を呼ばずに URL を組み立てる。
fn from_noreply(email: &str) -> Option<Entry> {
    let (local, domain) = email.split_once('@')?;
    if domain != "users.noreply.github.com" {
        return None;
    }
    let (id, login) = match local.split_once('+') {
        Some((id, login)) if id.chars().all(|ch| ch.is_ascii_digit()) && !id.is_empty() => {
            (Some(id), login)
        }
        _ => (None, local),
    };
    if login.is_empty() {
        return None;
    }
    let url = match id {
        Some(id) => format!("https://avatars.githubusercontent.com/u/{id}?s={AVATAR_SIZE}&v=4"),
        None => format!("https://github.com/{login}.png?size={AVATAR_SIZE}"),
    };
    Some(Entry {
        url: Some(url),
        login: Some(login.to_string()),
        fetched_at: now(),
    })
}

/// GitHub リポジトリでなかった / gh が使えなかったディレクトリ。
/// 起動中はもう問い合わせない (再起動すればまた試す)。
fn skipped_dirs() -> &'static Mutex<std::collections::HashSet<String>> {
    static SKIPPED: OnceLock<Mutex<std::collections::HashSet<String>>> = OnceLock::new();
    SKIPPED.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

/// owner/name を取り出す
fn name_with_owner(dir: &str) -> Result<(String, String), String> {
    let raw = sh::gh(dir, &["repo", "view", "--json", "nameWithOwner"])?;
    let v: Value =
        serde_json::from_str(&raw).map_err(|e| Msg::GhParseFailed { err: e.to_string() }.text())?;
    let full = v["nameWithOwner"]
        .as_str()
        .ok_or_else(|| Msg::NotGithubRepo.text())?;
    let (owner, name) = full
        .split_once('/')
        .ok_or_else(|| Msg::InvalidRepoName.text())?;
    Ok((owner.to_string(), name.to_string()))
}

/// 解決結果 1 件ぶん: (アバター URL, GitHub ログイン名)
type Resolved = (Option<String>, Option<String>);

/// コミット SHA を手掛かりに、まとめて author → avatarUrl を引く。
/// 返すのは alias 順 (= 渡した順)。要素が None なら「そのコミットが GitHub 側に無い」。
fn resolve_chunk(
    dir: &str,
    owner: &str,
    name: &str,
    items: &[(String, String)], // (email, sha)
) -> Result<Vec<Option<Resolved>>, String> {
    let mut q = format!("query{{repository(owner:\"{owner}\",name:\"{name}\"){{");
    for (i, (_, sha)) in items.iter().enumerate() {
        q.push_str(&format!(
            "c{i}:object(oid:\"{sha}\"){{... on Commit{{author{{email avatarUrl(size:{AVATAR_SIZE}) user{{login avatarUrl(size:{AVATAR_SIZE})}}}}}}}}"
        ));
    }
    q.push_str("}}");

    let raw = sh::gh(dir, &["api", "graphql", "-f", &format!("query={q}")])?;
    let v: Value =
        serde_json::from_str(&raw).map_err(|e| Msg::GhParseFailed { err: e.to_string() }.text())?;
    let repo = &v["data"]["repository"];

    let mut out = Vec::with_capacity(items.len());
    for i in 0..items.len() {
        let author = &repo[format!("c{i}")]["author"];
        if author.is_null() {
            out.push(None);
            continue;
        }
        let login = author["user"]["login"].as_str().map(|s| s.to_string());
        // GitHub アカウントに紐付いていれば本人のアバター、そうでなければ
        // GitHub が commit 一覧で出すのと同じ (gravatar / identicon) を使う。
        let url = author["user"]["avatarUrl"]
            .as_str()
            .or_else(|| author["avatarUrl"].as_str())
            .map(|s| s.to_string());
        out.push(Some((url, login)));
    }
    Ok(out)
}

/// メールアドレス → アバター URL (解決できなければ null)。
pub fn resolve(
    dir: &str,
    cache_path: &Path,
    queries: Vec<AvatarQuery>,
) -> Result<HashMap<String, Option<String>>, String> {
    let ts = now();
    let mut result: HashMap<String, Option<String>> = HashMap::new();
    // gh に聞く必要があるものだけを (email, sha) で集める。同じメールは 1 件に畳む。
    let mut todo: Vec<(String, String)> = Vec::new();

    {
        let mut c = cache().lock().map_err(|_| Msg::CacheLockFailed.text())?;
        ensure_loaded(&mut c, cache_path);
        for q in &queries {
            let email = norm(&q.email);
            if email.is_empty() || result.contains_key(&email) {
                continue;
            }
            if let Some(e) = c.entries.get(&email) {
                if e.fresh(ts) {
                    result.insert(email, e.url.clone());
                    continue;
                }
            }
            if let Some(e) = from_noreply(&email) {
                result.insert(email.clone(), e.url.clone());
                c.entries.insert(email, e);
                c.dirty = true;
                continue;
            }
            if !q.sha.is_empty() && todo.iter().all(|(m, _)| m != &email) {
                todo.push((email, q.sha.clone()));
            }
        }
        save(&mut c, cache_path);
    }

    if todo.is_empty() {
        return Ok(result);
    }

    if let Ok(skipped) = skipped_dirs().lock() {
        if skipped.contains(dir) {
            return Ok(result);
        }
    }

    let (owner, name) = match name_with_owner(dir) {
        Ok(v) => v,
        Err(e) => {
            if let Ok(mut skipped) = skipped_dirs().lock() {
                skipped.insert(dir.to_string());
            }
            return Err(e);
        }
    };
    let mut resolved: Vec<(String, Entry)> = Vec::new();
    for chunk in todo.chunks(CHUNK) {
        let found = resolve_chunk(dir, &owner, &name, chunk)?;
        for ((email, _), got) in chunk.iter().zip(found) {
            let (url, login) = got.unwrap_or((None, None));
            resolved.push((
                email.clone(),
                Entry {
                    url,
                    login,
                    fetched_at: ts,
                },
            ));
        }
    }

    let mut c = cache().lock().map_err(|_| Msg::CacheLockFailed.text())?;
    for (email, entry) in resolved {
        result.insert(email.clone(), entry.url.clone());
        c.entries.insert(email, entry);
        c.dirty = true;
    }
    save(&mut c, cache_path);
    Ok(result)
}

/// キャッシュを捨てる (設定画面から呼ぶ用)
pub fn clear(cache_path: &Path) -> Result<(), String> {
    let mut c = cache().lock().map_err(|_| Msg::CacheLockFailed.text())?;
    c.entries.clear();
    c.loaded_from = Some(cache_path.to_path_buf());
    c.dirty = false;
    if cache_path.exists() {
        std::fs::remove_file(cache_path)
            .map_err(|e| Msg::CacheDeleteFailed { err: e.to_string() }.text())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noreply_patterns() {
        let e = from_noreply("49699333+dependabot[bot]@users.noreply.github.com").unwrap();
        assert_eq!(
            e.url.as_deref(),
            Some("https://avatars.githubusercontent.com/u/49699333?s=64&v=4")
        );
        let e = from_noreply("kinjo@users.noreply.github.com").unwrap();
        assert_eq!(
            e.url.as_deref(),
            Some("https://github.com/kinjo.png?size=64")
        );
        assert!(from_noreply("someone@example.com").is_none());
    }

    /// 実際に gh を叩く。GG_TEST_REPO にローカルの GitHub リポジトリを指定した時だけ動く。
    #[test]
    fn live_resolve() {
        let Ok(dir) = std::env::var("GG_TEST_REPO") else {
            return;
        };
        let out = crate::sh::git(&dir, &["log", "-20", "--format=%H%x09%ae"]).unwrap();
        let queries: Vec<AvatarQuery> = out
            .lines()
            .filter_map(|l| l.split_once('\t'))
            .map(|(sha, email)| AvatarQuery {
                email: email.to_string(),
                sha: sha.to_string(),
            })
            .collect();
        let path = std::env::temp_dir().join("gg-avatar-test.json");
        let _ = std::fs::remove_file(&path);
        let t0 = std::time::Instant::now();
        let res = resolve(&dir, &path, queries.clone()).unwrap();
        let cold = t0.elapsed();
        assert!(!res.is_empty());
        for (email, url) in &res {
            println!("{email} -> {url:?}");
        }
        // 2 回目はキャッシュだけで返ること
        let t1 = std::time::Instant::now();
        let again = resolve(&dir, &path, queries).unwrap();
        println!("cold={cold:?} warm={:?}", t1.elapsed());
        assert_eq!(res, again);
        assert!(t1.elapsed().as_millis() < 50, "キャッシュが効いていない");
        assert!(path.exists(), "キャッシュファイルが作られていない");
    }
}
