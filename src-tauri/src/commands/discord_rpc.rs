use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use tauri_plugin_store::StoreBuilder;
use uuid::Uuid;

const STORE_FILE: &str = "discord_rich_presence.json";
const DEFAULT_APPLICATION_ID: &str = "1543323404910731355";
const MAX_FRAME_BYTES: usize = 1024 * 1024;
const RPC_HANDSHAKE: u32 = 0;
const RPC_FRAME: u32 = 1;
const RPC_CLOSE: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordRpcSettings {
    pub enabled: bool,
    pub application_id: String,
}

impl Default for DiscordRpcSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            application_id: DEFAULT_APPLICATION_ID.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordRpcStatus {
    pub connected: bool,
    pub message: String,
}

pub struct DiscordRpcManager {
    settings: Arc<Mutex<Option<DiscordRpcSettings>>>,
    connection: tokio::sync::Mutex<Option<RpcConnection>>,
}

struct RpcConnection {
    application_id: String,
    client: RpcClient,
}

impl DiscordRpcManager {
    pub fn new() -> Self {
        Self {
            settings: Arc::new(Mutex::new(None)),
            connection: tokio::sync::Mutex::new(None),
        }
    }

    fn settings(&self, app: &tauri::AppHandle) -> Result<DiscordRpcSettings, String> {
        let mut cached = self
            .settings
            .lock()
            .map_err(|_| "Rich Presence settings lock poisoned")?;
        if let Some(settings) = cached.as_ref() {
            return Ok(settings.clone());
        }

        let store = StoreBuilder::new(app, STORE_FILE)
            .build()
            .map_err(|error| {
                format!("Não foi possível abrir as configurações de Rich Presence: {error}")
            })?;
        let mut settings: DiscordRpcSettings = store
            .get("settings")
            .map(|value| serde_json::from_value(value.clone()))
            .transpose()
            .map_err(|error| {
                format!("Não foi possível ler as configurações de Rich Presence: {error}")
            })?
            .unwrap_or_default();
        if settings.application_id.trim().is_empty() {
            settings.application_id = DEFAULT_APPLICATION_ID.to_string();
        }
        *cached = Some(settings.clone());
        Ok(settings)
    }

    fn save_settings(
        &self,
        app: &tauri::AppHandle,
        settings: DiscordRpcSettings,
    ) -> Result<DiscordRpcSettings, String> {
        let store = StoreBuilder::new(app, STORE_FILE)
            .build()
            .map_err(|error| {
                format!("Não foi possível abrir as configurações de Rich Presence: {error}")
            })?;
        store.set(
            "settings",
            serde_json::to_value(&settings).map_err(|error| {
                format!("Não foi possível salvar as configurações de Rich Presence: {error}")
            })?,
        );
        store.save().map_err(|error| {
            format!("Não foi possível salvar as configurações de Rich Presence: {error}")
        })?;
        *self
            .settings
            .lock()
            .map_err(|_| "Rich Presence settings lock poisoned")? = Some(settings.clone());
        Ok(settings)
    }

    pub fn get_settings(&self, app: &tauri::AppHandle) -> Result<DiscordRpcSettings, String> {
        self.settings(app)
    }

    pub async fn update_settings(
        &self,
        app: &tauri::AppHandle,
        settings: DiscordRpcSettings,
    ) -> Result<DiscordRpcSettings, String> {
        let application_id = settings.application_id.trim().to_string();
        if !application_id.is_empty() && !is_application_id(&application_id) {
            return Err("O Application ID precisa conter entre 17 e 20 dígitos.".to_string());
        }
        let saved = self.save_settings(
            app,
            DiscordRpcSettings {
                enabled: settings.enabled,
                application_id,
            },
        )?;
        self.connection.lock().await.take();
        Ok(saved)
    }

    fn configured_application_id(&self, app: &tauri::AppHandle) -> Result<String, String> {
        let settings = self.settings(app)?;
        if !settings.enabled {
            return Err(
                "A publicação por Rich Presence está desativada nas configurações.".to_string(),
            );
        }
        if !is_application_id(&settings.application_id) {
            return Err(
                "Informe o Application ID da aplicação do OrganicCord para publicar a atividade."
                    .to_string(),
            );
        }
        Ok(settings.application_id)
    }

    async fn ensure_connection(&self, application_id: &str) -> Result<(), String> {
        let mut connection = self.connection.lock().await;
        let needs_connection = connection
            .as_ref()
            .map(|current| current.application_id != application_id)
            .unwrap_or(true);
        if needs_connection {
            let client = connect_and_handshake(application_id).await?;
            *connection = Some(RpcConnection {
                application_id: application_id.to_string(),
                client,
            });
        }
        Ok(())
    }

