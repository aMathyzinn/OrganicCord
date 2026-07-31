use tauri::State;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::session::SessionManager;
use crate::storage;
use crate::gateway::GatewayManager;
use crate::commands::account::load_accounts_from_store;
use crate::http_client::{discord_client, RetryConfig, is_retryable_status, backoff_ms};
use crate::rate_limit::{
    RateLimiter, limits,
    rate_limited_get, rate_limited_post, rate_limited_delete,
    rate_limited_patch, rate_limited_put_empty,
};

// --- DTOs de resposta ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscordGuild {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub owner: bool,
    pub permissions: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscordChannel {
    pub id: String,
    pub name: Option<String>,
    #[serde(rename(deserialize = "type", serialize = "channel_type"))]
    pub channel_type: u8,
    pub position: Option<i32>,
    pub parent_id: Option<String>,
    pub topic: Option<String>,
    pub nsfw: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscordMessage {
    pub id: String,
    pub channel_id: Option<String>,
    pub guild_id: Option<String>,
    pub content: String,
    pub author: DiscordUser,
    pub timestamp: String,
    pub edited_timestamp: Option<String>,
    pub attachments: Vec<serde_json::Value>,
    pub embeds: Vec<serde_json::Value>,
    pub reactions: Option<Vec<serde_json::Value>>,
    pub referenced_message: Option<Box<DiscordMessage>>,
    pub poll: Option<serde_json::Value>,
    pub components: Option<Vec<serde_json::Value>>,
    #[serde(rename = "type")]
    pub msg_type: Option<u8>,
    pub call: Option<serde_json::Value>,
    pub flags: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscordUser {
    pub id: String,
    pub username: String,
    pub discriminator: String,
    pub avatar: Option<String>,
    pub bot: Option<bool>,
    pub global_name: Option<String>,
    pub bio: Option<String>,
    pub banner: Option<String>,
    pub accent_color: Option<u32>,
    pub avatar_decoration_data: Option<serde_json::Value>,
    pub premium_type: Option<u8>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscordDM {
    pub id: String,
    #[serde(rename(deserialize = "type", serialize = "channel_type"))]
    pub channel_type: u8,
    pub recipients: Vec<DiscordUser>,
    pub last_message_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscordRelationship {
    pub id: String,
    #[serde(rename(deserialize = "type", serialize = "relationship_type"))]
    pub relationship_type: u8,
    pub user: DiscordUser,
    pub nickname: Option<String>,
}

// --- Commands ---

#[tauri::command]
pub async fn get_relationships(
    account_id: String,
    _state: State<'_, SessionManager>,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordRelationship>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    retry_get(&client, "https://discord.com/api/v10/users/@me/relationships").await
}

#[tauri::command]
pub async fn remove_relationship(
    account_id: String,
    user_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/users/@me/relationships/{}", user_id);
    let bucket = format!("relationship:{}", user_id);
    let (lim, win) = limits::RELATIONSHIP;
    rate_limited_delete(&client, &rl, &url, &bucket, lim, win).await
}

#[tauri::command]
pub async fn block_user(
    account_id: String,
    user_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/users/@me/relationships/{}", user_id);
    let bucket = format!("relationship:{}", user_id);
    let body = serde_json::json!({ "type": 2 });
    let (lim, win) = limits::RELATIONSHIP;
    rate_limited_put_empty(&client, &rl, &url, Some(&body), &bucket, lim, win).await
}

#[tauri::command]
pub async fn set_user_note(
    account_id: String,
    user_id: String,
    note: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/users/@me/notes/{}", user_id);
    let res = client.put(&url).json(&serde_json::json!({ "note": note })).send().await.map_err(|e| e.to_string())?;
    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("HTTP {}", res.status()))
    }
}

#[tauri::command]
pub async fn create_channel_invite(
    account_id: String,
    channel_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/channels/{}/invites", channel_id);
    let payload = serde_json::json!({
        "max_age": 86400,
        "max_uses": 0,
        "temporary": false
    });
    let bucket = format!("invite:{}", channel_id);
    let (lim, win) = limits::INVITE_CREATE;
    rate_limited_post::<serde_json::Value>(&client, &rl, &url, &payload, &bucket, lim, win).await
}

#[tauri::command]
pub async fn fetch_user_profile(
    account_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/users/{}/profile?with_mutual_guilds=true&with_mutual_friends=true", user_id);
    retry_get(&client, &url).await
}

#[tauri::command]
pub async fn start_dm_call(
    account_id: String,
    channel_id: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/channels/{}/call/ring", channel_id);
    
    // Faz o POST para iniciar o ring/call com a API do Discord
    let response = client
        .post(&url)
        .json(&serde_json::json!({ "recipients": null }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Falha ao iniciar call: {}", response.status()));
    }

    Ok(serde_json::json!({ "status": "success" }))
}

#[tauri::command]
pub async fn get_guilds(
    account_id: String,
    _state: State<'_, SessionManager>,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordGuild>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    retry_get(&client, "https://discord.com/api/v10/users/@me/guilds?with_counts=false").await
}

#[tauri::command]
pub async fn get_recent_mentions(
    account_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordMessage>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    // The Discord API endpoint for recent mentions
    retry_get(&client, "https://discord.com/api/v10/users/@me/mentions?limit=25").await
}

#[tauri::command]
pub async fn get_auth_sessions(
    account_id: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    retry_get(&client, "https://discord.com/api/v10/auth/sessions").await
}

#[tauri::command]
pub async fn revoke_auth_session(
    account_id: String,
    session_id_hash: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/auth/sessions/{}", session_id_hash);
    
    // As the API uses POST with a specific payload to revoke or sometimes DELETE.
    // Based on standard discord API, revocation is done via POST to auth/sessions/<id> or DELETE.
    // Testing reveals it is a DELETE.
    let response = client
        .delete(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("Falha ao revogar sessão: {}", err_text));
    }

    Ok(serde_json::json!({ "status": "success" }))
}

#[tauri::command]
pub async fn get_channels(
    account_id: String,
    guild_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordChannel>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    
    // 1. Fetch normal channels
    let url_channels = format!("https://discord.com/api/v10/guilds/{}/channels", guild_id);
    let mut channels: Vec<DiscordChannel> = retry_get(&client, &url_channels).await?;

    // 2. Fetch active threads
    let url_threads = format!("https://discord.com/api/v10/guilds/{}/threads/active", guild_id);
    let threads_resp = retry_get::<serde_json::Value>(&client, &url_threads).await;
    
    // 3. Combine them if threads were fetched successfully
    if let Ok(threads_data) = threads_resp {
        if let Some(threads_array) = threads_data.get("threads").and_then(|t| t.as_array()) {
            for thread_val in threads_array {
                if let Ok(thread_channel) = serde_json::from_value::<DiscordChannel>(thread_val.clone()) {
                    channels.push(thread_channel);
                }
            }
        }
    }

    Ok(channels)
}

#[tauri::command]
pub async fn get_forum_threads(
    account_id: String,
    channel_id: String,
    _guild_id: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    // Busca threads ativos primeiro
    let active_url = format!("https://discord.com/api/v10/guilds/{}/threads/active", _guild_id);
    let active_res = client.get(&active_url)
        .send().await.map_err(|e| e.to_string())?;

    let mut all_threads: Vec<serde_json::Value> = Vec::new();

    if active_res.status().is_success() {
        if let Ok(data) = active_res.json::<serde_json::Value>().await {
            if let Some(threads) = data["threads"].as_array() {
                let channel_threads: Vec<_> = threads.iter()
                    .filter(|t| t["parent_id"].as_str() == Some(&channel_id))
                    .cloned()
                    .collect();
                all_threads.extend(channel_threads);
            }
        }
    }

    // Busca também threads arquivados
    let archived_url = format!("https://discord.com/api/v10/channels/{}/threads/archived/public?limit=100", channel_id);
    if let Ok(archived_res) = client.get(&archived_url).send().await {
        if archived_res.status().is_success() {
            if let Ok(data) = archived_res.json::<serde_json::Value>().await {
                if let Some(threads) = data["threads"].as_array() {
                    // Avoid duplicates
                    let existing_ids: std::collections::HashSet<_> = all_threads.iter()
                        .filter_map(|t| t["id"].as_str().map(|s| s.to_string()))
                        .collect();
                    for t in threads {
                        if let Some(id) = t["id"].as_str() {
                            if !existing_ids.contains(id) {
                                all_threads.push(t.clone());
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({ "threads": all_threads }))
}

#[tauri::command]
pub async fn create_forum_post(
    account_id: String,
    channel_id: String,
    title: String,
    content: String,
    applied_tags: Vec<String>,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let url = format!("https://discord.com/api/v10/channels/{}/threads", channel_id);
    let bucket = format!("forum_post:{}", channel_id);

    let body = serde_json::json!({
        "name": title,
        "auto_archive_duration": 10080,
        "type": 11,
        "message": { "content": content },
        "applied_tags": applied_tags
    });

    let (lim, win) = limits::FORUM_POST;
    rate_limited_post::<serde_json::Value>(&client, &rl, &url, &body, &bucket, lim, win).await
}

#[tauri::command]
pub async fn get_messages(
    account_id: String,
    channel_id: String,
    before: Option<String>,
    after: Option<String>,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordMessage>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let mut url = format!(
        "https://discord.com/api/v10/channels/{}/messages?limit=50",
        channel_id
    );
    if let Some(before_id) = before {
        url.push_str(&format!("&before={}", before_id));
    } else if let Some(after_id) = after {
        url.push_str(&format!("&after={}", after_id));
    }

    retry_get(&client, &url).await
}

#[tauri::command]
pub async fn send_message(
    account_id: String,
    channel_id: String,
    content: String,
    reply_to: Option<String>,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<DiscordMessage, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let mut body = serde_json::json!({ "content": content });
    if let Some(ref_id) = reply_to {
        body["message_reference"] = serde_json::json!({ "message_id": ref_id });
    }

    let url = format!("https://discord.com/api/v10/channels/{}/messages", channel_id);
    let bucket = format!("msg_send:{}", channel_id);
    let (lim, win) = limits::MSG_SEND;
    rate_limited_post::<DiscordMessage>(&client, &rl, &url, &body, &bucket, lim, win).await
}

#[tauri::command]
pub async fn send_message_with_attachment(
    account_id: String,
    channel_id: String,
    content: String,
    reply_to: Option<String>,
    file_name: String,
    file_path: Option<String>,
    file_data: Option<Vec<u8>>,
    app: tauri::AppHandle,
) -> Result<DiscordMessage, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let part = if let Some(path) = file_path {
        let mut file = tokio::fs::File::open(&path).await.map_err(|e| e.to_string())?;
        let metadata = file.metadata().await.map_err(|e| e.to_string())?;
        let total_size = metadata.len();
        
        let app_handle = app.clone();
        let stream = async_stream::stream! {
            let mut buffer = vec![0; 64 * 1024]; // 64 KB chunks
            let mut uploaded: u64 = 0;
            
            loop {
                match tokio::io::AsyncReadExt::read(&mut file, &mut buffer).await {
                    Ok(0) => break,
                    Ok(n) => {
                        uploaded += n as u64;
                        let percentage = if total_size > 0 {
                            (uploaded as f64 / total_size as f64) * 100.0
                        } else {
                            100.0
                        };
                        
                        use tauri::Emitter;
                        let _ = app_handle.emit("upload-progress", serde_json::json!({
                            "progress": percentage,
                            "uploaded": uploaded,
                            "total": total_size
                        }));
                        
                        yield Ok::<bytes::Bytes, std::io::Error>(bytes::Bytes::copy_from_slice(&buffer[..n]));
                    }
                    Err(e) => {
                        yield Err(e);
                        break;
                    }
                }
            }
        };
        
        let body = reqwest::Body::wrap_stream(stream);
        reqwest::multipart::Part::stream_with_length(body, total_size).file_name(file_name)
    } else if let Some(data) = file_data {
        reqwest::multipart::Part::bytes(data).file_name(file_name)
    } else {
        return Err("Nenhum anexo fornecido".to_string());
    };

    let mut form = reqwest::multipart::Form::new().part("files[0]", part);

    let mut payload = serde_json::json!({ "content": content });
    if let Some(ref_id) = reply_to {
        payload["message_reference"] = serde_json::json!({ "message_id": ref_id });
    }
    
    form = form.text("payload_json", payload.to_string());

    let url = format!("https://discord.com/api/v10/channels/{}/messages", channel_id);
    retry_post_multipart(&client, &url, form).await
}

#[tauri::command]
pub async fn send_voice_message(
    account_id: String,
    channel_id: String,
    audio_data: Vec<u8>,
    duration_secs: f64,
    waveform: String,
    reply_to: Option<String>,
    app: tauri::AppHandle,
) -> Result<DiscordMessage, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let part = reqwest::multipart::Part::bytes(audio_data)
        .file_name("voice-message.ogg")
        .mime_str("audio/ogg")
        .unwrap_or_else(|_| reqwest::multipart::Part::bytes(vec![]).file_name("voice-message.ogg"));

    let mut payload = serde_json::json!({
        "flags": 8192,
        "attachments": [
            {
                "id": "0",
                "filename": "voice-message.ogg",
                "duration_secs": duration_secs,
                "waveform": waveform
            }
        ]
    });

    if let Some(ref_id) = reply_to {
        payload["message_reference"] = serde_json::json!({ "message_id": ref_id });
    }

    let form = reqwest::multipart::Form::new()
        .part("files[0]", part)
        .text("payload_json", payload.to_string());

    let url = format!("https://discord.com/api/v10/channels/{}/messages", channel_id);
    retry_post_multipart::<DiscordMessage>(&client, &url, form).await
}

#[tauri::command]
pub async fn edit_message(
    account_id: String,
    channel_id: String,
    message_id: String,
    content: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<DiscordMessage, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/channels/{}/messages/{}", channel_id, message_id);
    let bucket = format!("msg_edit:{}", channel_id);
    let payload = serde_json::json!({ "content": content });
    let (lim, win) = limits::MSG_EDIT;
    rate_limited_patch::<DiscordMessage>(&client, &rl, &url, &payload, &bucket, lim, win).await
}

#[tauri::command]
pub async fn delete_message(
    account_id: String,
    channel_id: String,
    message_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/channels/{}/messages/{}", channel_id, message_id);
    let bucket = format!("msg_delete:{}", channel_id);
    let (lim, win) = limits::MSG_DELETE;
    rate_limited_delete(&client, &rl, &url, &bucket, lim, win).await
}

#[tauri::command]
pub async fn get_dms(
    account_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordDM>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    retry_get(&client, "https://discord.com/api/v10/users/@me/channels").await
}

#[tauri::command]
pub async fn create_dm(
    account_id: String,
    recipient_id: String,
    app: tauri::AppHandle,
) -> Result<DiscordDM, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let payload = serde_json::json!({ "recipient_id": recipient_id });
    
    let res = client.post("https://discord.com/api/v10/users/@me/channels")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to create DM: {}", e))?;
        
    let text = res.text().await.unwrap_or_default();
    serde_json::from_str(&text).map_err(|e| format!("Parse error: {}", e))
}

#[tauri::command]
pub async fn get_user_info(
    account_id: String,
    app: tauri::AppHandle,
) -> Result<DiscordUser, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    retry_get(&client, "https://discord.com/api/v10/users/@me").await
}

#[tauri::command]
pub async fn get_self_profile(
    account_id: String,
    app: tauri::AppHandle,
) -> Result<DiscordUser, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    retry_get(&client, "https://discord.com/api/v10/users/@me").await
}

#[tauri::command]
pub async fn get_gateway_presences(
    account_id: String,
    gateway_manager: tauri::State<'_, GatewayManager>,
) -> Result<Vec<Value>, String> {
    let cache = gateway_manager.cached_presences.lock().unwrap();
    if let Some(list) = cache.get(&account_id) {
        Ok(list.clone())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn set_status(
    account_id: String,
    status: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let body = serde_json::json!({ "status": status });

    let resp = client
        .patch("https://discord.com/api/v10/users/@me/settings")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Erro ao definir status: HTTP {}", resp.status()))
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateProfilePayload {
    pub global_name: Option<String>,
    pub bio: Option<String>,
    pub avatar: Option<String>,
    pub banner: Option<String>,
    pub accent_color: Option<u32>,
}

#[tauri::command]
pub async fn update_user_profile(
    account_id: String,
    payload: UpdateProfilePayload,
    app: tauri::AppHandle,
) -> Result<DiscordUser, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = "https://discord.com/api/v10/users/@me";

    let mut body = serde_json::Map::new();
    if let Some(gn) = payload.global_name {
        body.insert("global_name".to_string(), Value::String(gn));
    }
    if let Some(bio) = payload.bio {
        body.insert("bio".to_string(), Value::String(bio));
    }
    if let Some(av) = payload.avatar {
        if av.is_empty() {
            body.insert("avatar".to_string(), Value::Null);
        } else {
            body.insert("avatar".to_string(), Value::String(av));
        }
    }
    if let Some(bn) = payload.banner {
        if bn.is_empty() {
            body.insert("banner".to_string(), Value::Null);
        } else {
            body.insert("banner".to_string(), Value::String(bn));
        }
    }
    if let Some(ac) = payload.accent_color {
        body.insert("accent_color".to_string(), Value::Number(ac.into()));
    }

    let resp = client
        .patch(url)
        .json(&Value::Object(body))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if status.is_success() {
        serde_json::from_str::<DiscordUser>(&text).map_err(|e| format!("Parse error: {} | body: {}", e, text))
    } else {
        Err(format!("Discord API error {}: {}", status, text))
    }
}

#[derive(Debug, Deserialize)]
pub struct CustomStatusPayload {
    pub text: String,
    pub emoji_name: Option<String>,
    pub emoji_id: Option<String>,
    pub expires_at: Option<String>,
}

#[tauri::command]
pub async fn set_custom_status(
    account_id: String,
    text: String,
    emoji_name: Option<String>,
    emoji_id: Option<String>,
    expires_at: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let mut custom_status = serde_json::json!({ "text": text });
    if let Some(name) = &emoji_name {
        custom_status["emoji_name"] = serde_json::json!(name);
    }
    if let Some(id) = &emoji_id {
        custom_status["emoji_id"] = serde_json::json!(id);
    }
    if let Some(exp) = &expires_at {
        custom_status["expires_at"] = serde_json::json!(exp);
    }

    let body = serde_json::json!({
        "status": "online",
        "custom_status": custom_status
    });

    let resp = client
        .patch("https://discord.com/api/v10/users/@me/settings")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Erro ao definir status personalizado: HTTP {}", resp.status()))
    }
}

#[tauri::command]
pub async fn clear_custom_status(
    account_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let body = serde_json::json!({ "custom_status": null });

    let resp = client
        .patch("https://discord.com/api/v10/users/@me/settings")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Erro ao limpar status personalizado: HTTP {}", resp.status()))
    }
}

#[tauri::command]
pub async fn close_dm(
    account_id: String,
    channel_id: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let url = format!("https://discord.com/api/v10/channels/{}", channel_id);
    let resp = client.delete(&url).send().await.map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        serde_json::from_str(&body_text).map_err(|e| e.to_string())
    } else {
        Err(format!("Falha ao fechar DM: HTTP {}", resp.status()))
    }
}

#[tauri::command]
pub async fn get_pinned_messages(
    account_id: String,
    channel_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordMessage>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let url = format!("https://discord.com/api/v10/channels/{}/pins", channel_id);
    retry_get(&client, &url).await
}

#[tauri::command]
pub async fn pin_message(
    account_id: String,
    channel_id: String,
    message_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/channels/{}/pins/{}", channel_id, message_id);
    let bucket = format!("pin:{}", channel_id);
    let (lim, win) = limits::PIN;
    rate_limited_put_empty(&client, &rl, &url, None, &bucket, lim, win).await
}

#[tauri::command]
pub async fn unpin_message(
    account_id: String,
    channel_id: String,
    message_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/channels/{}/pins/{}", channel_id, message_id);
    let bucket = format!("pin:{}", channel_id);
    let (lim, win) = limits::PIN;
    rate_limited_delete(&client, &rl, &url, &bucket, lim, win).await
}

// --- Retry helpers ---

/// GET with exponential backoff on transient errors (429, 5xx).
async fn retry_get<T>(client: &reqwest::Client, url: &str) -> Result<T, String>
where
    T: for<'de> serde::Deserialize<'de>,
{
    let config = RetryConfig::default();
    let mut last_err = String::new();

    for attempt in 0..config.max_attempts {
        if attempt > 0 {
            let delay = backoff_ms(attempt - 1, &config);
            log::warn!("[discord] GET {} — retry {}/{} after {}ms", url, attempt, config.max_attempts - 1, delay);
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
        }

        let resp = match client.get(url).send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = e.to_string();
                continue;
            }
        };

        let status = resp.status();

        // Honor Retry-After on 429
        if status == 429 {
            let retry_ms = resp.headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<f64>().ok())
                .map(|s| (s * 1000.0) as u64 + 200)
                .unwrap_or_else(|| backoff_ms(attempt, &config));
            log::warn!("[discord] 429 GET {} — waiting {}ms (Retry-After)", url, retry_ms);
            last_err = format!("Rate limited (429) on {}", url);
            tokio::time::sleep(std::time::Duration::from_millis(retry_ms)).await;
            continue;
        }

        let body = resp.text().await.unwrap_or_default();

        if status.is_success() {
            return serde_json::from_str::<T>(&body).map_err(|e| {
                format!("Parse error: {} | body: {}", e, &body[..body.len().min(300)])
            });
        }

        last_err = format!("Discord API error {}: {}", status, &body[..body.len().min(300)]);

        // Only retry on transient server errors
        if !matches!(status.as_u16(), 500 | 502 | 503 | 504) {
            break;
        }
    }

    Err(last_err)
}

