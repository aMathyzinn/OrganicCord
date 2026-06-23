use tauri::State;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};

use crate::session::{SessionManager, StoredAccount};
use crate::storage;

// Helpers de persistência usados também pelo módulo session
pub fn load_accounts_from_store(app: &tauri::AppHandle) -> Result<Vec<StoredAccount>, String> {
    let store = tauri_plugin_store::StoreBuilder::new(app, "accounts.json")
        .build()
        .map_err(|e| format!("Erro ao abrir store: {}", e))?;

    match store.get("accounts") {
        Some(val) => serde_json::from_value(val.clone())
            .map_err(|e| format!("Erro ao parsear contas: {}", e)),
        None => Ok(vec![]),
    }
}

pub fn save_accounts_to_store(
    app: &tauri::AppHandle,
    accounts: &[StoredAccount],
) -> Result<(), String> {
    let store = tauri_plugin_store::StoreBuilder::new(app, "accounts.json")
        .build()
        .map_err(|e| format!("Erro ao abrir store: {}", e))?;

    let val = serde_json::to_value(accounts)
        .map_err(|e| format!("Erro ao serializar contas: {}", e))?;

    store.set("accounts", val);
    store.save().map_err(|e| format!("Erro ao salvar store: {}", e))?;

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddAccountPayload {
    pub token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountInfoResponse {
    pub id: String,
    pub username: String,
    pub discriminator: String,
    pub avatar: Option<String>,
    pub global_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AddAccountResult {
    pub account: StoredAccount,
}

fn account_color(index: usize) -> String {
    let colors = [
        "#5865F2", "#57F287", "#FEE75C", "#EB459E",
        "#ED4245", "#3BA55D", "#FAA61A", "#00BCD4",
    ];
    colors[index % colors.len()].to_string()
}

/// Valida o token junto à API do Discord e retorna informações do usuário.
#[tauri::command]
pub async fn validate_token(token: String) -> Result<AccountInfoResponse, String> {
    fetch_user_info(&token).await.map_err(|e| e.to_string())
}

/// Adiciona uma nova conta ao gerenciador após validar o token.
#[tauri::command]
pub async fn add_account(
    payload: AddAccountPayload,
    _state: State<'_, SessionManager>,
    app: tauri::AppHandle,
) -> Result<AddAccountResult, String> {
    let token = payload.token.trim().to_string();

    if token.is_empty() {
        return Err("Token não pode ser vazio.".to_string());
    }

    // Valida o token na API do Discord
    let user_info = fetch_user_info(&token)
        .await
        .map_err(|_| "Token inválido ou sem permissão. Verifique e tente novamente.".to_string())?;

    // Criptografa o token antes de salvar
    let token_encrypted = storage::encrypt_token(&token)
        .map_err(|e| format!("Erro ao criptografar token: {}", e))?;

    let existing_accounts = load_accounts_from_store(&app)?;
    let color = account_color(existing_accounts.len());

    let account = StoredAccount {
        id: Uuid::new_v4().to_string(),
        token_encrypted,
        username: user_info.username.clone(),
        discriminator: user_info.discriminator.clone(),
        user_id: user_info.id.clone(),
        avatar: user_info.avatar.clone(),
        added_at: Utc::now(),
        last_used: None,
        color,
    };

    // Persiste no store do Tauri
    let mut accounts = existing_accounts;
    accounts.push(account.clone());
    save_accounts_to_store(&app, &accounts)?;

    Ok(AddAccountResult { account })
}

/// Remove uma conta pelo ID.
#[tauri::command]
pub async fn remove_account(
    account_id: String,
    state: State<'_, SessionManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    state.remove_session(&account_id);

    let mut accounts = load_accounts_from_store(&app)?;
    accounts.retain(|a| a.id != account_id);
    save_accounts_to_store(&app, &accounts)?;

    Ok(())
}

/// Lista todas as contas salvas (sem tokens descriptografados).
#[tauri::command]
pub async fn list_accounts(app: tauri::AppHandle) -> Result<Vec<StoredAccount>, String> {
    load_accounts_from_store(&app)
}

/// Retorna informações atualizadas de uma conta específica.
#[tauri::command]
pub async fn get_account_info(
    account_id: String,
    app: tauri::AppHandle,
) -> Result<AccountInfoResponse, String> {
    let accounts = load_accounts_from_store(&app)?;
    let account = accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Conta não encontrada.")?;

    let token = storage::decrypt_token(&account.token_encrypted)
        .map_err(|e| format!("Erro ao descriptografar token: {}", e))?;

    fetch_user_info(&token).await.map_err(|e| e.to_string())
}

// --- Helpers internos ---

async fn fetch_user_info(token: &str) -> anyhow::Result<AccountInfoResponse> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(token)?);
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        "User-Agent",
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        ),
    );

    let response = client
        .get("https://discord.com/api/v10/users/@me")
        .headers(headers)
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(anyhow::anyhow!(
            "Discord API retornou status {}",
            response.status()
        ));
    }

    let user: serde_json::Value = response.json().await?;

    Ok(AccountInfoResponse {
        id: user["id"].as_str().unwrap_or("").to_string(),
        username: user["username"].as_str().unwrap_or("Unknown").to_string(),
        discriminator: user["discriminator"].as_str().unwrap_or("0000").to_string(),
        avatar: user["avatar"].as_str().map(|s| s.to_string()),
        global_name: user["global_name"].as_str().map(|s| s.to_string()),
    })
}

