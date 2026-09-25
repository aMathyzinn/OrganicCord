use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{connect_async_tls_with_config, tungstenite::Message};
use zeroize::Zeroizing;

// ─── Gateway opcodes ─────────────────────────────────────────────────────────

const OP_DISPATCH: u8 = 0;
const OP_HEARTBEAT: u8 = 1;
const OP_IDENTIFY: u8 = 2;
const OP_PRESENCE_UPDATE: u8 = 3;
const OP_RESUME: u8 = 6;
const OP_RECONNECT: u8 = 7;
const OP_INVALID_SESSION: u8 = 9;
const OP_HELLO: u8 = 10;
const OP_HEARTBEAT_ACK: u8 = 11;
const OP_STREAM_CREATE: u8 = 18;
const OP_STREAM_DELETE: u8 = 19;
const OP_STREAM_SET_PAUSED: u8 = 22;
const OP_QOS_HEARTBEAT: u8 = 40;
const QOS_HEARTBEAT_VERSION: u8 = 27;

pub(crate) fn gateway_heartbeat_payload(sequence: Option<u64>, rtc_connected: bool) -> Value {
    let mut reasons = vec!["foregrounded"];
    if rtc_connected {
        reasons.push("rtc_connected");
    }
    json!({
        "op": OP_QOS_HEARTBEAT,
        "d": {
            "qos": {
                "ver": QOS_HEARTBEAT_VERSION,
                "active": true,
                "reasons": reasons
            },
            "seq": sequence
        }
    })
}

// ─── Gateway intents ────────────────────────────────────────────────────────
// GUILDS = 1 << 0, GUILD_VOICE_STATES = 1 << 7, GUILD_MESSAGES = 1 << 9,
// GUILD_MESSAGE_REACTIONS = 1 << 10, DIRECT_MESSAGES = 1 << 12,
// MESSAGE_CONTENT = 1 << 15
pub(crate) const INTENTS: u64 = (1 << 0) | (1 << 7) | (1 << 9) | (1 << 10) | (1 << 12) | (1 << 15);

// ─── Status type ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum PresenceStatus {
    #[default]
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

// ─── Commands sent TO the gateway task ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomActivity {
    pub text: String,
    pub emoji_name: Option<String>,
    pub emoji_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GameActivity {
    pub name: String,
    pub started_at: i64,
}

#[derive(Debug, Clone)]
struct GatewayPresence {
    status: PresenceStatus,
    custom_activity: Option<CustomActivity>,
    game_activity: Option<GameActivity>,
}

fn activity_payload(presence: &GatewayPresence) -> Vec<Value> {
    let mut activities = Vec::new();
    if let Some(game) = &presence.game_activity {
        activities.push(json!({
            "type": 0,
            "name": game.name,
            "timestamps": { "start": game.started_at }
        }));
    }
    if let Some(custom) = &presence.custom_activity {
        activities.push(json!({
            "type": 4,
            "name": "Custom Status",
            "state": custom.text,
            "emoji": {
                "name": custom.emoji_name.clone().unwrap_or_default(),
                "id": custom.emoji_id.clone().unwrap_or_default()
            }
        }));
    }
    activities
}

pub enum GatewayCommand {
    UpdatePresence {
        status: PresenceStatus,
        activities: Vec<Value>,
    },
    Disconnect,
    JoinVoiceChannel {
        guild_id: Option<String>,
        channel_id: Option<String>,
        self_mute: bool,
        self_deaf: bool,
    },
    StartStream {
        guild_id: Option<String>,
        channel_id: String,
        stream_key: String,
    },
    StopStream {
        stream_key: String,
    },
    SubscribeGuild {
        guild_id: String,
    },
}

// ─── Per-account gateway handle ──────────────────────────────────────────────

pub struct GatewayHandle {
    pub tx: mpsc::Sender<GatewayCommand>,
    pub task: JoinHandle<()>,
    presence: Arc<Mutex<GatewayPresence>>,
}

// ─── Manager ─────────────────────────────────────────────────────────────────

pub struct GatewayManager {
    handles: Arc<Mutex<HashMap<String, GatewayHandle>>>,
    pub cached_presences: Arc<Mutex<HashMap<String, Vec<Value>>>>,
}

fn lock_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| {
        log::error!("[gateway] recovering from a poisoned state lock");
        poisoned.into_inner()
    })
}

