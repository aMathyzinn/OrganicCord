use tauri::State;
use serde::{Deserialize, Serialize};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use std::time::Duration;

use crate::session::SessionManager;
use crate::storage;
use crate::commands::account::load_accounts_from_store;
use crate::http_client::{RetryConfig, is_retryable_status, backoff_ms};

// ─── Request / Response types ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenRouterRequest {
    model: String,
    messages: Vec<AiMessage>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterMessageRaw {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterChoice {
    message: OpenRouterMessageRaw,
}

#[derive(Debug, Deserialize)]
struct OpenRouterResponse {
    choices: Vec<OpenRouterChoice>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
    role: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiPart {
    text: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(rename = "systemInstruction", skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
    #[serde(rename = "generationConfig", skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiGenerationConfig {
    #[serde(rename = "maxOutputTokens", skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiContent,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
}

// ─── Public payload types (for frontend) ────────────────────────────────────

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
pub struct AiAutoReplyRule {
    pub id: String,
    pub account_id: String,
    pub channel_id: String,
    pub guild_id: Option<String>,
    pub enabled: bool,
    pub config: AiConfig,
    pub trigger_prefix: Option<String>,
    pub reply_delay_ms: Option<u64>,
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

// ─── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ai_generate(
    payload: AiGeneratePayload,
    app: tauri::AppHandle,
    _state: State<'_, SessionManager>,
) -> Result<AiGenerateResult, String> {
    let text = match payload.config.provider.as_str() {
        "openrouter" => call_openrouter(&payload.config, &payload.messages).await?,
        "google" => call_google(&payload.config, &payload.messages).await?,
        other => return Err(format!("Provider desconhecido: {}", other)),
    };

    let sent = if payload.send {
        let token = get_token(&payload.account_id, &app)?;
        let client = make_discord_client(&token)?;
        let mut body = serde_json::json!({ "content": text });
        if let Some(ref ref_id) = payload.reply_to {
            body["message_reference"] = serde_json::json!({ "message_id": ref_id });
        }
        let url = format!(
            "https://discord.com/api/v10/channels/{}/messages",
            payload.channel_id
        );
        send_discord_with_retry(&client, &url, &body).await?;
        true
    } else {
        false
    };

    Ok(AiGenerateResult { text, sent })
}

#[tauri::command]
pub async fn discord_send_text(
    account_id: String,
    channel_id: String,
    content: String,
    reply_to: Option<String>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let token = get_token(&account_id, &app)?;
    let client = make_discord_client(&token)?;
    let mut body = serde_json::json!({ "content": content });
    if let Some(ref ref_id) = reply_to {
        body["message_reference"] = serde_json::json!({ "message_id": ref_id });
    }
    let url = format!(
        "https://discord.com/api/v10/channels/{}/messages",
        channel_id
    );
    send_discord_with_retry_id(&client, &url, &body).await
}

#[tauri::command]
pub async fn discord_trigger_typing(
    account_id: String,
    channel_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = make_discord_client(&token)?;
    // Best-effort — typing is cosmetic, don't retry or surface errors
    let _ = client
        .post(format!(
            "https://discord.com/api/v10/channels/{}/typing",
            channel_id
        ))
        .header("Content-Length", "0")
        .send()
        .await;
    Ok(())
}

#[tauri::command]
pub async fn discord_add_reaction(
    account_id: String,
    channel_id: String,
    message_id: String,
    emoji: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = make_discord_client(&token)?;
    // Percent-encode each byte of the emoji string for the URL
    let encoded: String = emoji.bytes()
        .flat_map(|b| {
            if b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'_' || b == b'~' {
                vec![b as char]
            } else {
                format!("%{:02X}", b).chars().collect()
            }
        })
        .collect();
    let url = format!(
        "https://discord.com/api/v10/channels/{}/messages/{}/reactions/{}/@me",
        channel_id, message_id, encoded
    );
    // Best-effort — reaction is cosmetic, surface errors but don't retry
    let resp = client.put(&url).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(())
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        log::warn!(
            "[discord] add_reaction failed: HTTP {} — {}",
            status,
            &body[..body.len().min(200)]
        );
        Err(format!("Reaction failed: HTTP {}", status))
    }
}

#[tauri::command]
pub async fn discord_remove_reaction(
    account_id: String,
    channel_id: String,
    message_id: String,
    emoji: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = make_discord_client(&token)?;
    let encoded: String = emoji.bytes()
        .flat_map(|b| {
            if b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'_' || b == b'~' {
                vec![b as char]
            } else {
                format!("%{:02X}", b).chars().collect()
            }
        })
        .collect();
    let url = format!(
        "https://discord.com/api/v10/channels/{}/messages/{}/reactions/{}/@me",
        channel_id, message_id, encoded
    );
    let resp = client.delete(&url).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(())
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        log::warn!(
            "[discord] remove_reaction failed: HTTP {} — {}",
            status,
            &body[..body.len().min(200)]
        );
        Err(format!("Reaction failed: HTTP {}", status))
    }
}

#[tauri::command]
pub async fn ai_test_config(
    config: AiConfig,
    test_message: String,
) -> Result<String, String> {
    let messages = vec![AiMessage {
        role: "user".to_string(),
        content: test_message,
    }];

    match config.provider.as_str() {
        "openrouter" => call_openrouter(&config, &messages).await,
        "google" => call_google(&config, &messages).await,
        other => Err(format!("Provider desconhecido: {}", other)),
    }
}

// ─── AI provider callers ─────────────────────────────────────────────────────

async fn call_openrouter(config: &AiConfig, messages: &[AiMessage]) -> Result<String, String> {
    let mut all_messages: Vec<AiMessage> = Vec::new();

    if !config.system_prompt.is_empty() {
        all_messages.push(AiMessage {
            role: "system".to_string(),
            content: config.system_prompt.clone(),
        });
    }
    all_messages.extend_from_slice(messages);

    let request = OpenRouterRequest {
        model: config.model.clone(),
        messages: all_messages,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
    };

    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", config.api_key))
            .map_err(|e| e.to_string())?,
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        "HTTP-Referer",
        HeaderValue::from_static("https://github.com/OrganicCord"),
    );
    headers.insert("X-Title", HeaderValue::from_static("OrganicCord"));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())?;

    let retry = RetryConfig { max_attempts: 4, base_delay_ms: 1_000, max_delay_ms: 8_000 };
    let mut last_err = String::new();

    for attempt in 0..retry.max_attempts {
        if attempt > 0 {
            let delay = backoff_ms(attempt - 1, &retry);
            log::warn!("[ai] OpenRouter retry {}/{} after {}ms", attempt, retry.max_attempts - 1, delay);
            tokio::time::sleep(Duration::from_millis(delay)).await;
        }

        let resp = match client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .json(&request)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => { last_err = format!("OpenRouter request failed: {e}"); continue; }
        };

        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();

        if status.is_success() {
            let parsed: OpenRouterResponse = serde_json::from_str(&body)
                .map_err(|e| format!("OpenRouter parse error: {} | body: {}", e, &body[..body.len().min(300)]))?;

            let content = parsed
                .choices
                .into_iter()
                .next()
                .and_then(|c| c.message.content)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());

            match content {
                Some(text) => return Ok(text),
                None => {
                    log::warn!(
                        "[ai] OpenRouter returned null/empty content (model={}), body preview: {}",
                        config.model,
                        &body[..body.len().min(500)]
                    );
                    // Treat as retryable — model may have returned tool_calls or refused
                    last_err = "OpenRouter returned empty or null content".to_string();
                    continue; // retry next attempt
                }
            }
        }

        last_err = format!("OpenRouter API error {}: {}", status, &body[..body.len().min(400)]);
        if !is_retryable_status(status) { break; }
    }

    Err(last_err)
}

