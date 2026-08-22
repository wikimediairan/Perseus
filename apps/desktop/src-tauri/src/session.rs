//! Secure storage for the Perseus Backend session token, backed by the
//! OS credential store via the `keyring` crate (macOS Keychain / Windows
//! Credential Manager / Linux Secret Service). This replaces the old
//! model where the "Wikimedia" provider's API key lived in the plaintext
//! `perseus.config.json` file (see services/ConfigLoader.ts on the
//! frontend) -- a session token must never be written there.
//!
//! No cryptography is implemented here; `keyring` delegates entirely to
//! the platform's own secure storage.

use keyring::Entry;

const SERVICE: &str = "com.perseus.desktop";
const ACCOUNT: &str = "wikimedia-session";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn store_session_token(token: String) -> Result<(), String> {
    entry()?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_session_token() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn clear_session_token() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
