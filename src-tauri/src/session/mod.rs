use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountSession {
    pub account_id: String,
    pub user_id: String,
    pub username: String,
    pub discriminator: String,
    pub avatar: Option<String>,
    pub status: SessionStatus,
    pub connected_at: Option<DateTime<Utc>>,
    pub last_validated_at: Option<DateTime<Utc>>,
    pub token_last_four: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredAccount {
    pub id: String,
    pub token_encrypted: String,
    pub username: String,
    pub discriminator: String,
    pub user_id: String,
    pub avatar: Option<String>,
    pub added_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
    pub color: String,
}

/// Safe account representation exposed through Tauri commands and events.
/// Authentication material must never cross back into the webview process.
#[derive(Debug, Clone, Serialize)]
pub struct PublicAccount {
    pub id: String,
    pub username: String,
    pub discriminator: String,
    pub user_id: String,
    pub avatar: Option<String>,
    pub added_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
    pub color: String,
}

impl From<&StoredAccount> for PublicAccount {
    fn from(account: &StoredAccount) -> Self {
        Self {
            id: account.id.clone(),
            username: account.username.clone(),
            discriminator: account.discriminator.clone(),
            user_id: account.user_id.clone(),
            avatar: account.avatar.clone(),
            added_at: account.added_at,
            last_used: account.last_used,
            color: account.color.clone(),
        }
    }
}

pub struct SessionManager {
    pub sessions: Arc<Mutex<HashMap<String, AccountSession>>>,
}

fn lock_sessions(
    sessions: &Mutex<HashMap<String, AccountSession>>,
) -> MutexGuard<'_, HashMap<String, AccountSession>> {
    sessions.lock().unwrap_or_else(|poisoned| {
        log::error!("[session] recovering from a poisoned session lock");
        poisoned.into_inner()
    })
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn add_session(&self, session: AccountSession) {
        let mut sessions = lock_sessions(&self.sessions);
        sessions.insert(session.account_id.clone(), session);
    }

    pub fn remove_session(&self, account_id: &str) {
        let mut sessions = lock_sessions(&self.sessions);
        sessions.remove(account_id);
    }

    pub fn get_session(&self, account_id: &str) -> Option<AccountSession> {
        let sessions = lock_sessions(&self.sessions);
        sessions.get(account_id).cloned()
    }

    pub fn update_status(&self, account_id: &str, status: SessionStatus) {
        let mut sessions = lock_sessions(&self.sessions);
        if let Some(session) = sessions.get_mut(account_id) {
            session.status = status;
            if matches!(session.status, SessionStatus::Connected) {
                session.connected_at = Some(Utc::now());
                session.last_validated_at = Some(Utc::now());
            }
        }
    }

    /// Returns true if the session exists and was validated within the last `max_age` seconds.
    /// Use this before making API calls to avoid redundant re-validations.
    pub fn is_recently_validated(&self, account_id: &str, max_age_secs: i64) -> bool {
        let sessions = lock_sessions(&self.sessions);
        if let Some(session) = sessions.get(account_id) {
            if session.status != SessionStatus::Connected {
                return false;
            }
            if let Some(last) = session.last_validated_at {
                let age = Utc::now().signed_duration_since(last).num_seconds();
                return age < max_age_secs;
            }
        }
        false
    }
}

/// Validates a Discord token against the API.
/// Returns Ok(()) if valid, Err with reason if not.
pub async fn validate_token(token: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://discord.com/api/v10/users/@me")
        .header("Authorization", token)
        .header(
            "User-Agent",
            concat!("OrganicCord/", env!("CARGO_PKG_VERSION")),
        )
        .send()
        .await
        .map_err(|e| format!("Erro de rede: {e}"))?;

    match resp.status().as_u16() {
        200..=299 => Ok(()),
        401 => Err("Token inválido ou expirado".into()),
        403 => Err("Token sem permissão".into()),
        429 => Err("Rate limit atingido — tente novamente em alguns segundos".into()),
        status => Err(format!("HTTP {status}")),
    }
}