    async fn publish(&self, application_id: &str, activity: Option<Value>) -> Result<(), String> {
        self.ensure_connection(application_id).await?;

        let first_attempt = {
            let mut connection = self.connection.lock().await;
            let current = connection
                .as_mut()
                .ok_or_else(|| "A conexão com o Discord Desktop foi encerrada.".to_string())?;
            send_activity(&mut current.client, activity.clone()).await
        };

        if first_attempt.is_ok() {
            return Ok(());
        }

        self.connection.lock().await.take();
        self.ensure_connection(application_id).await?;
        let mut connection = self.connection.lock().await;
        let current = connection
            .as_mut()
            .ok_or_else(|| "A conexão com o Discord Desktop foi encerrada.".to_string())?;
        send_activity(&mut current.client, activity)
            .await
            .inspect_err(|_| {
                *connection = None;
            })
    }
}

#[tauri::command]
pub fn discord_rpc_get_settings(
    manager: State<'_, DiscordRpcManager>,
    app: tauri::AppHandle,
) -> Result<DiscordRpcSettings, String> {
    manager.get_settings(&app)
}

#[tauri::command]
pub async fn discord_rpc_update_settings(
    settings: DiscordRpcSettings,
    manager: State<'_, DiscordRpcManager>,
    app: tauri::AppHandle,
) -> Result<DiscordRpcSettings, String> {
    manager.update_settings(&app, settings).await
}

#[tauri::command]
pub async fn discord_rpc_publish_game(
    name: String,
    started_at: i64,
    manager: State<'_, DiscordRpcManager>,
    app: tauri::AppHandle,
) -> Result<DiscordRpcStatus, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 128 || started_at <= 0 {
        return Err("Atividade de jogo inválida.".to_string());
    }
    let application_id = manager.configured_application_id(&app)?;
    manager
        .publish(&application_id, Some(game_activity(name, started_at)))
        .await?;
    Ok(DiscordRpcStatus {
        connected: true,
        message: "Atividade publicada no Discord Desktop.".to_string(),
    })
}

#[tauri::command]
pub async fn discord_rpc_clear_game(
    manager: State<'_, DiscordRpcManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let application_id = manager.configured_application_id(&app)?;
    manager.publish(&application_id, None).await
}

#[tauri::command]
pub async fn discord_rpc_test(
    manager: State<'_, DiscordRpcManager>,
    app: tauri::AppHandle,
) -> Result<DiscordRpcStatus, String> {
    let application_id = manager.configured_application_id(&app)?;
    manager.ensure_connection(&application_id).await?;
    Ok(DiscordRpcStatus {
        connected: true,
        message: "Conectado ao Discord Desktop.".to_string(),
    })
}

fn is_application_id(value: &str) -> bool {
    (17..=20).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_digit())
}

fn game_activity(name: &str, started_at_millis: i64) -> Value {
    json!({
        "name": name,
        "type": 0,
        "details": format!("Jogando {name}"),
        "state": "Detectado pelo OrganicCord",
        "timestamps": { "start": started_at_millis / 1_000 },
    })
}

async fn send_activity(client: &mut RpcClient, activity: Option<Value>) -> Result<(), String> {
    let nonce = Uuid::new_v4().to_string();
    let payload = json!({
        "cmd": "SET_ACTIVITY",
        "nonce": nonce,
        "args": {
            "pid": std::process::id(),
            "activity": activity,
        },
    });
    write_frame(client, RPC_FRAME, &payload).await?;
    wait_for_response(client, &nonce).await
}

#[cfg(target_os = "windows")]
type RpcClient = tokio::net::windows::named_pipe::NamedPipeClient;

#[cfg(target_os = "windows")]
async fn connect_and_handshake(application_id: &str) -> Result<RpcClient, String> {
    use tokio::net::windows::named_pipe::ClientOptions;

    let mut last_error = None;
    for index in 0..10 {
        let path = format!(r"\\.\pipe\discord-ipc-{index}");
        match ClientOptions::new().open(&path) {
            Ok(mut client) => {
                let handshake = json!({ "v": 1, "client_id": application_id });
                write_frame(&mut client, RPC_HANDSHAKE, &handshake).await?;
                let (opcode, payload) = read_frame(&mut client).await?;
                if opcode == RPC_CLOSE {
                    return Err(rpc_error_message(&payload));
                }
                if opcode != RPC_FRAME || payload["evt"].as_str() != Some("READY") {
                    return Err("O Discord Desktop recusou a conexão de Rich Presence.".to_string());
                }
                return Ok(client);
            }
            Err(error) => last_error = Some(error),
        }
    }
    let detail = last_error
        .map(|error| format!(": {error}"))
        .unwrap_or_default();
    Err(format!(
        "Não foi possível encontrar o Discord Desktop aberto{detail}"
    ))
}

