use tauri::State;
use serde::{Deserialize, Serialize};

use crate::session::{SessionManager, AccountSession, SessionStatus, validate_token};
use crate::storage;
use crate::commands::account::load_accounts_from_store;

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectPayload {
    pub account_id: String,
}

#[derive(Debug, Serialize)]
pub struct SessionStatusResponse {
    pub account_id: String,
    pub status: SessionStatus,
    pub connected_at: Option<String>,
    pub last_validated_at: Option<String>,
}

#[tauri::command]
pub async fn connect_account(
    payload: ConnectPayload,
    state: State<'_, SessionManager>,
    app: tauri::AppHandle,
) -> Result<AccountSession, String> {
    let accounts = load_accounts_from_store(&app)?;
    let account = accounts
        .iter()
        .find(|a| a.id == payload.account_id)
        .ok_or("Conta não encontrada.")?
        .clone();

    // Se já está conectado e validado recentemente (< 60s), retorna direto
    if state.is_recently_validated(&account.id, 60) {
        if let Some(session) = state.get_session(&account.id) {
            return Ok(session);
        }
    }

    let token = storage::decrypt_token(&account.token_encrypted)
        .map_err(|e| format!("Erro de descriptografia: {}", e))?;

    let session = AccountSession {
        account_id: account.id.clone(),
        user_id: account.user_id.clone(),
        username: account.username.clone(),
        discriminator: account.discriminator.clone(),
        avatar: account.avatar.clone(),
        status: SessionStatus::Connecting,
        connected_at: None,
        last_validated_at: None,
        token_last_four: storage::token_last_four(&token),
    };

    state.add_session(session.clone());

    match validate_token(&token).await {
        Ok(()) => {
            state.update_status(&account.id, SessionStatus::Connected);
            Ok(state.get_session(&account.id).unwrap())
        }
        Err(reason) => {
            let err_msg = format!("Falha na conexão: {}", reason);
            state.update_status(&account.id, SessionStatus::Error(err_msg.clone()));
            Err(err_msg)
        }
    }
}

#[tauri::command]
pub async fn disconnect_account(
    account_id: String,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    state.remove_session(&account_id);
    Ok(())
}

#[tauri::command]
pub async fn get_session_status(
    account_id: String,
    state: State<'_, SessionManager>,
) -> Result<SessionStatusResponse, String> {
    match state.get_session(&account_id) {
        Some(session) => Ok(SessionStatusResponse {
            account_id: session.account_id,
            status: session.status,
            connected_at: session.connected_at.map(|t| t.to_rfc3339()),
            last_validated_at: session.last_validated_at.map(|t| t.to_rfc3339()),
        }),
        None => Ok(SessionStatusResponse {
            account_id,
            status: SessionStatus::Disconnected,
            connected_at: None,
            last_validated_at: None,
        }),
    }
}