impl GatewayManager {
    pub fn new() -> Self {
        Self {
            handles: Arc::new(Mutex::new(HashMap::new())),
            cached_presences: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Connects a gateway session for `account_id` with the given token.
    /// If one already exists, disconnects the old one first.
    pub async fn connect(
        &self,
        account_id: String,
        token: Zeroizing<String>,
        status: PresenceStatus,
        app: tauri::AppHandle,
    ) {
        // Disconnect existing session if any
        self.disconnect_inner(&account_id).await;

        let (tx, rx) = mpsc::channel::<GatewayCommand>(8);
        let presence = Arc::new(Mutex::new(GatewayPresence {
            status: status.clone(),
            custom_activity: None,
            game_activity: None,
        }));
        let acct_id = account_id.clone();
        let cached_pres = self.cached_presences.clone();
        let task = tokio::spawn(gateway_task(
            token,
            rx,
            Some(app),
            acct_id,
            cached_pres,
            presence.clone(),
        ));

        let mut handles = lock_recover(&self.handles);
        handles.insert(account_id, GatewayHandle { tx, task, presence });
    }

    /// Sends a presence update to an existing gateway session.
    pub async fn set_status(&self, account_id: &str, status: PresenceStatus) -> Result<(), String> {
        let (tx, activities) = {
            let mut handles = lock_recover(&self.handles);
            let handle = handles.get_mut(account_id).ok_or("Gateway not connected")?;
            let mut presence = handle
                .presence
                .lock()
                .map_err(|_| "Gateway presence lock poisoned")?;
            presence.status = status.clone();
            (handle.tx.clone(), activity_payload(&presence))
        };
        tx.send(GatewayCommand::UpdatePresence { status, activities })
            .await
            .map_err(|_| "Gateway channel closed".to_string())
    }

    /// Updates the custom activity for a connected gateway session.
    pub async fn set_custom_activity(
        &self,
        account_id: &str,
        activity: Option<CustomActivity>,
    ) -> Result<(), String> {
        let (tx, status, activities) = {
            let mut handles = lock_recover(&self.handles);
            let handle = handles.get_mut(account_id).ok_or("Gateway not connected")?;
            let mut presence = handle
                .presence
                .lock()
                .map_err(|_| "Gateway presence lock poisoned")?;
            presence.custom_activity = activity;
            (
                handle.tx.clone(),
                presence.status.clone(),
                activity_payload(&presence),
            )
        };
        tx.send(GatewayCommand::UpdatePresence { status, activities })
            .await
            .map_err(|_| "Gateway channel closed".to_string())
    }

    /// Sets or clears the detected game while keeping the custom status intact.
    pub async fn set_game_activity(
        &self,
        account_id: &str,
        activity: Option<GameActivity>,
    ) -> Result<(), String> {
        let (tx, status, activities) = {
            let mut handles = lock_recover(&self.handles);
            let handle = handles.get_mut(account_id).ok_or("Gateway not connected")?;
            let mut presence = handle
                .presence
                .lock()
                .map_err(|_| "Gateway presence lock poisoned")?;
            presence.game_activity = activity;
            (
                handle.tx.clone(),
                presence.status.clone(),
                activity_payload(&presence),
            )
        };
        tx.send(GatewayCommand::UpdatePresence { status, activities })
            .await
            .map_err(|_| "Gateway channel closed".to_string())
    }

    /// Subscribes to presences and members of a guild.
    pub async fn subscribe_guild(&self, account_id: &str, guild_id: &str) -> Result<(), String> {
        let tx = {
            let mut handles = lock_recover(&self.handles);
            let handle = handles.get_mut(account_id).ok_or("Gateway not connected")?;
            handle.tx.clone()
        };
        tx.send(GatewayCommand::SubscribeGuild {
            guild_id: guild_id.to_string(),
        })
        .await
        .map_err(|_| "Gateway channel closed".to_string())
    }

    /// Tries to join a voice channel or start a call in a DM.
    pub async fn join_voice_channel(
        &self,
        account_id: &str,
        guild_id: Option<String>,
        channel_id: Option<String>,
        self_mute: bool,
        self_deaf: bool,
    ) -> Result<(), String> {
        let tx = {
            let mut handles = lock_recover(&self.handles);
            let handle = handles.get_mut(account_id).ok_or("Gateway not connected")?;
            handle.tx.clone()
        };
        tx.send(GatewayCommand::JoinVoiceChannel {
            guild_id,
            channel_id,
            self_mute,
            self_deaf,
        })
        .await
        .map_err(|_| "Gateway channel closed".to_string())
    }

    /// Requests a Go Live allocation for an already-connected guild voice session.
    pub async fn start_stream(
        &self,
        account_id: &str,
        guild_id: Option<String>,
        channel_id: String,
        stream_key: String,
    ) -> Result<(), String> {
        let tx = {
            let handles = lock_recover(&self.handles);
            let handle = handles.get(account_id).ok_or("Gateway not connected")?;
            handle.tx.clone()
        };
        tx.send(GatewayCommand::StartStream {
            guild_id,
            channel_id,
            stream_key,
        })
        .await
        .map_err(|_| "Gateway channel closed".to_string())
    }

    /// Stops only the Go Live stream, leaving the voice session connected.
    pub async fn stop_stream(&self, account_id: &str, stream_key: String) -> Result<(), String> {
        let tx = {
            let handles = lock_recover(&self.handles);
            let handle = handles.get(account_id).ok_or("Gateway not connected")?;
            handle.tx.clone()
        };
        tx.send(GatewayCommand::StopStream { stream_key })
            .await
            .map_err(|_| "Gateway channel closed".to_string())
    }

    /// Returns the current status for an account.
    pub fn get_status(&self, account_id: &str) -> Option<PresenceStatus> {
        let handles = lock_recover(&self.handles);
        handles.get(account_id).and_then(|handle| {
            handle
                .presence
                .lock()
                .ok()
                .map(|presence| presence.status.clone())
        })
    }

    /// Disconnects and removes the gateway session for an account.
    pub async fn disconnect(&self, account_id: &str) {
        self.disconnect_inner(account_id).await;
    }

    async fn disconnect_inner(&self, account_id: &str) {
        let handle = {
            let mut handles = lock_recover(&self.handles);
            handles.remove(account_id)
        };
        if let Some(h) = handle {
            let _ = h.tx.send(GatewayCommand::Disconnect).await;
            h.task.abort();
        }
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
    token: Zeroizing<String>,
    mut cmd_rx: mpsc::Receiver<GatewayCommand>,
    app: Option<tauri::AppHandle>,
    account_id: String,
    cached_presences: Arc<Mutex<HashMap<String, Vec<Value>>>>,
    presence: Arc<Mutex<GatewayPresence>>,
) {
    let mut backoff = 1u64;
    let max_backoff = 60u64;

    let mut session_id: Option<String> = None;
    let mut resume_gateway_url: Option<String> = None;
    let mut sequence: Option<u64> = None;

    if let Some(app_handle) = app.as_ref() {
        use tauri::Emitter;
        let _ = app_handle.emit(
            "gateway-status",
            json!({
                "account_id": account_id,
                "status": "reconnecting",
            }),
        );
    }

    'reconnect: loop {
        match run_gateway_session(
            &token,
            &mut cmd_rx,
            &app,
            &account_id,
            &cached_presences,
            &mut session_id,
            &mut resume_gateway_url,
            &mut sequence,
            &presence,
            &mut backoff,
        )
        .await
        {
            GatewayExit::Commanded => {
                log::info!("[gateway] disconnected by command");
                if let Some(app_handle) = app.as_ref() {
                    use tauri::Emitter;
                    let _ = app_handle.emit(
                        "gateway-status",
                        json!({
                            "account_id": account_id,
                            "status": "disconnected",
                        }),
                    );
                }
                break 'reconnect;
            }
            GatewayExit::Error(e) => {
                log::warn!(
                    "[gateway] session error: {} — reconnecting in {}s",
                    e,
                    backoff
                );
                if let Some(app_handle) = app.as_ref() {
                    use tauri::Emitter;
                    let _ = app_handle.emit(
                        "gateway-status",
                        json!({
                            "account_id": account_id,
                            "status": "reconnecting",
                            "message": e,
                        }),
                    );
                }
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
            GatewayExit::ReconnectNow(reason) => {
                log::info!("[gateway] {reason} — reconnecting immediately");
            }
            GatewayExit::Fatal(error) => {
                log::error!("[gateway] fatal session error: {error}");
                if let Some(app_handle) = app.as_ref() {
                    use tauri::Emitter;
                    let _ = app_handle.emit(
                        "gateway-status",
                        json!({
                            "account_id": account_id,
                            "status": "error",
                            "message": error,
                        }),
                    );
                }
                break 'reconnect;
            }
        }
    }
}

enum GatewayExit {
    Commanded,
    ReconnectNow(String),
    Error(String),
    Fatal(String),
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::{
        activity_payload, gateway_heartbeat_payload, CustomActivity, GameActivity, GatewayPresence,
        PresenceStatus,
    };

    #[test]
    fn user_gateway_qos_heartbeat_includes_rtc_reason_and_sequence() {
        let heartbeat = gateway_heartbeat_payload(Some(123), true);
        assert_eq!(heartbeat["op"], 40);
        assert_eq!(heartbeat["d"]["seq"], 123);
        assert_eq!(heartbeat["d"]["qos"]["ver"], 27);
        assert_eq!(heartbeat["d"]["qos"]["active"], true);
        assert_eq!(
            heartbeat["d"]["qos"]["reasons"],
            serde_json::json!(["foregrounded", "rtc_connected"])
        );
    }

    #[test]
    fn game_and_custom_status_are_composed_together() {
        let presence = GatewayPresence {
            status: PresenceStatus::Online,
            game_activity: Some(GameActivity {
                name: "VALORANT".to_string(),
                started_at: 1_700_000_000_000,
            }),
            custom_activity: Some(CustomActivity {
                text: "Em partida".to_string(),
                emoji_name: None,
                emoji_id: None,
            }),
        };

        let activities = activity_payload(&presence);
        assert_eq!(activities.len(), 2);
        assert_eq!(activities[0]["type"], 0);
        assert_eq!(activities[0]["name"], "VALORANT");
        assert_eq!(activities[1]["type"], 4);
        assert_eq!(activities[1]["state"], "Em partida");
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_gateway_session(
    token: &str,
    cmd_rx: &mut mpsc::Receiver<GatewayCommand>,
    app: &Option<tauri::AppHandle>,
    account_id: &str,
    cached_presences: &Arc<Mutex<HashMap<String, Vec<Value>>>>,
    session_id: &mut Option<String>,
    resume_gateway_url: &mut Option<String>,
    sequence: &mut Option<u64>,
    presence: &Arc<Mutex<GatewayPresence>>,
    reconnect_backoff: &mut u64,
) -> GatewayExit {
    let default_url = "wss://gateway.discord.gg/?v=10&encoding=json".to_string();
    let url = resume_gateway_url.as_ref().cloned().unwrap_or(default_url);

    let request = match url.as_str().into_client_request() {
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
    let mut identified = false;
    let mut ack_received = true;
    let mut rtc_connected = false;

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

                        // Update sequence for heartbeats and session resumes
                        if let Some(s) = payload["s"].as_u64() {
                            *sequence = Some(s);
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
                                    tokio::time::sleep(Duration::from_millis(interval)).await;
                                    loop {
                                        if hb_tx2.send(()).await.is_err() { break; }
                                        tokio::time::sleep(Duration::from_millis(interval)).await;
                                    }
                                });

                                let heartbeat = gateway_heartbeat_payload(*sequence, rtc_connected);
                                if ws_tx
                                    .send(Message::Text(heartbeat.to_string()))
                                    .await
                                    .is_err()
                                {
                                    return GatewayExit::Error(
                                        "WS initial QoS heartbeat send failed".into(),
                                    );
                                }
                                ack_received = false;
                                log::debug!("[gateway] initial QoS heartbeat sent");

                                if !identified {
                                    if let (Some(sid), Some(seq)) = (session_id.as_ref(), *sequence) {
                                        // Attempt OP_RESUME (Opcode 6)
                                        let resume_payload = json!({
                                            "op": OP_RESUME,
                                            "d": {
                                                "token": token,
                                                "session_id": sid,
                                                "seq": seq
                                            }
                                        });
                                        let msg = Message::Text(resume_payload.to_string());
                                        if ws_tx.send(msg).await.is_err() {
                                            return GatewayExit::Error("WS send resume failed".into());
                                        }
                                        identified = true;
                                        log::info!("[gateway] RESUME sent for session {} at seq {}", sid, seq);
                                    } else {
                                        // Send OP_IDENTIFY (Opcode 2)
                                        let current_presence = presence.lock().map(|snapshot| snapshot.clone()).unwrap_or(GatewayPresence {
                                            status: PresenceStatus::Online,
                                            custom_activity: None,
                                            game_activity: None,
                                        });
                                        let identify = json!({
                                            "op": OP_IDENTIFY,
                                            "d": {
                                                "token": token,
                                                "properties": {
                                                    "os": std::env::consts::OS,
                                                    "browser": "organiccord",
                                                    "device": "organiccord"
                                                },
                                                "intents": INTENTS,
                                                "presence": {
                                                    "status": current_presence.status.as_str(),
                                                    "since": 0,
                                                    "activities": activity_payload(&current_presence),
                                                    "afk": current_presence.status == PresenceStatus::Idle
                                                },
                                                "compress": false
                                            }
                                        });
                                        let msg = Message::Text(identify.to_string());
                                        if ws_tx.send(msg).await.is_err() {
                                            return GatewayExit::Error("WS send identify failed".into());
                                        }
                                        identified = true;
                                        log::info!("[gateway] IDENTIFY sent (status={})", current_presence.status.as_str());
                                    }
                                }
                            }
                            OP_HEARTBEAT_ACK => {
                                ack_received = true;
                                log::debug!("[gateway] heartbeat ACK received");
                            }
                            OP_RECONNECT => {
                                log::info!("[gateway] OP_RECONNECT (Opcode 7) received, reconnecting gracefully...");
                                return GatewayExit::ReconnectNow("Discord requested a reconnect".into());
                            }
                            OP_INVALID_SESSION => {
                                let resumable = payload["d"].as_bool().unwrap_or(false);
                                log::warn!("[gateway] OP_INVALID_SESSION (Opcode 9) received, resumable={}", resumable);
                                if !resumable {
                                    *session_id = None;
                                    *sequence = None;
                                    *resume_gateway_url = None;
                                }
                                let delay = rand::random::<u64>() % 5 + 1;
                                tokio::time::sleep(Duration::from_secs(delay)).await;
                                return GatewayExit::ReconnectNow("Invalid session received".into());
                            }
                            OP_DISPATCH => {
                                let t = payload["t"].as_str().unwrap_or("");
                                if let Some(app_handle) = app {
                                    use tauri::Emitter;
                                    let _ = app_handle.emit("gateway-dispatch", json!({
                                        "account_id": account_id,
                                        "event_type": t,
                                        "data": payload["d"],
                                    }));
                                }
                                if t == "READY" {
                                    log::info!("[gateway] READY received");
                                    use tauri::Emitter;
                                    *reconnect_backoff = 1;

                                    if let Some(app_handle) = app.as_ref() {
                                        let _ = app_handle.emit("gateway-status", json!({
                                            "account_id": account_id,
                                            "status": "connected",
                                        }));
                                    }

                                    if let Some(sid) = payload["d"]["session_id"].as_str() {
                                        *session_id = Some(sid.to_string());
                                        if let Some(app_handle) = app.as_ref() {
                                            let _ = app_handle.emit("gateway-session", serde_json::json!({
                                                "account_id": account_id,
                                                "session_id": sid
                                            }));
                                        }
                                    }

                                    if let Some(res_url) = payload["d"]["resume_gateway_url"].as_str() {
                                        let formatted_url = if res_url.contains("?") {
                                            res_url.to_string()
                                        } else {
                                            format!("{}/?v=10&encoding=json", res_url.trim_end_matches('/'))
                                        };
                                        *resume_gateway_url = Some(formatted_url);
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
                                                let mut cache = lock_recover(cached_presences);
                                                cache.insert(account_id.to_string(), presences.clone());
                                            }
                                            let event_payload = json!({
                                                "account_id": account_id,
                                                "presences": presences
                                            });
                                            let _ = app_handle.emit("gateway-presences", event_payload);
                                        }
                                    }
                                } else if t == "RESUMED" {
                                    *reconnect_backoff = 1;
                                    log::info!("[gateway] Session RESUMED successfully!");
                                    if let Some(app_handle) = app.as_ref() {
                                        use tauri::Emitter;
                                        let _ = app_handle.emit("gateway-status", json!({
                                            "account_id": account_id,
                                            "status": "connected",
                                        }));
                                    }
                                } else if t == "READY_SUPPLEMENTAL" {
                                    log::info!("[gateway] READY_SUPPLEMENTAL received");
                                    use tauri::Emitter;
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
                                                    let mut cache = lock_recover(cached_presences);
                                                    let entry = cache.entry(account_id.to_string()).or_default();
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
                                        crate::commands::voice::handle_gateway_voice_state(
                                            app_handle,
                                            account_id,
                                            &payload["d"],
                                        ).await;
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
                                        crate::commands::voice::handle_gateway_voice_server(
                                            app_handle,
                                            account_id,
                                            &payload["d"],
                                        ).await;
                                        let event_payload = serde_json::json!({
                                            "account_id": account_id,
                                            "data": payload["d"]
                                        });
                                        let _ = app_handle.emit("gateway-voice-server", event_payload);
                                    }
                                } else if t == "STREAM_CREATE" {
                                    log::info!("[gateway][stream] dispatch=STREAM_CREATE");
                                    if let Some(app_handle) = app {
                                        crate::commands::stream::handle_gateway_stream_create(
                                            app_handle,
                                            account_id,
                                            &payload["d"],
                                        ).await;
                                    }
                                } else if t == "STREAM_SERVER_UPDATE" {
                                    log::info!("[gateway][stream] dispatch=STREAM_SERVER_UPDATE");
                                    if let Some(app_handle) = app {
                                        crate::commands::stream::handle_gateway_stream_server(
                                            app_handle,
                                            account_id,
                                            &payload["d"],
                                        ).await;
                                    }
                                } else if t == "PRESENCE_UPDATE" {
                                    {
                                        let user_id = payload["d"]["user"]["id"].as_str()
                                            .or_else(|| payload["d"]["user_id"].as_str())
                                            .unwrap_or("");
                                        if !user_id.is_empty() {
                                            let mut cache = lock_recover(cached_presences);
                                            let list = cache.entry(account_id.to_string()).or_default();
                                            if let Some(pos) = list.iter().position(|p| {
                                                let pid = p["user"]["id"].as_str().or_else(|| p["user_id"].as_str()).unwrap_or("");
                                                pid == user_id
                                            }) {
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
                                        let _ = app_handle.emit("gateway-message", event_payload.clone());
                                    }
                                } else if t == "RELATIONSHIP_ADD" || t == "RELATIONSHIP_REMOVE" {
                                    use tauri::Emitter;
                                    if let Some(app_handle) = app {
                                        let event_payload = json!({
                                            "account_id": account_id,
                                            "event_type": t,
                                            "relationship": payload["d"]
                                        });
                                        let _ = app_handle.emit("gateway-relationship", event_payload);
                                    }
                                }
                            }
                            OP_HEARTBEAT => {
                                // Server-requested heartbeat
                                ack_received = false;
                                let hb = gateway_heartbeat_payload(*sequence, rtc_connected);
                                if ws_tx.send(Message::Text(hb.to_string())).await.is_err() {
                                    return GatewayExit::Error("WS requested heartbeat failed".into());
                                }
                            }
                            _ => {}
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        let code = frame.as_ref().map(|value| u16::from(value.code)).unwrap_or(1006);
                        let reason = frame.as_ref().map(|value| value.reason.as_ref()).unwrap_or("no reason");
                        match code {
                            4004 => return GatewayExit::Fatal("Discord rejected the account token (4004).".into()),
                            4010 => return GatewayExit::Fatal("Discord rejected the gateway shard configuration (4010).".into()),
                            4011 => return GatewayExit::Fatal("Discord requires gateway sharding (4011).".into()),
                            4012 => return GatewayExit::Fatal("Discord rejected Gateway API v10 (4012).".into()),
                            4013 => return GatewayExit::Fatal("Discord rejected the requested gateway intents (4013).".into()),
                            4014 => return GatewayExit::Fatal("Discord disallowed one or more gateway intents (4014).".into()),
                            4003 | 4005 | 4007 | 4009 => {
                                *session_id = None;
                                *sequence = None;
                                *resume_gateway_url = None;
                                return GatewayExit::Error(format!("Gateway closed with code {code}: {reason}"));
                            }
                            _ => return GatewayExit::Error(format!("Gateway closed with code {code}: {reason}")),
                        }
                    }
                    Some(Ok(_)) => {}
                }
            }