#[cfg(not(target_os = "windows"))]
type RpcClient = ();

#[cfg(not(target_os = "windows"))]
async fn connect_and_handshake(_application_id: &str) -> Result<RpcClient, String> {
    Err(
        "A publicação por RPC está disponível nesta versão do OrganicCord para Windows."
            .to_string(),
    )
}

#[cfg(target_os = "windows")]
async fn write_frame(client: &mut RpcClient, opcode: u32, payload: &Value) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let body = serde_json::to_vec(payload)
        .map_err(|error| format!("Não foi possível preparar a atividade: {error}"))?;
    if body.len() > MAX_FRAME_BYTES {
        return Err("A atividade enviada ao Discord é grande demais.".to_string());
    }
    client
        .write_all(&opcode.to_le_bytes())
        .await
        .map_err(|error| format!("Não foi possível falar com o Discord Desktop: {error}"))?;
    client
        .write_all(&(body.len() as u32).to_le_bytes())
        .await
        .map_err(|error| format!("Não foi possível falar com o Discord Desktop: {error}"))?;
    client
        .write_all(&body)
        .await
        .map_err(|error| format!("Não foi possível falar com o Discord Desktop: {error}"))?;
    client.flush().await.map_err(|error| {
        format!("Não foi possível finalizar a atividade no Discord Desktop: {error}")
    })
}

#[cfg(not(target_os = "windows"))]
async fn write_frame(
    _client: &mut RpcClient,
    _opcode: u32,
    _payload: &Value,
) -> Result<(), String> {
    Err(
        "A publicação por RPC está disponível nesta versão do OrganicCord para Windows."
            .to_string(),
    )
}

#[cfg(target_os = "windows")]
async fn read_frame(client: &mut RpcClient) -> Result<(u32, Value), String> {
    use tokio::io::AsyncReadExt;

    let mut header = [0_u8; 8];
    tokio::time::timeout(Duration::from_secs(4), client.read_exact(&mut header))
        .await
        .map_err(|_| "O Discord Desktop demorou demais para responder.".to_string())?
        .map_err(|error| format!("Não foi possível ler a resposta do Discord Desktop: {error}"))?;
    let opcode = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
    let body_length = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    if body_length > MAX_FRAME_BYTES {
        return Err("O Discord Desktop enviou uma resposta inválida.".to_string());
    }
    let mut body = vec![0_u8; body_length];
    tokio::time::timeout(Duration::from_secs(4), client.read_exact(&mut body))
        .await
        .map_err(|_| "O Discord Desktop demorou demais para responder.".to_string())?
        .map_err(|error| format!("Não foi possível ler a resposta do Discord Desktop: {error}"))?;
    let payload = serde_json::from_slice(&body)
        .map_err(|_| "O Discord Desktop enviou uma resposta inválida.".to_string())?;
    Ok((opcode, payload))
}

#[cfg(not(target_os = "windows"))]
async fn read_frame(_client: &mut RpcClient) -> Result<(u32, Value), String> {
    Err(
        "A publicação por RPC está disponível nesta versão do OrganicCord para Windows."
            .to_string(),
    )
}

async fn wait_for_response(client: &mut RpcClient, nonce: &str) -> Result<(), String> {
    loop {
        let (opcode, payload) = read_frame(client).await?;
        if opcode == RPC_CLOSE || payload["evt"].as_str() == Some("ERROR") {
            return Err(rpc_error_message(&payload));
        }
        if opcode == RPC_FRAME && payload["nonce"].as_str() == Some(nonce) {
            return Ok(());
        }
    }
}

fn rpc_error_message(payload: &Value) -> String {
    payload["data"]["message"]
        .as_str()
        .or_else(|| payload["message"].as_str())
        .map(|message| format!("O Discord Desktop recusou a atividade: {message}"))
        .unwrap_or_else(|| "O Discord Desktop fechou a conexão de Rich Presence.".to_string())
}

#[cfg(test)]
mod tests {
    use super::{game_activity, is_application_id};

    #[test]
    fn validates_discord_application_ids() {
        assert!(is_application_id("12345678901234567"));
        assert!(!is_application_id("123"));
        assert!(!is_application_id("1234567890123456x"));
    }

    #[test]
    fn builds_a_playing_activity_with_elapsed_time() {
        let activity = game_activity("VALORANT", 1_725_000_001_000);
        assert_eq!(activity["name"], "VALORANT");
        assert_eq!(activity["type"], 0);
        assert_eq!(activity["timestamps"]["start"], 1_725_000_001_i64);
    }
}
