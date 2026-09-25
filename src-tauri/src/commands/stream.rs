use crate::commands::stream_transport::{run_stream_connection, StreamTransportParams};
use crate::commands::voice::VoiceManager;
use crate::gateway::GatewayManager;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{watch, Mutex};
use zeroize::Zeroizing;

const STREAM_ALLOCATION_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamStatusEvent {
    account_id: String,
    attempt_id: String,
    status: &'static str,
    stage: String,
    stream_key: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamPreviewEvent {
    account_id: String,
    attempt_id: String,
    sequence: u64,
    mime_type: &'static str,
    data_base64: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PendingUpdate {
    Applied,
    Waiting,
    Ignored,
}

struct PendingStreamConnection {
    attempt_id: String,
    user_id: String,
    stream_key: String,
    voice_session_id: String,
    rtc_server_id: Option<String>,
    rtc_channel_id: Option<String>,
    endpoint: Option<String>,
    token: Option<Zeroizing<String>>,
}

impl PendingStreamConnection {
    fn apply_stream_create(&mut self, data: &Value) -> PendingUpdate {
        if data["stream_key"].as_str() != Some(self.stream_key.as_str()) {
            return PendingUpdate::Ignored;
        }
        let Some(server_id) = data["rtc_server_id"]
            .as_str()
            .filter(|value| !value.is_empty())
        else {
            return PendingUpdate::Waiting;
        };
        let Some(channel_id) = data["rtc_channel_id"]
            .as_str()
            .filter(|value| !value.is_empty())
        else {
            return PendingUpdate::Waiting;
        };
        self.rtc_server_id = Some(server_id.to_owned());
        self.rtc_channel_id = Some(channel_id.to_owned());
        PendingUpdate::Applied
    }

    fn apply_stream_server(&mut self, data: &Value) -> PendingUpdate {
        if data["stream_key"].as_str() != Some(self.stream_key.as_str()) {
            return PendingUpdate::Ignored;
        }

        if let Some(token) = data["token"].as_str().filter(|value| !value.is_empty()) {
            self.token = Some(Zeroizing::new(token.to_owned()));
        }
        if let Some(endpoint) = data["endpoint"].as_str().filter(|value| !value.is_empty()) {
            self.endpoint = Some(endpoint.to_owned());
        }

        if self.endpoint.is_some() && self.token.is_some() {
            PendingUpdate::Applied
        } else {
            PendingUpdate::Waiting
        }
    }

    fn is_ready(&self) -> bool {
        self.rtc_server_id.is_some()
            && self.rtc_channel_id.is_some()
            && self.endpoint.is_some()
            && self.token.is_some()
    }
}

struct AllocatedStreamConnection {
    attempt_id: String,
    stream_key: String,
    cancel: watch::Sender<bool>,
}

pub struct StreamManager {
    pending: Mutex<HashMap<String, PendingStreamConnection>>,
    allocated: Mutex<HashMap<String, AllocatedStreamConnection>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartScreenShareRequest {
    account_id: String,
    guild_id: Option<String>,
    channel_id: String,
    user_id: String,
}

impl StreamManager {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            allocated: Mutex::new(HashMap::new()),
        }
    }

    async fn clear_local(&self, account_id: &str) -> Option<String> {
        if let Some(pending) = self.pending.lock().await.remove(account_id) {
            log::info!(
                "[stream][allocation] account={} attempt={} action=cancel_pending",
                account_id,
                pending.attempt_id
            );
            return Some(pending.stream_key);
        }
        if let Some(active) = self.allocated.lock().await.remove(account_id) {
            log::info!(
                "[stream][connection] account={} attempt={} action=cancel_allocated",
                account_id,
                active.attempt_id
            );
            let _ = active.cancel.send(true);
            return Some(active.stream_key);
        }
        None
    }

    async fn maybe_allocate(&self, account_id: &str, app: &AppHandle) {
        let ready = {
            let mut pending = self.pending.lock().await;
            let Some(current) = pending.get(account_id) else {
                return;
            };
            log::info!(
                "[stream][allocation] account={} attempt={} state=pending rtc_server={} rtc_channel={} token={} endpoint={}",
                account_id,
                current.attempt_id,
                current.rtc_server_id.is_some(),
                current.rtc_channel_id.is_some(),
                current.token.is_some(),
                current.endpoint.is_some()
            );
            if !current.is_ready() {
                return;
            }
            pending.remove(account_id)
        };

        let Some(mut ready) = ready else { return };
        let Some(rtc_server_id) = ready.rtc_server_id.take() else {
            return;
        };
        let Some(rtc_channel_id) = ready.rtc_channel_id.take() else {
            return;
        };
        let Some(endpoint) = ready.endpoint.take() else {
            return;
        };
        let Some(token) = ready.token.take() else {
            return;
        };
        let (cancel, _cancel_rx) = watch::channel(false);
        let attempt_id = ready.attempt_id.clone();
        let stream_key = ready.stream_key.clone();

        let params = StreamTransportParams {
            account_id: account_id.to_owned(),
            attempt_id: attempt_id.clone(),
            stream_key: stream_key.clone(),
            user_id: ready.user_id,
            voice_session_id: ready.voice_session_id,
            rtc_server_id,
            rtc_channel_id,
            endpoint,
            token,
        };
        self.allocated.lock().await.insert(
            account_id.to_owned(),
            AllocatedStreamConnection {
                attempt_id: ready.attempt_id,
                stream_key: ready.stream_key,
                cancel,
            },
        );

        log::info!(
            "[stream][allocation] account={} attempt={} state=allocated",
            account_id,
            attempt_id
        );
        emit_stream_status(
            app,
            account_id,
            &attempt_id,
            "allocated",
            "Servidor de compartilhamento alocado. Preparando transporte...",
            Some(stream_key),
        );

        let task_account = account_id.to_owned();
        let task_attempt = attempt_id.clone();
        let task_app = app.clone();
        tokio::spawn(async move {
            let result = run_stream_connection(params, _cancel_rx, task_app.clone()).await;
            let manager = task_app.state::<StreamManager>();
            let mut allocated = manager.allocated.lock().await;
            let orphaned_stream = if allocated
                .get(&task_account)
                .is_some_and(|item| item.attempt_id == task_attempt)
            {
                allocated.remove(&task_account).map(|item| item.stream_key)
            } else {
                None
            };
            drop(allocated);
            if let Some(stream_key) = orphaned_stream {
                let gateway = task_app.state::<GatewayManager>();
                if let Err(error) = gateway.stop_stream(&task_account, stream_key).await {
                    log::warn!(
                        "[stream][connection] account={} attempt={} action=cleanup_failed detail={}",
                        task_account,
                        task_attempt,
                        error
                    );
                }
            }
            match result {
                Ok(()) => emit_stream_status(
                    &task_app,
                    &task_account,
                    &task_attempt,
                    "idle",
                    "Compartilhamento encerrado",
                    None,
                ),
                Err(error) => {
                    log::error!(
                        "[stream][connection] account={} attempt={} state=error detail={}",
                        task_account,
                        task_attempt,
                        error
                    );
                    emit_stream_status(
                        &task_app,
                        &task_account,
                        &task_attempt,
                        "error",
                        &error,
                        None,
                    );
                }
            }
        });
    }
}

#[tauri::command]
pub async fn start_screen_share(
    request: StartScreenShareRequest,
    streams: State<'_, StreamManager>,
    voices: State<'_, VoiceManager>,
    gateway: State<'_, GatewayManager>,
    app: AppHandle,
) -> Result<String, String> {
    let StartScreenShareRequest {
        account_id,
        guild_id,
        channel_id,
        user_id,
    } = request;
    if account_id.is_empty()
        || guild_id.as_deref().is_some_and(str::is_empty)
        || channel_id.is_empty()
        || user_id.is_empty()
    {
        return Err("Parâmetros de compartilhamento inválidos".into());
    }

    let voice = voices
        .active_session(&account_id)
        .await
        .ok_or("Entre em um canal de voz antes de compartilhar a tela")?;
    let expected_server_id = guild_id.as_deref().unwrap_or(&channel_id);
    if voice.server_id != expected_server_id
        || voice.channel_id != channel_id
        || voice.user_id != user_id
    {
        return Err("A chamada ativa não corresponde ao canal selecionado".into());
    }

    if let Some(old_key) = streams.clear_local(&account_id).await {
        let _ = gateway.stop_stream(&account_id, old_key).await;
    }

    let attempt_id = uuid::Uuid::new_v4().to_string();
    let stream_key = stream_key(guild_id.as_deref(), &channel_id, &user_id);
    streams.pending.lock().await.insert(
        account_id.clone(),
        PendingStreamConnection {
            attempt_id: attempt_id.clone(),
            user_id,
            stream_key: stream_key.clone(),
            voice_session_id: voice.session_id,
            rtc_server_id: None,
            rtc_channel_id: None,
            endpoint: None,
            token: None,
        },
    );

    emit_stream_status(
        &app,
        &account_id,
        &attempt_id,
        "allocating",
        "Solicitando servidor de compartilhamento...",
        Some(stream_key.clone()),
    );
    log::info!(
        "[stream][allocation] account={} attempt={} action=request channel={}",
        account_id,
        attempt_id,
        channel_id
    );

    if let Err(error) = gateway
        .start_stream(&account_id, guild_id, channel_id, stream_key.clone())
        .await
    {
        streams.pending.lock().await.remove(&account_id);
        return Err(error);
    }

    let timeout_account = account_id.clone();
    let timeout_attempt = attempt_id.clone();
    tokio::spawn(async move {
        tokio::time::sleep(STREAM_ALLOCATION_TIMEOUT).await;
        let manager = app.state::<StreamManager>();
        let timed_out = {
            let mut pending = manager.pending.lock().await;
            if pending
                .get(&timeout_account)
                .is_some_and(|item| item.attempt_id == timeout_attempt)
            {
                pending.remove(&timeout_account)
            } else {
                None
            }
        };
        if let Some(pending) = timed_out {
            log::warn!(
                "[stream][allocation] account={} attempt={} state=timeout",
                timeout_account,
                timeout_attempt
            );
            emit_stream_status(
                &app,
                &timeout_account,
                &timeout_attempt,
                "error",
                "O Discord não alocou o servidor de compartilhamento a tempo.",
                Some(pending.stream_key.clone()),
            );
            let gateway = app.state::<GatewayManager>();
            let _ = gateway
                .stop_stream(&timeout_account, pending.stream_key)
                .await;
        }
    });

    Ok(attempt_id)
}

#[tauri::command]
pub async fn stop_screen_share(
    account_id: String,
    streams: State<'_, StreamManager>,
    gateway: State<'_, GatewayManager>,
    app: AppHandle,
) -> Result<(), String> {
    let stream_key = streams.clear_local(&account_id).await;
    if let Some(stream_key) = stream_key {
        gateway.stop_stream(&account_id, stream_key).await?;
    }
    emit_stream_status(
        &app,
        &account_id,
        "",
        "idle",
        "Compartilhamento encerrado",
        None,
    );
    Ok(())
}

pub async fn handle_gateway_stream_create(app: &AppHandle, account_id: &str, data: &Value) {
    let manager = app.state::<StreamManager>();
    let status = {
        let mut pending = manager.pending.lock().await;
        pending.get_mut(account_id).map(|item| {
            let update = item.apply_stream_create(data);
            (item.attempt_id.clone(), item.stream_key.clone(), update)
        })
    };
    if let Some((attempt_id, stream_key, update)) = status {
        match update {
            PendingUpdate::Applied => emit_stream_status(
                app,
                account_id,
                &attempt_id,
                "allocating",
                "Stream criado. Aguardando credenciais do servidor...",
                Some(stream_key),
            ),
            PendingUpdate::Waiting => log::warn!(
                "[stream][allocation] account={} attempt={} event=STREAM_CREATE rtc_server=missing",
                account_id,
                attempt_id
            ),
            PendingUpdate::Ignored => log::debug!(
                "[stream][allocation] account={} attempt={} event=STREAM_CREATE action=ignore_other_stream",
                account_id,
                attempt_id
            ),
        }
    }
    manager.maybe_allocate(account_id, app).await;
}

pub async fn handle_gateway_stream_server(app: &AppHandle, account_id: &str, data: &Value) {
    let manager = app.state::<StreamManager>();
    let status = {
        let mut pending = manager.pending.lock().await;
        pending.get_mut(account_id).map(|item| {
            let update = item.apply_stream_server(data);
            (item.attempt_id.clone(), item.stream_key.clone(), update)
        })
    };
    if let Some((attempt_id, stream_key, update)) = status {
        match update {
            PendingUpdate::Applied => emit_stream_status(
                app,
                account_id,
                &attempt_id,
                "allocating",
                "Credenciais recebidas. Finalizando alocação...",
                Some(stream_key),
            ),
            PendingUpdate::Waiting => emit_stream_status(
                app,
                account_id,
                &attempt_id,
                "allocating",
                "O Discord ainda está alocando o servidor de compartilhamento...",
                Some(stream_key),
            ),
            PendingUpdate::Ignored => log::debug!(
                "[stream][allocation] account={} attempt={} event=STREAM_SERVER_UPDATE action=ignore_other_stream",
                account_id,
                attempt_id
            ),
        }
    }
    manager.maybe_allocate(account_id, app).await;
}

fn stream_key(guild_id: Option<&str>, channel_id: &str, user_id: &str) -> String {
    match guild_id {
        Some(guild_id) => format!("guild:{guild_id}:{channel_id}:{user_id}"),
        None => format!("call:{channel_id}:{user_id}"),
    }
}

pub(crate) fn emit_stream_status(
    app: &AppHandle,
    account_id: &str,
    attempt_id: &str,
    status: &'static str,
    stage: &str,
    stream_key: Option<String>,
) {
    let _ = app.emit(
        "screen-share-status",
        StreamStatusEvent {
            account_id: account_id.to_owned(),
            attempt_id: attempt_id.to_owned(),
            status,
            stage: stage.to_owned(),
            stream_key,
        },
    );
}

pub(crate) fn emit_stream_preview(
    app: &AppHandle,
    account_id: &str,
    attempt_id: &str,
    sequence: u64,
    data_base64: String,
) {
    let _ = app.emit(
        "screen-share-preview",
        StreamPreviewEvent {
            account_id: account_id.to_owned(),
            attempt_id: attempt_id.to_owned(),
            sequence,
            mime_type: "image/jpeg",
            data_base64,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn pending() -> PendingStreamConnection {
        PendingStreamConnection {
            attempt_id: "attempt".into(),
            user_id: "3".into(),
            stream_key: "guild:1:2:3".into(),
            voice_session_id: "session".into(),
            rtc_server_id: None,
            rtc_channel_id: None,
            endpoint: None,
            token: None,
        }
    }

    #[test]
    fn builds_guild_stream_key() {
        assert_eq!(stream_key(Some("1"), "2", "3"), "guild:1:2:3");
    }

    #[test]
    fn builds_dm_call_stream_key() {
        assert_eq!(stream_key(None, "2", "3"), "call:2:3");
    }

    #[test]
    fn accepts_allocation_events_in_any_order() {
        let mut value = pending();
        assert_eq!(
            value.apply_stream_server(&json!({
                "stream_key": "guild:1:2:3",
                "endpoint": "voice.example.test",
                "token": "temporary"
            })),
            PendingUpdate::Applied
        );
        assert!(!value.is_ready());
        assert_eq!(
            value.apply_stream_create(&json!({
                "stream_key": "guild:1:2:3",
                "rtc_server_id": "42",
                "rtc_channel_id": "43"
            })),
            PendingUpdate::Applied
        );
        assert!(value.is_ready());
    }

    #[test]
    fn preserves_credentials_when_endpoint_is_temporarily_null() {
        let mut value = pending();
        assert_eq!(
            value.apply_stream_server(&json!({
                "stream_key": "guild:1:2:3",
                "endpoint": null,
                "token": "temporary"
            })),
            PendingUpdate::Waiting
        );
        assert!(value.token.is_some());
        assert!(value.endpoint.is_none());
    }

    #[test]
    fn null_endpoint_does_not_erase_a_valid_allocation() {
        let mut value = pending();
        value.apply_stream_server(&json!({
            "stream_key": "guild:1:2:3",
            "endpoint": "voice.example.test",
            "token": "temporary"
        }));
        value.apply_stream_server(&json!({
            "stream_key": "guild:1:2:3",
            "endpoint": null,
            "token": "temporary"
        }));
        assert_eq!(value.endpoint.as_deref(), Some("voice.example.test"));
        assert!(value.token.is_some());
    }

    #[test]
    fn ignores_events_for_another_stream() {
        let mut value = pending();
        assert_eq!(
            value.apply_stream_create(&json!({
            "stream_key": "guild:9:9:9",
            "rtc_server_id": "42",
            "rtc_channel_id": "43"
            })),
            PendingUpdate::Ignored
        );
        assert!(value.rtc_server_id.is_none());
    }
}
