use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::session::{PublicAccount, SessionManager, StoredAccount};
use crate::storage;
use zeroize::Zeroize;

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

    let val =
        serde_json::to_value(accounts).map_err(|e| format!("Erro ao serializar contas: {}", e))?;

    store.set("accounts", val);
    store
        .save()
        .map_err(|e| format!("Erro ao salvar store: {}", e))?;

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
    pub account: PublicAccount,
}

fn account_color(index: usize) -> String {
    let colors = [
        "#5865F2", "#57F287", "#FEE75C", "#EB459E", "#ED4245", "#3BA55D", "#FAA61A", "#00BCD4",
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
    mut payload: AddAccountPayload,
    _state: State<'_, SessionManager>,
    app: tauri::AppHandle,
) -> Result<AddAccountResult, String> {
    let result = add_account_from_token(payload.token.trim(), &app).await;
    payload.token.zeroize();
    result.map(|account| AddAccountResult { account })
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
pub async fn list_accounts(app: tauri::AppHandle) -> Result<Vec<PublicAccount>, String> {
    load_accounts_from_store(&app)
        .map(|accounts| accounts.iter().map(PublicAccount::from).collect())
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

pub async fn add_account_from_token(
    token: &str,
    app: &tauri::AppHandle,
) -> Result<PublicAccount, String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("Token não pode ser vazio.".to_string());
    }

    let user_info = fetch_user_info(token)
        .await
        .map_err(|_| "Token inválido ou sem permissão. Verifique e tente novamente.".to_string())?;

    if user_info.id.is_empty() {
        return Err("A API do Discord retornou uma conta inválida.".to_string());
    }

    let token_encrypted =
        storage::encrypt_token(token).map_err(|e| format!("Erro ao criptografar token: {e}"))?;
    let mut accounts = load_accounts_from_store(app)?;

    let account = if let Some(existing) = accounts
        .iter_mut()
        .find(|account| account.user_id == user_info.id)
    {
        // Reautenticar a mesma conta atualiza as credenciais sem criar duplicatas.
        existing.token_encrypted = token_encrypted;
        existing.username = user_info.username;
        existing.discriminator = user_info.discriminator;
        existing.avatar = user_info.avatar;
        existing.clone()
    } else {
        let account = StoredAccount {
            id: Uuid::new_v4().to_string(),
            token_encrypted,
            username: user_info.username,
            discriminator: user_info.discriminator,
            user_id: user_info.id,
            avatar: user_info.avatar,
            added_at: Utc::now(),
            last_used: None,
            color: account_color(accounts.len()),
        };
        accounts.push(account.clone());
        account
    };

    save_accounts_to_store(app, &accounts)?;
    Ok(PublicAccount::from(&account))
}

async fn fetch_user_info(token: &str) -> anyhow::Result<AccountInfoResponse> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(token)?);
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        "User-Agent",
        HeaderValue::from_static(concat!("OrganicCord/", env!("CARGO_PKG_VERSION"))),
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
