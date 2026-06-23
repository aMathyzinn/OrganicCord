use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

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

pub struct SessionManager {
    pub sessions: Arc<Mutex<HashMap<String, AccountSession>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn add_session(&self, session: AccountSession) {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.insert(session.account_id.clone(), session);
    }

    pub fn remove_session(&self, account_id: &str) {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.remove(account_id);
    }

    pub fn get_session(&self, account_id: &str) -> Option<AccountSession> {
        let sessions = self.sessions.lock().unwrap();
        sessions.get(account_id).cloned()
    }

    pub fn update_status(&self, account_id: &str, status: SessionStatus) {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(account_id) {
            session.status = status;
            if matches!(session.status, SessionStatus::Connected) {
                session.connected_at = Some(Utc::now());
                session.last_validated_at = Some(Utc::now());
            }
        }
    }

    pub fn list_sessions(&self) -> Vec<AccountSession> {
        let sessions = self.sessions.lock().unwrap();
        sessions.values().cloned().collect()
    }

    /// Returns true if the session exists and was validated within the last `max_age` seconds.
    /// Use this before making API calls to avoid redundant re-validations.
    pub fn is_recently_validated(&self, account_id: &str, max_age_secs: i64) -> bool {
        let sessions = self.sessions.lock().unwrap();
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

    /// Marks a session as needing re-validation (e.g. after a 401 response).
    pub fn invalidate(&self, account_id: &str) {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(account_id) {
            session.status = SessionStatus::Error("Token invalidated — please reconnect".into());
            session.last_validated_at = None;
        }
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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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
