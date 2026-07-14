use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiConfig {
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub system_prompt: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiGeneratePayload {
    pub config: AiConfig,
    pub messages: Vec<AiMessage>,
    pub account_id: String,
    pub channel_id: String,
    pub send: bool,
    pub reply_to: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiGenerateResult {
    pub text: String,
    pub sent: bool,
}

#[tauri::command]
pub async fn ai_generate(_payload: AiGeneratePayload, _app: tauri::AppHandle, _state: tauri::State<'_, crate::session::SessionManager>) -> Result<AiGenerateResult, String> { Err("AI is disabled".to_string()) }

#[tauri::command]
pub async fn ai_test_config(_config: AiConfig, _test_message: String) -> Result<String, String> { Err("AI is disabled".to_string()) }

#[tauri::command]
pub async fn discord_send_text(_account_id: String, _channel_id: String, _content: String, _reply_to: Option<String>, _app: tauri::AppHandle) -> Result<String, String> { Err("Disabled".to_string()) }

#[tauri::command]
pub async fn discord_trigger_typing(_account_id: String, _channel_id: String, _app: tauri::AppHandle) -> Result<(), String> { Ok(()) }

#[tauri::command]
pub async fn discord_add_reaction(_account_id: String, _channel_id: String, _message_id: String, _emoji: String, _app: tauri::AppHandle) -> Result<(), String> { Ok(()) }

#[tauri::command]
pub async fn discord_remove_reaction(_account_id: String, _channel_id: String, _message_id: String, _emoji: String, _app: tauri::AppHandle) -> Result<(), String> { Ok(()) }