            // Heartbeat tick
            _ = hb_rx.recv() => {
                if !ack_received {
                    return GatewayExit::Error("Heartbeat ACK was not received before the next interval".into());
                }
                ack_received = false;
                let hb = gateway_heartbeat_payload(*sequence, rtc_connected);
                if ws_tx.send(Message::Text(hb.to_string())).await.is_err() {
                    return GatewayExit::Error("WS heartbeat send failed".into());
                }
                log::debug!("[gateway] heartbeat sent (seq={:?})", sequence);
            }

            // Command from app
            cmd = cmd_rx.recv() => {
                match cmd {
                    None | Some(GatewayCommand::Disconnect) => {
                        let _ = ws_tx.send(Message::Close(None)).await;
                        return GatewayExit::Commanded;
                    }
                    Some(GatewayCommand::UpdatePresence { status, activities }) => {
                        let presence = json!({
                            "op": OP_PRESENCE_UPDATE,
                            "d": {
                                "status": status.as_str(),
                                "since": null,
                                "activities": activities,
                                "afk": status == PresenceStatus::Idle
                            }
                        });
                        if ws_tx.send(Message::Text(presence.to_string())).await.is_err() {
                            return GatewayExit::Error("WS send presence failed".into());
                        }
                        log::info!("[gateway] presence updated → {}", status.as_str());
                    }
                    Some(GatewayCommand::JoinVoiceChannel {
                        guild_id,
                        channel_id,
                        self_mute,
                        self_deaf,
                    }) => {
                        rtc_connected = channel_id.is_some();
                        let target_kind = if guild_id.is_some() { "guild" } else { "dm" };
                        let action = if channel_id.is_some() { "join" } else { "leave" };
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
                        d.insert("self_mute".to_string(), json!(self_mute));
                        d.insert("self_deaf".to_string(), json!(self_deaf));

                        let payload = json!({
                            "op": 4,
                            "d": d
                        });
                        if ws_tx.send(Message::Text(payload.to_string())).await.is_err() {
                            return GatewayExit::Error("WS send voice state update failed".into());
                        }
                        log::info!(
                            "[gateway][voice] opcode=4 action={} target={}",
                            action,
                            target_kind
                        );
                    }
                    Some(GatewayCommand::StartStream {
                        guild_id,
                        channel_id,
                        stream_key,
                    }) => {
                        let stream_type = if guild_id.is_some() { "guild" } else { "call" };
                        let create = json!({
                            "op": OP_STREAM_CREATE,
                            "d": {
                                "type": stream_type,
                                "guild_id": guild_id,
                                "channel_id": channel_id,
                                "preferred_region": null
                            }
                        });
                        if ws_tx.send(Message::Text(create.to_string())).await.is_err() {
                            return GatewayExit::Error("WS send stream create failed".into());
                        }

                        let unpause = json!({
                            "op": OP_STREAM_SET_PAUSED,
                            "d": {
                                "stream_key": stream_key,
                                "paused": false
                            }
                        });
                        if ws_tx.send(Message::Text(unpause.to_string())).await.is_err() {
                            return GatewayExit::Error("WS send stream unpause failed".into());
                        }
                        log::info!(
                            "[gateway][stream] action=create_sent opcodes={}/{}",
                            OP_STREAM_CREATE,
                            OP_STREAM_SET_PAUSED
                        );
                    }
                    Some(GatewayCommand::StopStream { stream_key }) => {
                        let payload = json!({
                            "op": OP_STREAM_DELETE,
                            "d": { "stream_key": stream_key }
                        });
                        if ws_tx.send(Message::Text(payload.to_string())).await.is_err() {
                            return GatewayExit::Error("WS send stream delete failed".into());
                        }
                        log::info!(
                            "[gateway][stream] action=delete_sent opcode={}",
                            OP_STREAM_DELETE
                        );
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
                        if ws_tx.send(Message::Text(payload.to_string())).await.is_err() {
                            return GatewayExit::Error("WS send guild subscription failed".into());
                        }
                        log::info!("[gateway] guild subscription sent for {}", guild_id);
                    }
                }
            }
        }
    }
}