/// POST JSON with exponential backoff on transient errors.
async fn retry_post_json<T>(
    client: &reqwest::Client,
    url: &str,
    body: &serde_json::Value,
) -> Result<T, String>
where
    T: for<'de> serde::Deserialize<'de>,
{
    let config = RetryConfig::default();
    let mut last_err = String::new();

    for attempt in 0..config.max_attempts {
        if attempt > 0 {
            let delay = backoff_ms(attempt - 1, &config);
            log::warn!("[discord] POST {} — retry {}/{} after {}ms", url, attempt, config.max_attempts - 1, delay);
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
        }

        let resp = match client.post(url).json(body).send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = e.to_string();
                continue;
            }
        };

        let status = resp.status();

        // Honor Retry-After on 429
        if status == 429 {
            let retry_ms = resp.headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<f64>().ok())
                .map(|s| (s * 1000.0) as u64 + 200)
                .unwrap_or_else(|| backoff_ms(attempt, &config));
            log::warn!("[discord] 429 POST {} — waiting {}ms (Retry-After)", url, retry_ms);
            last_err = format!("Rate limited (429) on {}", url);
            tokio::time::sleep(std::time::Duration::from_millis(retry_ms)).await;
            continue;
        }

        let body_text = resp.text().await.unwrap_or_default();

        if status.is_success() {
            return serde_json::from_str::<T>(&body_text).map_err(|e| {
                format!("Parse error: {} | body: {}", e, &body_text[..body_text.len().min(300)])
            });
        }

        last_err = format!(
            "Discord API error {}: {}",
            status,
            &body_text[..body_text.len().min(300)]
        );

        if !matches!(status.as_u16(), 500 | 502 | 503 | 504) {
            break;
        }
    }

    Err(last_err)
}

