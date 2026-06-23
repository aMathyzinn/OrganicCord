use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async_tls_with_config, tungstenite::Message};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

// ─── Gateway opcodes ─────────────────────────────────────────────────────────

const OP_DISPATCH: u8 = 0;
const OP_HEARTBEAT: u8 = 1;
const OP_IDENTIFY: u8 = 2;
const OP_PRESENCE_UPDATE: u8 = 3;
const OP_RESUME: u8 = 6;
const OP_HELLO: u8 = 10;
const OP_HEARTBEAT_ACK: u8 = 11;

// ─── Gateway intents ────────────────────────────────────────────────────────
// GUILDS = 1 << 0, GUILD_MESSAGES = 1 << 9, GUILD_MESSAGE_REACTIONS = 1 << 10,
// DIRECT_MESSAGES = 1 << 12, MESSAGE_CONTENT = 1 << 15
const INTENTS: u64 = (1 << 0) | (1 << 9) | (1 << 10) | (1 << 12) | (1 << 15);

// ─── Max missed heartbeat ACKs before reconnect ──────────────────────────────
const MAX_MISSED_ACKS: u8 = 3;

// ─── Status type ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PresenceStatus {
    Online,
    Idle,
    Dnd,
    Invisible,
}

impl PresenceStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            PresenceStatus::Online => "online",
            PresenceStatus::Idle => "idle",
            PresenceStatus::Dnd => "dnd",
            PresenceStatus::Invisible => "invisible",
        }
    }
}

impl Default for PresenceStatus {
    fn default() -> Self {
        PresenceStatus::Online
    }
}

// ─── Commands sent TO the gateway task ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomActivity {
    pub text: String,
    pub emoji_name: Option<String>,
    pub emoji_id: Option<String>,
}

pub enum GatewayCommand {
    UpdatePresence(PresenceStatus),
    UpdateCustomActivity(Option<CustomActivity>),
    Disconnect,
    JoinVoiceChannel { guild_id: Option<String>, channel_id: Option<String> },
    SubscribeGuild { guild_id: String },
}

// ─── Per-account gateway handle ──────────────────────────────────────────────

pub struct GatewayHandle {
    pub tx: mpsc::Sender<GatewayCommand>,
    pub task: JoinHandle<()>,
    pub current_status: PresenceStatus,
    pub custom_activity: Option<CustomActivity>,
}

// ─── Manager ─────────────────────────────────────────────────────────────────

pub struct GatewayManager {
    handles: Arc<Mutex<HashMap<String, GatewayHandle>>>,
    pub cached_presences: Arc<Mutex<HashMap<String, Vec<Value>>>>,
    app: Option<tauri::AppHandle>,
}

impl GatewayManager {
    pub fn new() -> Self {
        Self {
            handles: Arc::new(Mutex::new(HashMap::new())),
            cached_presences: Arc::new(Mutex::new(HashMap::new())),
            app: None,
        }
    }

    /// Sets the Tauri AppHandle for emitting events to the frontend.
    pub fn set_app(&mut self, app: tauri::AppHandle) {
        self.app = Some(app);
    }

    /// Connects a gateway session for `account_id` with the given token.
    /// If one already exists, disconnects the old one first.
    pub async fn connect(&self, account_id: String, token: String, status: PresenceStatus, app: tauri::AppHandle) {
        // Disconnect existing session if any
        self.disconnect_inner(&account_id).await;

        let (tx, rx) = mpsc::channel::<GatewayCommand>(8);
        let initial_status = status.clone();
        let acct_id = account_id.clone();
        let cached_pres = self.cached_presences.clone();
        let task = tokio::spawn(gateway_task(token, initial_status, rx, Some(app), acct_id, cached_pres));

        let mut handles = self.handles.lock().unwrap();
        handles.insert(account_id, GatewayHandle { tx, task, current_status: status, custom_activity: None });
    }

    /// Sends a presence update to an existing gateway session.
    pub async fn set_status(&self, account_id: &str, status: PresenceStatus) -> Result<(), String> {
        let tx = {
            let mut handles = self.handles.lock().unwrap();
            let handle = handles.get_mut(account_id).ok_or("Gateway not connected")?;
            handle.current_status = status.clone();
            handle.tx.clone()
        };
        tx.send(GatewayCommand::UpdatePresence(status))
            .await
            .map_err(|_| "Gateway channel closed".to_string())
    }

