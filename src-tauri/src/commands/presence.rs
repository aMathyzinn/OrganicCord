use tauri::State;
use zeroize::Zeroizing;

use crate::commands::account::load_accounts_from_store;
use crate::gateway::{CustomActivity, GameActivity, GatewayManager, PresenceStatus};
use crate::storage;

/// Connects the Discord gateway for a given account and sets its initial status.
/// Must be called after connect_account succeeds.
#[tauri::command]
pub async fn gateway_connect(
    account_id: String,
    status: Option<String>,
    gateway: State<'_, GatewayManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let presence = parse_status(status.as_deref().unwrap_or("online"));
    gateway.connect(account_id, token, presence, app).await;
    Ok(())
}

/// Updates the presence status for a connected gateway session.
#[tauri::command]
pub async fn gateway_set_status(
    account_id: String,
    status: String,
    gateway: State<'_, GatewayManager>,
) -> Result<(), String> {
    let presence = parse_status(&status);
    gateway.set_status(&account_id, presence).await
}

/// Disconnects the gateway session for an account.
#[tauri::command]
pub async fn gateway_disconnect(
    account_id: String,
    gateway: State<'_, GatewayManager>,
) -> Result<(), String> {
    gateway.disconnect(&account_id).await;
    Ok(())
}

/// Updates the custom activity for a connected gateway session.
#[tauri::command]
pub async fn gateway_set_custom_activity(
    account_id: String,
    text: Option<String>,
    emoji_name: Option<String>,
    emoji_id: Option<String>,
    gateway: State<'_, GatewayManager>,
) -> Result<(), String> {
    let activity = match text {
        Some(t) if !t.is_empty() => Some(CustomActivity {
            text: t,
            emoji_name,
            emoji_id,
        }),
        _ => None,
    };
    gateway.set_custom_activity(&account_id, activity).await
}

/// Publishes the currently detected game without replacing the user's custom status.
#[tauri::command]
pub async fn gateway_set_game_activity(
    account_id: String,
    name: Option<String>,
    started_at: Option<i64>,
    gateway: State<'_, GatewayManager>,
) -> Result<(), String> {
    let activity = match (name, started_at) {
        (Some(name), Some(started_at))
            if !name.trim().is_empty() && name.chars().count() <= 128 && started_at > 0 =>
        {
            Some(GameActivity {
                name: name.trim().to_string(),
                started_at,
            })
        }
        (None, None) => None,
        _ => return Err("Atividade de jogo inválida.".to_string()),
    };
    gateway.set_game_activity(&account_id, activity).await
}

/// Returns the current presence status for an account.
#[tauri::command]
pub fn gateway_get_status(
    account_id: String,
    gateway: State<'_, GatewayManager>,
) -> Option<String> {
    gateway
        .get_status(&account_id)
        .map(|s| s.as_str().to_string())
}

fn parse_status(s: &str) -> PresenceStatus {
    match s {
        "idle" => PresenceStatus::Idle,
        "dnd" => PresenceStatus::Dnd,
        "invisible" => PresenceStatus::Invisible,
        _ => PresenceStatus::Online,
    }
}

fn get_token(account_id: &str, app: &tauri::AppHandle) -> Result<Zeroizing<String>, String> {
    let accounts = load_accounts_from_store(app)?;
    let account = accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Conta não encontrada.")?;

    storage::decrypt_token(&account.token_encrypted)
        .map(Zeroizing::new)
        .map_err(|e| format!("Erro ao descriptografar token: {}", e))
}