/// POST multipart form with exponential backoff on transient errors.
async fn retry_post_multipart<T>(
    client: &reqwest::Client,
    url: &str,
    form: reqwest::multipart::Form,
) -> Result<T, String>
where
    T: for<'de> serde::Deserialize<'de>,
{
    // Since reqwest::multipart::Form cannot be cloned easily if it contains streams, 
    // and we are using raw bytes, we need to recreate the form if we retry.
    // Let's just avoid retrying for file uploads 
    // to keep it simple and avoid memory overhead, or just try once and return.

    let resp = match client.post(url).multipart(form).send().await {
        Ok(r) => r,
        Err(e) => return Err(e.to_string()),
    };

    let status = resp.status();
    let body_text = resp.text().await.unwrap_or_default();

    if status.is_success() {
        return serde_json::from_str::<T>(&body_text).map_err(|e| {
            format!("Parse error: {} | body: {}", e, &body_text[..body_text.len().min(300)])
        });
    }

    Err(format!(
        "Discord API error {}: {}",
        status,
        &body_text[..body_text.len().min(300)]
    ))
}

// --- Internal helpers ---

#[tauri::command]
pub async fn discord_subscribe_guild(
    account_id: String,
    guild_id: String,
    gateway_manager: State<'_, GatewayManager>,
) -> Result<(), String> {
    gateway_manager.subscribe_guild(&account_id, &guild_id).await
}