    /// Updates the custom activity for a connected gateway session.
    pub async fn set_custom_activity(&self, account_id: &str, activity: Option<CustomActivity>) -> Result<(), String> {
        let tx = {
            let mut handles = self.handles.lock().unwrap();
            let handle = handles.get_mut(account_id).ok_or("Gateway not connected")?;
            handle.custom_activity = activity.clone();
            handle.tx.clone()
        };
        tx.send(GatewayCommand::UpdateCustomActivity(activity))
            .await
            .map_err(|_| "Gateway channel closed".to_string())
    }

    /// Subscribes to presences and members of a guild.
    pub async fn subscribe_guild(&self, account_id: &str, guild_id: &str) -> Result<(), String> {
        let tx = {
            let mut handles = self.handles.lock().unwrap();
            let handle = handles.get_mut(account_id).ok_or("Gateway not connected")?;
            handle.tx.clone()
        };
        tx.send(GatewayCommand::SubscribeGuild { guild_id: guild_id.to_string() })
            .await
            .map_err(|_| "Gateway channel closed".to_string())
    }

    /// Tries to join a voice channel or start a call in a DM.
    pub async fn join_voice_channel(&self, account_id: &str, guild_id: Option<String>, channel_id: Option<String>) -> Result<(), String> {
        let tx = {
            let mut handles = self.handles.lock().unwrap();
            let handle = handles.get_mut(account_id).ok_or("Gateway not connected")?;
            handle.tx.clone()
        };
        tx.send(GatewayCommand::JoinVoiceChannel { guild_id, channel_id })
            .await
            .map_err(|_| "Gateway channel closed".to_string())
    }

    /// Returns the current status for an account.
    pub fn get_status(&self, account_id: &str) -> Option<PresenceStatus> {
        let handles = self.handles.lock().unwrap();
        handles.get(account_id).map(|h| h.current_status.clone())
    }

    /// Disconnects and removes the gateway session for an account.
    pub async fn disconnect(&self, account_id: &str) {
        self.disconnect_inner(account_id).await;
    }

    async fn disconnect_inner(&self, account_id: &str) {
        let handle = {
            let mut handles = self.handles.lock().unwrap();
            handles.remove(account_id)
        };
        if let Some(h) = handle {
            let _ = h.tx.send(GatewayCommand::Disconnect).await;
            h.task.abort();
        }
    }

    pub fn is_connected(&self, account_id: &str) -> bool {
        let handles = self.handles.lock().unwrap();
        handles.contains_key(account_id)
    }
}

// ─── Gateway task ─────────────────────────────────────────────────────────────
// Runs in background per account. Handles:
//   - HELLO → start heartbeat loop
//   - IDENTIFY with presence
//   - Heartbeat (ACK-aware)
//   - UpdatePresence opcode 3
//   - Auto-reconnect on disconnect (up to 5 attempts, exponential backoff)

async fn gateway_task(
    token: String,
    initial_status: PresenceStatus,
    mut cmd_rx: mpsc::Receiver<GatewayCommand>,
    app: Option<tauri::AppHandle>,
    account_id: String,
    cached_presences: Arc<Mutex<HashMap<String, Vec<Value>>>>,
) {
    let mut backoff = 1u64;
    let max_backoff = 60u64;

    'reconnect: loop {
        match run_gateway_session(&token, &initial_status, &mut cmd_rx, &app, &account_id, &cached_presences).await {
            GatewayExit::Commanded => {
                log::info!("[gateway] disconnected by command");
                break 'reconnect;
            }
            GatewayExit::Error(e) => {
                log::warn!("[gateway] session error: {} — reconnecting in {}s", e, backoff);
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(backoff)) => {}
                    cmd = cmd_rx.recv() => {
                        if matches!(cmd, Some(GatewayCommand::Disconnect) | None) {
                            break 'reconnect;
                        }
                    }
                }
                backoff = (backoff * 2).min(max_backoff);
            }
        }
    }
}

enum GatewayExit {
    Commanded,
    Error(String),
}

