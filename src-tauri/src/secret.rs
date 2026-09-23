//! macOS のキーチェーンに置く秘密情報 (AI の API キー)。
//! WebView の localStorage には残さず、使うときだけ取り出す。

use keyring::{Entry, Error};

const SERVICE: &str = "dev.gitgraph.app";
const AI_KEY_ACCOUNT: &str = "anthropic-api-key";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, AI_KEY_ACCOUNT).map_err(|e| format!("キーチェーンを開けません: {e}"))
}

/// 未登録なら None
pub fn get_ai_key() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(v) => Ok(Some(v).filter(|v| !v.is_empty())),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("キーチェーンから読み込めません: {e}")),
    }
}

pub fn set_ai_key(key: &str) -> Result<(), String> {
    entry()?
        .set_password(key)
        .map_err(|e| format!("キーチェーンに保存できません: {e}"))
}

/// 未登録でもエラーにしない
pub fn delete_ai_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("キーチェーンから削除できません: {e}")),
    }
}