#[tauri::command]
pub async fn trigger_typing(
    app: tauri::AppHandle,
    account_id: String,
    channel_id: String,
    rl: State<'_, RateLimiter>,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/channels/{}/typing", channel_id);
    let bucket = format!("typing:{}", channel_id);
    // Typing indicator lasts 10 seconds on Discord — send at most 1 per 8s per channel
    let (lim, win) = limits::TYPING;
    // Use a simple rate check: don't fail if rate limited, just skip silently
    rl.acquire(&bucket, lim, win).await;
    let resp = client.post(&url).send().await.map_err(|e| e.to_string())?;
    let _ = resp; // Typing is fire-and-forget: ignore non-success silently
    Ok(())
}

#[tauri::command]
pub async fn send_interaction(
    account_id: String,
    application_id: String,
    channel_id: String,
    guild_id: Option<String>,
    message_id: String,
    session_id: String,
    custom_id: String,
    component_type: u8,
    values: Option<Vec<String>>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = "https://discord.com/api/v9/interactions";

    let mut data = serde_json::json!({
        "component_type": component_type,
        "custom_id": custom_id,
        "type": component_type
    });

    if let Some(v) = values {
        if let Some(obj) = data.as_object_mut() {
            obj.insert("values".to_string(), serde_json::json!(v));
        }
    }

    let payload = serde_json::json!({
        "type": 3,
        "nonce": format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()),
        "guild_id": guild_id,
        "channel_id": channel_id,
        "message_flags": 0,
        "message_id": message_id,
        "application_id": application_id,
        "session_id": session_id,
        "data": data
    });

    let resp = client.post(url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok(serde_json::json!({ "status": "success" }))
    } else {
        let text = resp.text().await.unwrap_or_default();
        Err(format!("Falha ao enviar interação: {}", text))
    }
}

pub(crate) fn get_token(account_id: &str, app: &tauri::AppHandle) -> Result<String, String> {
    let accounts = load_accounts_from_store(app)?;
    let account = accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Conta não encontrada.")?;

    storage::decrypt_token(&account.token_encrypted)
        .map_err(|e| format!("Erro ao descriptografar token: {}", e))
}

#[tauri::command]
pub async fn search_messages(
    account_id: String,
    guild_id: Option<String>,
    channel_id: Option<String>,
    query: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let url = if let Some(g) = guild_id {
        format!("https://discord.com/api/v10/guilds/{}/messages/search?content={}", g, urlencoding::encode(&query))
    } else if let Some(c) = channel_id {
        format!("https://discord.com/api/v10/channels/{}/messages/search?content={}", c, urlencoding::encode(&query))
    } else {
        return Err("Must provide guild_id or channel_id".into());
    };

    retry_get(&client, &url).await
}