async fn call_google(config: &AiConfig, messages: &[AiMessage]) -> Result<String, String> {
    let system_instruction = if !config.system_prompt.is_empty() {
        Some(GeminiContent {
            role: None,
            parts: vec![GeminiPart { text: config.system_prompt.clone() }],
        })
    } else {
        None
    };

    let contents: Vec<GeminiContent> = messages
        .iter()
        .map(|m| GeminiContent {
            role: Some(if m.role == "assistant" { "model".to_string() } else { "user".to_string() }),
            parts: vec![GeminiPart { text: m.content.clone() }],
        })
        .collect();

    let generation_config = if config.max_tokens.is_some() || config.temperature.is_some() {
        Some(GeminiGenerationConfig {
            max_output_tokens: config.max_tokens,
            temperature: config.temperature,
        })
    } else {
        None
    };

    let request = GeminiRequest { contents, system_instruction, generation_config };

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        config.model, config.api_key
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let retry = RetryConfig { max_attempts: 4, base_delay_ms: 1_000, max_delay_ms: 8_000 };
    let mut last_err = String::new();

    for attempt in 0..retry.max_attempts {
        if attempt > 0 {
            let delay = backoff_ms(attempt - 1, &retry);
            log::warn!("[ai] Google AI retry {}/{} after {}ms", attempt, retry.max_attempts - 1, delay);
            tokio::time::sleep(Duration::from_millis(delay)).await;
        }

        let resp = match client
            .post(&url)
            .header(CONTENT_TYPE, "application/json")
            .json(&request)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => { last_err = format!("Google AI request failed: {e}"); continue; }
        };

        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();

        if status.is_success() {
            let parsed: GeminiResponse = serde_json::from_str(&body)
                .map_err(|e| format!("Google AI parse error: {} | body: {}", e, &body[..body.len().min(300)]))?;

            return parsed
                .candidates
                .into_iter()
                .next()
                .and_then(|c| c.content.parts.into_iter().next())
                .map(|p| p.text.trim().to_string())
                .ok_or_else(|| "Google AI returned no candidates".to_string());
        }

        last_err = format!("Google AI API error {}: {}", status, &body[..body.len().min(400)]);
        if !is_retryable_status(status) { break; }
    }

    Err(last_err)
}