async fn run_gateway_session(
    token: &str,
    initial_status: &PresenceStatus,
    cmd_rx: &mut mpsc::Receiver<GatewayCommand>,
    app: &Option<tauri::AppHandle>,
    account_id: &str,
    cached_presences: &Arc<Mutex<HashMap<String, Vec<Value>>>>,
) -> GatewayExit {
    let url = "wss://gateway.discord.gg/?v=10&encoding=json".to_string();
    let request = match url.into_client_request() {
        Ok(r) => r,
        Err(e) => return GatewayExit::Error(e.to_string()),
    };

    let (ws_stream, _) = match connect_async_tls_with_config(request, None, false, None).await {
        Ok(s) => s,
        Err(e) => return GatewayExit::Error(format!("WS connect: {e}")),
    };

    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    // Internal heartbeat channel
    let (hb_tx, mut hb_rx) = mpsc::channel::<()>(1);
    let mut sequence: Option<u64> = None;
    let mut identified = false;

    loop {
        tokio::select! {
            // Incoming message from Discord
            msg = ws_rx.next() => {
                match msg {
                    None => return GatewayExit::Error("WS stream closed".into()),
                    Some(Err(e)) => return GatewayExit::Error(format!("WS recv: {e}")),
                    Some(Ok(Message::Text(text))) => {
                        let payload: Value = match serde_json::from_str(&text) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };

                        let op = payload["op"].as_u64().unwrap_or(255) as u8;

                        // Update sequence for heartbeats
                        if let Some(s) = payload["s"].as_u64() {
                            sequence = Some(s);
                        }

                        match op {
                            OP_HELLO => {
                                let heartbeat_interval_ms = payload["d"]["heartbeat_interval"]
                                    .as_u64()
                                    .unwrap_or(41250);

                                // Spawn heartbeat ticker
                                let hb_tx2 = hb_tx.clone();
                                let interval = heartbeat_interval_ms;
                                tokio::spawn(async move {
                                    // Jitter: wait a random fraction of the interval first
                                    let jitter_ms = (interval as f64 * rand::random::<f64>()) as u64;
                                    tokio::time::sleep(Duration::from_millis(jitter_ms)).await;
                                    loop {
                                        if hb_tx2.send(()).await.is_err() { break; }
                                        tokio::time::sleep(Duration::from_millis(interval)).await;
                                    }
                                });

                                if !identified {
                                    // Send IDENTIFY
                                    let identify = json!({
                                        "op": OP_IDENTIFY,
                                        "d": {
                                            "token": token,
                                            "capabilities": 16381,
                                            "properties": {
                                                "os": "Windows",
                                                "browser": "Chrome",
                                                "device": "",
                                                "system_locale": "pt-BR",
                                                "browser_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                                "browser_version": "120.0.0.0",
                                                "os_version": "10",
                                                "release_channel": "stable",
                                                "client_build_number": 257764
                                            },
                                            "presence": {
                                                "status": initial_status.as_str(),
                                                "since": 0,
                                                "activities": [],
                                                "afk": false
                                            },
                                            "compress": false,
                                            "client_state": {
                                                "guild_versions": {},
                                                "highest_last_message_id": "0",
                                                "read_state_version": 0,
                                                "user_guild_settings_version": -1,
                                                "user_settings_version": -1,
                                                "private_channels_version": "0",
                                                "api_code_version": 0
                                            }
                                        }
                                    });
                                    let msg = Message::Text(identify.to_string().into());
                                    if ws_tx.send(msg).await.is_err() {
                                        return GatewayExit::Error("WS send identify failed".into());
                                    }
                                    identified = true;
                                    log::info!("[gateway] IDENTIFY sent (status={})", initial_status.as_str());
                                }
                            }
                            OP_HEARTBEAT_ACK => {
                                log::debug!("[gateway] heartbeat ACK");
                            }
                            OP_DISPATCH => {
                                let t = payload["t"].as_str().unwrap_or("");
                                if t == "READY" {
                                    println!("[gateway] READY received");
                                    use tauri::Emitter;

                                    if let Some(sid) = payload["d"]["session_id"].as_str() {
                                        if let Some(app_handle) = app.as_ref() {
                                            let _ = app_handle.emit("gateway-session", serde_json::json!({
                                                "account_id": account_id,
                                                "session_id": sid
                                            }));
                                        }
                                    }

                                    if let Some(app_handle) = app {
                                        // Emitir guildas que chegam diretamente no READY
                                        if let Some(guilds) = payload["d"]["guilds"].as_array() {
                                            for guild in guilds {
                                                let event_payload = json!({
                                                    "account_id": account_id,
                                                    "guild": guild
                                                });
                                                let _ = app_handle.emit("gateway-guild-create", event_payload);
                                            }
                                        }

                                        if let Some(presences) = payload["d"]["presences"].as_array() {
                                            {
                                                let mut cache = cached_presences.lock().unwrap();
                                                cache.insert(account_id.to_string(), presences.clone());
                                            }
                                            let event_payload = json!({
                                                "account_id": account_id,
                                                "presences": presences
                                            });
                                            let _ = app_handle.emit("gateway-presences", event_payload);
                                        }
                                    }
                                } else if t == "READY_SUPPLEMENTAL" {
                                    println!("[gateway] READY_SUPPLEMENTAL received");
                                    use tauri::Emitter;
                                    println!("[gateway] merged_presences structure: {:?}", payload["d"]["merged_presences"]);
                                    if let Some(app_handle) = app {
                                        if let Some(merged_presences) = payload["d"]["merged_presences"].as_object() {
                                            let mut all_presences = Vec::new();
                                            
                                            if let Some(friends) = merged_presences.get("friends") {
                                                if let Some(arr) = friends.as_array() {
                                                    all_presences.extend(arr.clone());
                                                }
                                            }
                                            
                                            if let Some(guilds) = merged_presences.get("guilds") {
                                                if let Some(guilds_arr) = guilds.as_array() {
                                                    for g_arr in guilds_arr {
                                                        if let Some(arr) = g_arr.as_array() {
                                                            all_presences.extend(arr.clone());
                                                        }
                                                    }
                                                }
                                            }
                                            
                                            if !all_presences.is_empty() {
                                                {
                                                    let mut cache = cached_presences.lock().unwrap();
                                                    let entry = cache.entry(account_id.to_string()).or_insert_with(Vec::new);
                                                    entry.extend(all_presences.clone());
                                                }
                                                let event_payload = serde_json::json!({
                                                    "account_id": account_id,
                                                    "presences": all_presences
                                                });
                                                let _ = app_handle.emit("gateway-presences", event_payload);
                                            }
                                        }
                                    }

                                } else if t == "VOICE_STATE_UPDATE" {
                                    log::info!("[gateway] VOICE_STATE_UPDATE received");
                                    use tauri::Emitter;
                                    if let Some(app_handle) = app {
                                        let event_payload = serde_json::json!({
                                            "account_id": account_id,
                                            "data": payload["d"]
                                        });
                                        let _ = app_handle.emit("gateway-voice-state", event_payload);
                                    }
                                } else if t == "VOICE_SERVER_UPDATE" {
                                    log::info!("[gateway] VOICE_SERVER_UPDATE received");
                                    use tauri::Emitter;
                                    if let Some(app_handle) = app {
                                        let event_payload = serde_json::json!({
                                            "account_id": account_id,
                                            "data": payload["d"]
                                        });
                                        let _ = app_handle.emit("gateway-voice-server", event_payload);
                                    }
                                } else if t == "PRESENCE_UPDATE" {
                                    // println!("[gateway] PRESENCE_UPDATE for {}", payload["d"]["user"]["id"]);
                                    {
                                        let mut cache = cached_presences.lock().unwrap();
                                        if let Some(list) = cache.get_mut(account_id) {
                                            let user_id = payload["d"]["user"]["id"].as_str().unwrap_or("");
                                            if let Some(pos) = list.iter().position(|p| p["user"]["id"].as_str().unwrap_or("") == user_id) {
                                                list[pos] = payload["d"].clone();
                                            } else {
                                                list.push(payload["d"].clone());
                                            }
                                        }
                                    }
                                    use tauri::Emitter;
                                    if let Some(app_handle) = app {
                                        let event_payload = json!({
                                            "account_id": account_id,
                                            "presence": payload["d"]
                                        });
                                        let _ = app_handle.emit("gateway-presence", event_payload);
                                    }
                                } else if t == "GUILD_MEMBER_LIST_UPDATE" {
                                    if let Some(ops) = payload["d"]["ops"].as_array() {
                                        let mut presences = Vec::new();
                                        for op in ops {
                                            if let Some(items) = op["items"].as_array() {
                                                for item in items {
                                                    if let Some(member) = item.get("member") {
                                                        if let Some(presence) = member.get("presence") {
                                                            presences.push(presence.clone());
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        if !presences.is_empty() {
                                            use tauri::Emitter;
                                            if let Some(app_handle) = app {
                                                let event_payload = json!({
                                                    "account_id": account_id,
                                                    "presences": presences
                                                });
                                                let _ = app_handle.emit("gateway-presences", event_payload);
                                            }
                                        }
                                    }
                                } else if t == "GUILD_CREATE" {
                                    use tauri::Emitter;
                                    println!("[gateway] GUILD_CREATE received for guild {}", payload["d"]["id"].as_str().unwrap_or("unknown"));
                                    if let Some(app_handle) = app {
                                        let event_payload = json!({
                                            "account_id": account_id,
                                            "guild": payload["d"]
                                        });
                                        let _ = app_handle.emit("gateway-guild-create", event_payload);
                                    }
                                } else if t == "TYPING_START" {
                                    use tauri::Emitter;
                                    if let Some(app_handle) = app {
                                        let event_payload = json!({
                                            "account_id": account_id,
                                            "typing": payload["d"]
                                        });
                                        let _ = app_handle.emit("gateway-typing-start", event_payload);
                                    }
                                } else if t == "MESSAGE_CREATE" {
                                    use tauri::Emitter;
                                    if let Some(app_handle) = app {
                                        let event_payload = json!({
                                            "account_id": account_id,
                                            "message": payload["d"]
                                        });
                                        let _ = app_handle.emit("gateway-message", event_payload);
                                    }
                                }
                            }
                            OP_HEARTBEAT => {
                                // Server-requested heartbeat
                                let hb = json!({ "op": OP_HEARTBEAT, "d": sequence });
                                let _ = ws_tx.send(Message::Text(hb.to_string().into())).await;
                            }
                            _ => {}
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        return GatewayExit::Error("WS close frame received".into());
                    }
                    Some(Ok(_)) => {}
                }
            }

            // Heartbeat tick
            _ = hb_rx.recv() => {
                let hb = json!({ "op": OP_HEARTBEAT, "d": sequence });
                if ws_tx.send(Message::Text(hb.to_string().into())).await.is_err() {
                    return GatewayExit::Error("WS heartbeat send failed".into());
                }
                log::debug!("[gateway] heartbeat sent");
            }

            // Command from app
            cmd = cmd_rx.recv() => {
                match cmd {
                    None | Some(GatewayCommand::Disconnect) => {
                        let _ = ws_tx.send(Message::Close(None)).await;
                        return GatewayExit::Commanded;
                    }
                    Some(GatewayCommand::UpdatePresence(status)) => {
                        let presence = json!({
                            "op": OP_PRESENCE_UPDATE,
                            "d": {
                                "status": status.as_str(),
                                "since": null,
                                "activities": [],
                                "afk": status == PresenceStatus::Idle
                            }
                        });
                        if ws_tx.send(Message::Text(presence.to_string().into())).await.is_err() {
                            return GatewayExit::Error("WS send presence failed".into());
                        }
                        log::info!("[gateway] presence updated → {}", status.as_str());
                    }
                    Some(GatewayCommand::UpdateCustomActivity(activity)) => {
                        let activities = match &activity {
                            Some(a) => json!([{
                                "type": 4,
                                "name": a.text.clone(),
                                "state": a.text.clone(),
                                "emoji": {
                                    "name": a.emoji_name.clone().unwrap_or_default(),
                                    "id": a.emoji_id.clone().unwrap_or_default()
                                }
                            }]),
                            None => json!([]),
                        };
                        let presence = json!({
                            "op": OP_PRESENCE_UPDATE,
                            "d": {
                                "status": initial_status.as_str(),
                                "since": null,
                                "activities": activities,
                                "afk": false
                            }
                        });
                        if ws_tx.send(Message::Text(presence.to_string().into())).await.is_err() {
                            return GatewayExit::Error("WS send custom activity failed".into());
                        }
                        log::info!("[gateway] custom activity updated");
                    }
                    Some(GatewayCommand::JoinVoiceChannel { guild_id, channel_id }) => {
                        let mut d = serde_json::Map::new();
                        if let Some(g_id) = guild_id {
                            d.insert("guild_id".to_string(), json!(g_id));
                        } else {
                            d.insert("guild_id".to_string(), Value::Null);
                        }
                        
                        if let Some(c_id) = channel_id {
                            d.insert("channel_id".to_string(), json!(c_id));
                        } else {
                            d.insert("channel_id".to_string(), Value::Null);
                        }
                        d.insert("self_mute".to_string(), json!(false));
                        d.insert("self_deaf".to_string(), json!(false));

                        let payload = json!({
                            "op": 4,
                            "d": d
                        });
                        if ws_tx.send(Message::Text(payload.to_string().into())).await.is_err() {
                            return GatewayExit::Error("WS send voice state update failed".into());
                        }
                        log::info!("[gateway] voice state update sent (join channel)");
                    }
                    Some(GatewayCommand::SubscribeGuild { guild_id }) => {
                        let mut d = serde_json::Map::new();
                        d.insert("guild_id".to_string(), json!(guild_id));
                        d.insert("typing".to_string(), json!(true));
                        d.insert("threads".to_string(), json!(true));
                        d.insert("activities".to_string(), json!(true));
                        // Requisitar canais para atualizar quem tá lendo etc (opcional, pode omitir)
                        
                        let payload = json!({
                            "op": 14,
                            "d": d
                        });
                        if ws_tx.send(Message::Text(payload.to_string().into())).await.is_err() {
                            return GatewayExit::Error("WS send guild subscription failed".into());
                        }
                        log::info!("[gateway] guild subscription sent for {}", guild_id);
                    }
                }
            }
        }
    }
}
