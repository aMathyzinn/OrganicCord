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
pub async fn ai_generate(payload: AiGeneratePayload, app: tauri::AppHandle, _state: tauri::State<'_, crate::session::SessionManager>) -> Result<AiGenerateResult, String> { Err("AI is disabled".to_string()) }

#[tauri::command]
pub async fn ai_test_config(config: AiConfig, test_message: String) -> Result<String, String> { Err("AI is disabled".to_string()) }

#[tauri::command]
pub async fn discord_send_text(account_id: String, channel_id: String, content: String, reply_to: Option<String>, app: tauri::AppHandle) -> Result<String, String> { Err("Disabled".to_string()) }

#[tauri::command]
pub async fn discord_trigger_typing(account_id: String, channel_id: String, app: tauri::AppHandle) -> Result<(), String> { Ok(()) }

#[tauri::command]
pub async fn discord_add_reaction(account_id: String, channel_id: String, message_id: String, emoji: String, app: tauri::AppHandle) -> Result<(), String> { Ok(()) }

#[tauri::command]
pub async fn discord_remove_reaction(account_id: String, channel_id: String, message_id: String, emoji: String, app: tauri::AppHandle) -> Result<(), String> { Ok(()) }