// ─── Discord send with retry ─────────────────────────────────────────────────

async fn send_discord_with_retry(
    client: &reqwest::Client,
    url: &str,
    body: &serde_json::Value,
) -> Result<(), String> {
    send_discord_with_retry_id(client, url, body).await.map(|_| ())
}

async fn send_discord_with_retry_id(
    client: &reqwest::Client,
    url: &str,
    body: &serde_json::Value,
) -> Result<String, String> {
    let config = RetryConfig { max_attempts: 3, base_delay_ms: 500, max_delay_ms: 5_000 };
    let mut last_err = String::new();

    for attempt in 0..config.max_attempts {
        if attempt > 0 {
            let delay = backoff_ms(attempt - 1, &config);
            log::warn!("[discord] send retry {}/{} after {}ms", attempt, config.max_attempts - 1, delay);
            tokio::time::sleep(Duration::from_millis(delay)).await;
        }

        let resp = match client.post(url).json(body).send().await {
            Ok(r) => r,
            Err(e) => { last_err = e.to_string(); continue; }
        };

        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await.unwrap_or_default();
            let id = json["id"].as_str().unwrap_or("").to_string();
            return Ok(id);
        }

        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        last_err = format!("Discord API error {}: {}", status, &body_text[..body_text.len().min(300)]);

        if !is_retryable_status(status) { break; }
    }

    Err(last_err)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn get_token(account_id: &str, app: &tauri::AppHandle) -> Result<String, String> {
    let accounts = load_accounts_from_store(app)?;
    let account = accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Conta não encontrada.")?;

    storage::decrypt_token(&account.token_encrypted)
        .map_err(|e| format!("Erro ao descriptografar token: {}", e))
}

fn make_discord_client(token: &str) -> Result<reqwest::Client, String> {
    crate::http_client::discord_client(token)
}
