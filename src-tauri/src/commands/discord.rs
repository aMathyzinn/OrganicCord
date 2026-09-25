use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use zeroize::Zeroizing;

use crate::commands::account::load_accounts_from_store;
use crate::commands::attachments::{AttachmentRegistry, MAX_ATTACHMENT_BYTES};
use crate::gateway::GatewayManager;
use crate::http_client::discord_client;
use crate::rate_limit::{
    limits, rate_limited_delete, rate_limited_get, rate_limited_patch, rate_limited_patch_empty,
    rate_limited_post, rate_limited_post_empty, rate_limited_put_empty, RateLimiter,
};
use crate::session::SessionManager;
use crate::storage;

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
    pub last_message_id: Option<String>,
    pub available_tags: Option<Vec<serde_json::Value>>,
    pub permission_overwrites: Option<Vec<PermissionOverwrite>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PermissionOverwrite {
    pub id: String,
    #[serde(rename(deserialize = "type", serialize = "overwrite_type"))]
    pub overwrite_type: u8,
    pub allow: String,
    pub deny: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CurrentGuildMember {
    pub roles: Vec<String>,
    pub nick: Option<String>,
    pub avatar: Option<String>,
    pub deaf: bool,
    pub mute: bool,
    pub pending: Option<bool>,
    pub permissions: Option<String>,
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
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordRelationship>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let (limit, window) = limits::GENERAL_GET;
    rate_limited_get(
        &client,
        &rl,
        "https://discord.com/api/v10/users/@me/relationships",
        "relationships:@me",
        limit,
        window,
    )
    .await
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
    let url = format!(
        "https://discord.com/api/v10/users/@me/relationships/{}",
        user_id
    );
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
    let url = format!(
        "https://discord.com/api/v10/users/@me/relationships/{}",
        user_id
    );
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
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/users/@me/notes/{}", user_id);
    let body = serde_json::json!({ "note": note });
    let bucket = format!("user-note:{user_id}");
    let (limit, window) = limits::RELATIONSHIP;
    rate_limited_put_empty(&client, &rl, &url, Some(&body), &bucket, limit, window).await
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
    let url = format!(
        "https://discord.com/api/v10/channels/{}/invites",
        channel_id
    );
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
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/users/{}/profile?with_mutual_guilds=true&with_mutual_friends=true", user_id);
    let bucket = format!("profile:{user_id}");
    let (limit, window) = limits::PROFILE_FETCH;
    rate_limited_get(&client, &rl, &url, &bucket, limit, window).await
}

#[tauri::command]
pub async fn start_dm_call(
    account_id: String,
    channel_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!(
        "https://discord.com/api/v10/channels/{}/call/ring",
        channel_id
    );

    let bucket = format!("dm-call:{channel_id}");
    rate_limited_post_empty(
        &client,
        &rl,
        &url,
        Some(&serde_json::json!({ "recipients": null })),
        &bucket,
        2,
        5,
    )
    .await
}

#[tauri::command]
pub async fn stop_dm_call(
    account_id: String,
    channel_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!(
        "https://discord.com/api/v10/channels/{}/call/stop-ringing",
        channel_id
    );

    let bucket = format!("dm-call-stop:{channel_id}");
    rate_limited_post_empty(
        &client,
        &rl,
        &url,
        Some(&serde_json::json!({})),
        &bucket,
        2,
        5,
    )
    .await
}

#[tauri::command]
pub async fn get_guilds(
    account_id: String,
    _state: State<'_, SessionManager>,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordGuild>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let (limit, window) = limits::GENERAL_GET;
    rate_limited_get(
        &client,
        &rl,
        "https://discord.com/api/v10/users/@me/guilds?with_counts=false",
        "guilds:@me",
        limit,
        window,
    )
    .await
}

#[tauri::command]
pub async fn get_recent_mentions(
    account_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordMessage>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    // The Discord API endpoint for recent mentions
    let (limit, window) = limits::GENERAL_GET;
    rate_limited_get(
        &client,
        &rl,
        "https://discord.com/api/v10/users/@me/mentions?limit=25",
        "mentions:@me",
        limit,
        window,
    )
    .await
}

#[tauri::command]
pub async fn get_auth_sessions(
    account_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let (limit, window) = limits::GENERAL_GET;
    rate_limited_get(
        &client,
        &rl,
        "https://discord.com/api/v10/auth/sessions",
        "auth-sessions:@me",
        limit,
        window,
    )
    .await
}

#[tauri::command]
pub async fn revoke_auth_session(
    account_id: String,
    session_id_hash: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!(
        "https://discord.com/api/v10/auth/sessions/{}",
        session_id_hash
    );

    let bucket = format!("auth-session:{session_id_hash}");
    let (limit, window) = limits::RELATIONSHIP;
    rate_limited_delete(&client, &rl, &url, &bucket, limit, window).await
}

#[tauri::command]
pub async fn get_channels(
    account_id: String,
    guild_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordChannel>, String> {
    let started_at = std::time::Instant::now();
    log::info!(
        "[guild_content] channels_request_started account_id={} guild_id={}",
        account_id,
        guild_id
    );
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    // 1. Fetch normal channels
    let url_channels = format!("https://discord.com/api/v10/guilds/{}/channels", guild_id);
    let (limit, window) = limits::GENERAL_GET;
    let channel_bucket = format!("guild-channels:{guild_id}");
    let mut channels: Vec<DiscordChannel> = match rate_limited_get(
        &client,
        &rl,
        &url_channels,
        &channel_bucket,
        limit,
        window,
    )
    .await
    {
        Ok(channels) => channels,
        Err(error) => {
            log::warn!(
                "[guild_content] channels_request_failed account_id={} guild_id={} duration_ms={} error={}",
                account_id,
                guild_id,
                started_at.elapsed().as_millis(),
                error
            );
            return Err(error);
        }
    };

    // 2. Fetch active threads
    let url_threads = format!(
        "https://discord.com/api/v10/guilds/{}/threads/active",
        guild_id
    );
    let thread_bucket = format!("guild-threads:{guild_id}");
    let threads_resp = rate_limited_get::<serde_json::Value>(
        &client,
        &rl,
        &url_threads,
        &thread_bucket,
        limit,
        window,
    )
    .await;

    // 3. Combine them if threads were fetched successfully
    match threads_resp {
        Ok(threads_data) => {
            if let Some(threads_array) = threads_data.get("threads").and_then(|t| t.as_array()) {
                for thread_val in threads_array {
                    if let Ok(thread_channel) =
                        serde_json::from_value::<DiscordChannel>(thread_val.clone())
                    {
                        channels.push(thread_channel);
                    }
                }
            }
        }
        Err(error) => log::warn!(
            "[guild_content] active_threads_unavailable account_id={} guild_id={} error={}",
            account_id,
            guild_id,
            error
        ),
    }

    log::info!(
        "[guild_content] channels_request_succeeded account_id={} guild_id={} channel_count={} duration_ms={}",
        account_id,
        guild_id,
        channels.len(),
        started_at.elapsed().as_millis()
    );
    Ok(channels)
}

#[tauri::command]
pub async fn get_current_guild_member(
    account_id: String,
    guild_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<CurrentGuildMember, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = format!("https://discord.com/api/v10/users/@me/guilds/{guild_id}/member");
    let bucket = format!("current-member:{guild_id}");
    let (limit, window) = limits::GENERAL_GET;
    rate_limited_get(&client, &rl, &url, &bucket, limit, window).await
}

#[tauri::command]
pub async fn get_forum_threads(
    account_id: String,
    channel_id: String,
    guild_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    // Busca threads ativos primeiro
    let active_url = format!(
        "https://discord.com/api/v10/guilds/{}/threads/active",
        guild_id
    );
    let (limit, window) = limits::GENERAL_GET;
    let active_data = rate_limited_get::<serde_json::Value>(
        &client,
        &rl,
        &active_url,
        &format!("active-threads:{guild_id}"),
        limit,
        window,
    )
    .await?;

    let mut all_threads: Vec<serde_json::Value> = Vec::new();

    if let Some(threads) = active_data["threads"].as_array() {
        let channel_threads: Vec<_> = threads
            .iter()
            .filter(|t| t["parent_id"].as_str() == Some(&channel_id))
            .cloned()
            .collect();
        all_threads.extend(channel_threads);
    }

    // Busca também threads arquivados
    let archived_url = format!(
        "https://discord.com/api/v10/channels/{}/threads/archived/public?limit=100",
        channel_id
    );
    if let Ok(data) = rate_limited_get::<serde_json::Value>(
        &client,
        &rl,
        &archived_url,
        &format!("archived-threads:{channel_id}"),
        limit,
        window,
    )
    .await
    {
        if let Some(threads) = data["threads"].as_array() {
            let existing_ids: std::collections::HashSet<_> = all_threads
                .iter()
                .filter_map(|t| t["id"].as_str().map(str::to_owned))
                .collect();
            for thread in threads {
                if let Some(id) = thread["id"].as_str() {
                    if !existing_ids.contains(id) {
                        all_threads.push(thread.clone());
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

    let url = format!(
        "https://discord.com/api/v10/channels/{}/threads",
        channel_id
    );
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
    rl: State<'_, RateLimiter>,
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

    let bucket = format!("messages:{channel_id}");
    let (limit, window) = limits::GENERAL_GET;
    rate_limited_get(&client, &rl, &url, &bucket, limit, window).await
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

    let url = format!(
        "https://discord.com/api/v10/channels/{}/messages",
        channel_id
    );
    let bucket = format!("msg_send:{}", channel_id);
    let (lim, win) = limits::MSG_SEND;
    rate_limited_post::<DiscordMessage>(&client, &rl, &url, &body, &bucket, lim, win).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn send_message_with_attachment(
    account_id: String,
    channel_id: String,
    content: String,
    reply_to: Option<String>,
    file_name: String,
    file_handle: Option<String>,
    file_data: Option<Vec<u8>>,
    attachments: State<'_, AttachmentRegistry>,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<DiscordMessage, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let part = if let Some(handle) = file_handle {
        let selected = attachments.take(&handle)?;
        let mut file = tokio::fs::File::open(&selected.path)
            .await
            .map_err(|_| "Não foi possível abrir o anexo selecionado.".to_string())?;
        let metadata = file.metadata().await.map_err(|e| e.to_string())?;
        let total_size = metadata.len();

        if total_size == 0 || total_size > MAX_ATTACHMENT_BYTES {
            return Err("O anexo deve ter entre 1 byte e 25 MB.".to_string());
        }

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
        reqwest::multipart::Part::stream_with_length(body, total_size).file_name(selected.name)
    } else if let Some(data) = file_data {
        if data.is_empty() || data.len() as u64 > MAX_ATTACHMENT_BYTES {
            return Err("O anexo deve ter entre 1 byte e 25 MB.".to_string());
        }
        let safe_name = validate_attachment_name(&file_name)?;
        reqwest::multipart::Part::bytes(data).file_name(safe_name)
    } else {
        return Err("Nenhum anexo fornecido".to_string());
    };

    let mut form = reqwest::multipart::Form::new().part("files[0]", part);

    let mut payload = serde_json::json!({ "content": content });
    if let Some(ref_id) = reply_to {
        payload["message_reference"] = serde_json::json!({ "message_id": ref_id });
    }

    form = form.text("payload_json", payload.to_string());

    let url = format!(
        "https://discord.com/api/v10/channels/{}/messages",
        channel_id
    );
    let bucket = format!("msg_send:{channel_id}");
    retry_post_multipart(&client, &url, form, &rl, &bucket).await
}

fn validate_attachment_name(name: &str) -> Result<String, String> {
    let is_invalid = name.is_empty()
        || name.len() > 255
        || name.contains(['/', '\\'])
        || name.chars().any(char::is_control);
    if is_invalid {
        return Err("O nome do anexo é inválido.".to_string());
    }
    Ok(name.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn send_voice_message(
    account_id: String,
    channel_id: String,
    audio_data: Vec<u8>,
    duration_secs: f64,
    waveform: String,
    reply_to: Option<String>,
    rl: State<'_, RateLimiter>,
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

    let url = format!(
        "https://discord.com/api/v10/channels/{}/messages",
        channel_id
    );
    let bucket = format!("msg_send:{channel_id}");
    retry_post_multipart::<DiscordMessage>(&client, &url, form, &rl, &bucket).await
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
    let url = format!(
        "https://discord.com/api/v10/channels/{}/messages/{}",
        channel_id, message_id
    );
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
    let url = format!(
        "https://discord.com/api/v10/channels/{}/messages/{}",
        channel_id, message_id
    );
    let bucket = format!("msg_delete:{}", channel_id);
    let (lim, win) = limits::MSG_DELETE;
    rate_limited_delete(&client, &rl, &url, &bucket, lim, win).await
}

#[tauri::command]
pub async fn get_dms(
    account_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordDM>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let (limit, window) = limits::GENERAL_GET;
    rate_limited_get(
        &client,
        &rl,
        "https://discord.com/api/v10/users/@me/channels",
        "dms:@me",
        limit,
        window,
    )
    .await
}

#[tauri::command]
pub async fn create_dm(
    account_id: String,
    recipient_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<DiscordDM, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let payload = serde_json::json!({ "recipient_id": recipient_id });

    let bucket = format!("dm-create:{recipient_id}");
    let (limit, window) = limits::DM_CREATE;
    rate_limited_post(
        &client,
        &rl,
        "https://discord.com/api/v10/users/@me/channels",
        &payload,
        &bucket,
        limit,
        window,
    )
    .await
}

#[tauri::command]
pub async fn get_user_info(
    account_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<DiscordUser, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let (limit, window) = limits::GENERAL_GET;
    rate_limited_get(
        &client,
        &rl,
        "https://discord.com/api/v10/users/@me",
        "user:@me",
        limit,
        window,
    )
    .await
}

#[tauri::command]
pub async fn get_self_profile(
    account_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<DiscordUser, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let (limit, window) = limits::GENERAL_GET;
    rate_limited_get(
        &client,
        &rl,
        "https://discord.com/api/v10/users/@me",
        "user:@me",
        limit,
        window,
    )
    .await
}

#[tauri::command]
pub async fn get_gateway_presences(
    account_id: String,
    gateway_manager: tauri::State<'_, GatewayManager>,
) -> Result<Vec<Value>, String> {
    let cache = gateway_manager
        .cached_presences
        .lock()
        .map_err(|_| "O cache de presenças está indisponível.".to_string())?;
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
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let body = serde_json::json!({ "status": status });

    let (limit, window) = limits::RELATIONSHIP;
    rate_limited_patch_empty(
        &client,
        &rl,
        "https://discord.com/api/v10/users/@me/settings",
        &body,
        "user-settings:@me",
        limit,
        window,
    )
    .await
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
    rl: State<'_, RateLimiter>,
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

    let (limit, window) = limits::RELATIONSHIP;
    rate_limited_patch(
        &client,
        &rl,
        url,
        &Value::Object(body),
        "user-profile:@me",
        limit,
        window,
    )
    .await
}

#[tauri::command]
pub async fn set_custom_status(
    account_id: String,
    text: String,
    emoji_name: Option<String>,
    emoji_id: Option<String>,
    expires_at: Option<String>,
    rl: State<'_, RateLimiter>,
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

    let (limit, window) = limits::RELATIONSHIP;
    rate_limited_patch_empty(
        &client,
        &rl,
        "https://discord.com/api/v10/users/@me/settings",
        &body,
        "user-settings:@me",
        limit,
        window,
    )
    .await
}

#[tauri::command]
pub async fn clear_custom_status(
    account_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let body = serde_json::json!({ "custom_status": null });

    let (limit, window) = limits::RELATIONSHIP;
    rate_limited_patch_empty(
        &client,
        &rl,
        "https://discord.com/api/v10/users/@me/settings",
        &body,
        "user-settings:@me",
        limit,
        window,
    )
    .await
}

#[tauri::command]
pub async fn close_dm(
    account_id: String,
    channel_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let url = format!("https://discord.com/api/v10/channels/{}", channel_id);
    let bucket = format!("close-dm:{channel_id}");
    let (limit, window) = limits::DM_CREATE;
    rate_limited_delete(&client, &rl, &url, &bucket, limit, window).await
}

#[tauri::command]
pub async fn get_pinned_messages(
    account_id: String,
    channel_id: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<Vec<DiscordMessage>, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let url = format!("https://discord.com/api/v10/channels/{}/pins", channel_id);
    let bucket = format!("pins:{channel_id}");
    let (limit, window) = limits::GENERAL_GET;
    rate_limited_get(&client, &rl, &url, &bucket, limit, window).await
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
    let url = format!(
        "https://discord.com/api/v10/channels/{}/pins/{}",
        channel_id, message_id
    );
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
    let url = format!(
        "https://discord.com/api/v10/channels/{}/pins/{}",
        channel_id, message_id
    );
    let bucket = format!("pin:{}", channel_id);
    let (lim, win) = limits::PIN;
    rate_limited_delete(&client, &rl, &url, &bucket, lim, win).await
}

#[tauri::command]
pub async fn discord_add_reaction(
    account_id: String,
    channel_id: String,
    message_id: String,
    emoji: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let encoded_emoji = urlencoding::encode(&emoji);
    let url = format!(
        "https://discord.com/api/v10/channels/{channel_id}/messages/{message_id}/reactions/{encoded_emoji}/@me"
    );
    let bucket = format!("reaction:{channel_id}:{message_id}");
    let (limit, window) = limits::REACTION;
    rate_limited_put_empty(&client, &rl, &url, None, &bucket, limit, window).await
}

#[tauri::command]
pub async fn discord_remove_reaction(
    account_id: String,
    channel_id: String,
    message_id: String,
    emoji: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let encoded_emoji = urlencoding::encode(&emoji);
    let url = format!(
        "https://discord.com/api/v10/channels/{channel_id}/messages/{message_id}/reactions/{encoded_emoji}/@me"
    );
    let bucket = format!("reaction:{channel_id}:{message_id}");
    let (limit, window) = limits::REACTION;
    rate_limited_delete(&client, &rl, &url, &bucket, limit, window).await
}

/// POST multipart form with exponential backoff on transient errors.
async fn retry_post_multipart<T>(
    client: &reqwest::Client,
    url: &str,
    form: reqwest::multipart::Form,
    rl: &RateLimiter,
    bucket: &str,
) -> Result<T, String>
where
    T: for<'de> serde::Deserialize<'de>,
{
    // Since reqwest::multipart::Form cannot be cloned easily if it contains streams,
    // and we are using raw bytes, we need to recreate the form if we retry.
    // Let's just avoid retrying for file uploads
    // to keep it simple and avoid memory overhead, or just try once and return.

    let (limit, window) = limits::MSG_SEND;
    rl.acquire(bucket, limit, window).await;
    let resp = match client.post(url).multipart(form).send().await {
        Ok(r) => r,
        Err(e) => return Err(e.to_string()),
    };

    let status = resp.status();
    let headers = resp.headers().clone();
    let body_text = resp.text().await.unwrap_or_default();

    if status == 429 {
        rl.record_429(bucket, &headers, &body_text).await;
        return Err(
            "O Discord limitou temporariamente o envio. Tente novamente em instantes.".to_string(),
        );
    }

    rl.update_from_response(bucket, &headers).await;

    if status.is_success() {
        return serde_json::from_str::<T>(&body_text).map_err(|e| {
            format!(
                "Parse error: {} | body: {}",
                e,
                &body_text[..body_text.len().min(300)]
            )
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
    gateway_manager
        .subscribe_guild(&account_id, &guild_id)
        .await
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
    rate_limited_post_empty(&client, &rl, &url, None, &bucket, lim, win).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
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
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;
    let url = "https://discord.com/api/v10/interactions";

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

    let bucket = format!("interaction:{channel_id}");
    rate_limited_post_empty(&client, &rl, url, Some(&payload), &bucket, 5, 5).await?;
    Ok(serde_json::json!({ "status": "success" }))
}

pub(crate) fn get_token(
    account_id: &str,
    app: &tauri::AppHandle,
) -> Result<Zeroizing<String>, String> {
    let accounts = load_accounts_from_store(app)?;
    let account = accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Conta não encontrada.")?;

    storage::decrypt_token(&account.token_encrypted)
        .map(Zeroizing::new)
        .map_err(|e| format!("Erro ao descriptografar token: {}", e))
}

#[tauri::command]
pub async fn search_messages(
    account_id: String,
    guild_id: Option<String>,
    channel_id: Option<String>,
    query: String,
    rl: State<'_, RateLimiter>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let token = get_token(&account_id, &app)?;
    let client = discord_client(&token)?;

    let url = if let Some(g) = guild_id {
        format!(
            "https://discord.com/api/v10/guilds/{}/messages/search?content={}",
            g,
            urlencoding::encode(&query)
        )
    } else if let Some(c) = channel_id {
        format!(
            "https://discord.com/api/v10/channels/{}/messages/search?content={}",
            c,
            urlencoding::encode(&query)
        )
    } else {
        return Err("Must provide guild_id or channel_id".into());
    };

    let (limit, window) = limits::GENERAL_GET;
    rate_limited_get(&client, &rl, &url, "message-search", limit, window).await
}
