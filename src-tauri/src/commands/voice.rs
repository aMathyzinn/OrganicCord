use crate::commands::audio::{
    AudioOutputInfo, AudioPipelineStage, AudioPlaybackEvent, VoiceEncryptionMode,
};
use crate::gateway::GatewayManager;
use davey::{DaveSession, ProposalsOperationType, DAVE_PROTOCOL_VERSION};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::num::NonZeroU16;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::net::UdpSocket;
use tokio::sync::{watch, Mutex};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{connect_async_tls_with_config, tungstenite::Message};
use zeroize::{Zeroize, Zeroizing};

const VOICE_ALLOCATION_TIMEOUT: Duration = Duration::from_secs(30);

fn voice_heartbeat_payload(timestamp: u64, sequence: i64) -> Value {
    json!({
        "op": 3,
        "d": {"t": timestamp, "seq_ack": sequence}
    })
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceStatusEvent {
    account_id: String,
    attempt_id: String,
    status: &'static str,
    stage: String,
    endpoint: Option<String>,
    encrypted: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceMetricsEvent {
    account_id: String,
    attempt_id: String,
    ping_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceAudioStatusEvent {
    account_id: String,
    attempt_id: String,
    status: &'static str,
    requested_device_id: Option<String>,
    active_device_id: Option<String>,
    active_device_name: Option<String>,
    fallback: bool,
    detail: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum VoiceProtocolEvent {
    Hello,
    Ready,
    SessionDescription,
    HeartbeatAck,
    DaveTransitionExecuted,
    Connected,
}

trait VoiceEventSink {
    fn status(
        &self,
        account_id: &str,
        attempt_id: &str,
        status: &'static str,
        stage: &str,
        endpoint: Option<String>,
        encrypted: bool,
    );

    fn metric(&self, account_id: &str, attempt_id: &str, ping_ms: u64);

    fn audio(&self, _account_id: &str, _attempt_id: &str, _event: &AudioPlaybackEvent) {}

    fn protocol(&self, _event: VoiceProtocolEvent) {}

    fn speaking(&self, _account_id: &str, _user_id: &str, _speaking: bool) {}
}

struct TauriVoiceEventSink<'a, R: Runtime> {
    app: &'a AppHandle<R>,
}

impl<R: Runtime> VoiceEventSink for TauriVoiceEventSink<'_, R> {
    fn speaking(&self, account_id: &str, user_id: &str, speaking: bool) {
        let _ = self.app.emit(
            "voice-speaking",
            serde_json::json!({
                "account_id": account_id,
                "user_id": user_id,
                "speaking": speaking,
            }),
        );
    }

    fn status(
        &self,
        account_id: &str,
        attempt_id: &str,
        status: &'static str,
        stage: &str,
        endpoint: Option<String>,
        encrypted: bool,
    ) {
        emit_voice_status(
            self.app, account_id, attempt_id, status, stage, endpoint, encrypted,
        );
    }

    fn metric(&self, account_id: &str, attempt_id: &str, ping_ms: u64) {
        let _ = self.app.emit(
            "voice-metrics",
            VoiceMetricsEvent {
                account_id: account_id.to_owned(),
                attempt_id: attempt_id.to_owned(),
                ping_ms,
            },
        );
    }

    fn audio(&self, account_id: &str, attempt_id: &str, event: &AudioPlaybackEvent) {
        let payload = match event {
            AudioPlaybackEvent::OutputReady(info) => VoiceAudioStatusEvent {
                account_id: account_id.to_owned(),
                attempt_id: attempt_id.to_owned(),
                status: "ready",
                requested_device_id: info.requested_device_id.clone(),
                active_device_id: info.active_device_id.clone(),
                active_device_name: Some(info.active_device_name.clone()),
                fallback: info.fallback,
                detail: None,
            },
            AudioPlaybackEvent::OutputChangeFailed {
                requested_device_id,
                error,
            } => VoiceAudioStatusEvent {
                account_id: account_id.to_owned(),
                attempt_id: attempt_id.to_owned(),
                status: "error",
                requested_device_id: requested_device_id.clone(),
                active_device_id: None,
                active_device_name: None,
                fallback: false,
                detail: Some(error.clone()),
            },
            AudioPlaybackEvent::PipelineProgress(stage) => VoiceAudioStatusEvent {
                account_id: account_id.to_owned(),
                attempt_id: attempt_id.to_owned(),
                status: if *stage == AudioPipelineStage::PcmConsumed {
                    "playing"
                } else {
                    "receiving"
                },
                requested_device_id: None,
                active_device_id: None,
                active_device_name: None,
                fallback: false,
                detail: Some(stage.as_str().to_owned()),
            },
        };
        let _ = self.app.emit("voice-audio-status", payload);
    }
}

struct PendingVoiceConnection {
    attempt_id: String,
    server_id: String,
    channel_id: String,
    user_id: String,
    input_device_id: Option<String>,
    output_device: watch::Sender<Option<String>>,
    krisp_enabled: bool,
    session_id: Option<String>,
    token: Option<Zeroizing<String>>,
    endpoint: Option<String>,
    muted: Arc<AtomicBool>,
    deafened: Arc<AtomicBool>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PendingUpdate {
    Applied,
    Waiting,
    Ignored,
}

impl PendingVoiceConnection {
    fn apply_voice_state(&mut self, data: &Value) -> PendingUpdate {
        if data["user_id"].as_str() != Some(self.user_id.as_str()) {
            return PendingUpdate::Ignored;
        }
        let Some(channel_id) = data["channel_id"].as_str() else {
            return PendingUpdate::Waiting;
        };
        if channel_id != self.channel_id {
            return PendingUpdate::Ignored;
        }
        let Some(session_id) = data["session_id"].as_str().filter(|id| !id.is_empty()) else {
            return PendingUpdate::Waiting;
        };
        self.session_id = Some(session_id.to_owned());
        PendingUpdate::Applied
    }

    fn apply_voice_server(&mut self, data: &Value) -> PendingUpdate {
        if data["guild_id"].as_str() != Some(self.server_id.as_str()) && !data["guild_id"].is_null()
        {
            return PendingUpdate::Ignored;
        }
        if let Some(token) = data["token"].as_str().filter(|token| !token.is_empty()) {
            self.token = Some(Zeroizing::new(token.to_owned()));
        }
        if let Some(endpoint) = data["endpoint"]
            .as_str()
            .map(str::trim)
            .filter(|endpoint| !endpoint.is_empty())
        {
            self.endpoint = Some(endpoint.to_owned());
            PendingUpdate::Applied
        } else {
            PendingUpdate::Waiting
        }
    }

    fn is_allocation_ready(&self) -> bool {
        self.session_id.is_some() && self.token.is_some() && self.endpoint.is_some()
    }
}

struct VoiceConnectionControl {
    attempt_id: String,
    server_id: String,
    channel_id: String,
    user_id: String,
    session_id: String,
    cancel: watch::Sender<bool>,
    muted: Arc<AtomicBool>,
    deafened: Arc<AtomicBool>,
    output_device: watch::Sender<Option<String>>,
}

#[derive(Clone, Debug)]
pub(crate) struct ActiveVoiceSession {
    pub server_id: String,
    pub channel_id: String,
    pub user_id: String,
    pub session_id: String,
}

pub struct VoiceManager {
    pending: Mutex<HashMap<String, PendingVoiceConnection>>,
    connections: Mutex<HashMap<String, VoiceConnectionControl>>,
}

impl VoiceManager {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            connections: Mutex::new(HashMap::new()),
        }
    }

    async fn stop(&self, account_id: &str) {
        if let Some(pending) = self.pending.lock().await.remove(account_id) {
            log::info!(
                "[voice][allocation] account={} attempt={} action=cancel_pending channel={}",
                account_id,
                pending.attempt_id,
                pending.channel_id
            );
        }
        if let Some(control) = self.connections.lock().await.remove(account_id) {
            log::info!(
                "[voice][connection] account={} attempt={} action=cancel_active",
                account_id,
                control.attempt_id
            );
            let _ = control.cancel.send(true);
        }
    }

    pub(crate) async fn active_session(&self, account_id: &str) -> Option<ActiveVoiceSession> {
        self.connections
            .lock()
            .await
            .get(account_id)
            .map(|control| ActiveVoiceSession {
                server_id: control.server_id.clone(),
                channel_id: control.channel_id.clone(),
                user_id: control.user_id.clone(),
                session_id: control.session_id.clone(),
            })
    }

    async fn maybe_start(&self, account_id: &str, app: AppHandle) {
        let params = {
            let mut pending = self.pending.lock().await;
            let Some(value) = pending.get(account_id) else {
                return;
            };
            let has_session = value.session_id.is_some();
            let has_token = value.token.is_some();
            let has_endpoint = value.endpoint.is_some();
            log::info!(
                "[voice][allocation] account={} attempt={} state=pending session={} token={} endpoint={}",
                account_id,
                value.attempt_id,
                has_session,
                has_token,
                has_endpoint
            );
            if !value.is_allocation_ready() {
                return;
            }
            pending.remove(account_id)
        };

        let Some(mut params) = params else { return };
        let Some(session_id) = params.session_id.clone() else {
            log::error!(
                "[voice][connection] account={} attempt={} state=missing_session_after_allocation",
                account_id,
                params.attempt_id
            );
            return;
        };
        let (cancel_tx, cancel_rx) = watch::channel(false);
        self.connections.lock().await.insert(
            account_id.to_string(),
            VoiceConnectionControl {
                cancel: cancel_tx,
                attempt_id: params.attempt_id.clone(),
                server_id: params.server_id.clone(),
                channel_id: params.channel_id.clone(),
                user_id: params.user_id.clone(),
                session_id,
                muted: params.muted.clone(),
                deafened: params.deafened.clone(),
                output_device: params.output_device.clone(),
            },
        );

        let account_id = account_id.to_string();
        let attempt_id = params.attempt_id.clone();
        tokio::spawn(async move {
            log::info!(
                "[voice][connection] account={} attempt={} state=starting_voice_gateway",
                account_id,
                attempt_id
            );
            emit_voice_status(
                &app,
                &account_id,
                &attempt_id,
                "connecting",
                "Negociando transporte de voz seguro...",
                params.endpoint.clone(),
                false,
            );
            let sink = TauriVoiceEventSink { app: &app };
            let result = run_voice_connection(&account_id, &mut params, cancel_rx, &sink).await;
            if let Some(token) = params.token.as_mut() {
                token.zeroize();
            }
            let manager = app.state::<VoiceManager>();
            let mut connections = manager.connections.lock().await;
            if connections
                .get(&account_id)
                .is_some_and(|control| control.attempt_id == attempt_id)
            {
                connections.remove(&account_id);
            }
            drop(connections);
            match result {
                Ok(()) => emit_voice_status(
                    &app,
                    &account_id,
                    &attempt_id,
                    "disconnected",
                    "Desconectado",
                    None,
                    false,
                ),
                Err(error) => {
                    log::error!("[voice] account {account_id}: {error}");
                    emit_voice_status(&app, &account_id, &attempt_id, "error", &error, None, false);
                }
            }
        });
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn prepare_voice_connection(
    account_id: String,
    server_id: String,
    channel_id: String,
    user_id: String,
    input_device_id: Option<String>,
    output_device_id: Option<String>,
    krisp_enabled: Option<bool>,
    muted: Option<bool>,
    deafened: Option<bool>,
    manager: State<'_, VoiceManager>,
    app: AppHandle,
) -> Result<String, String> {
    if account_id.is_empty() || server_id.is_empty() || channel_id.is_empty() || user_id.is_empty()
    {
        return Err("Parâmetros de voz inválidos".into());
    }

    manager.stop(&account_id).await;
    let attempt_id = uuid::Uuid::new_v4().to_string();
    let log_channel_id = channel_id.clone();
    let (output_device, _output_device_rx) = watch::channel(output_device_id);
    manager.pending.lock().await.insert(
        account_id.clone(),
        PendingVoiceConnection {
            attempt_id: attempt_id.clone(),
            server_id,
            channel_id,
            user_id,
            input_device_id,
            output_device,
            krisp_enabled: krisp_enabled.unwrap_or(true),
            session_id: None,
            token: None,
            endpoint: None,
            muted: Arc::new(AtomicBool::new(muted.unwrap_or(false))),
            deafened: Arc::new(AtomicBool::new(deafened.unwrap_or(false))),
        },
    );
    emit_voice_status(
        &app,
        &account_id,
        &attempt_id,
        "connecting",
        "Aguardando alocação do servidor de voz...",
        None,
        false,
    );
    log::info!(
        "[voice][allocation] account={} attempt={} state=waiting channel={}",
        account_id,
        attempt_id,
        log_channel_id
    );

    let timeout_app = app.clone();
    let timeout_account = account_id.clone();
    let timeout_attempt = attempt_id.clone();
    tokio::spawn(async move {
        tokio::time::sleep(VOICE_ALLOCATION_TIMEOUT).await;
        let manager = timeout_app.state::<VoiceManager>();
        let timed_out = {
            let mut pending = manager.pending.lock().await;
            if pending
                .get(&timeout_account)
                .is_some_and(|value| value.attempt_id == timeout_attempt)
            {
                pending.remove(&timeout_account)
            } else {
                None
            }
        };
        if let Some(value) = timed_out {
            let stage = format!(
                "Tempo esgotado na alocação de voz (sessão: {}, token: {}, endpoint: {}). Tente novamente.",
                value.session_id.is_some(),
                value.token.is_some(),
                value.endpoint.is_some()
            );
            log::warn!(
                "[voice][allocation] account={} attempt={} state=timeout session={} token={} endpoint={}",
                timeout_account,
                timeout_attempt,
                value.session_id.is_some(),
                value.token.is_some(),
                value.endpoint.is_some()
            );
            emit_voice_status(
                &timeout_app,
                &timeout_account,
                &timeout_attempt,
                "error",
                &stage,
                None,
                false,
            );
        }
    });

    Ok(attempt_id)
}

#[tauri::command]
pub async fn gateway_join_voice(
    account_id: String,
    guild_id: Option<String>,
    channel_id: Option<String>,
    self_mute: Option<bool>,
    self_deaf: Option<bool>,
    gateway: State<'_, GatewayManager>,
) -> Result<(), String> {
    gateway
        .join_voice_channel(
            &account_id,
            guild_id,
            channel_id,
            self_mute.unwrap_or(false),
            self_deaf.unwrap_or(false),
        )
        .await
}

#[tauri::command]
pub async fn set_voice_controls(
    account_id: String,
    guild_id: Option<String>,
    channel_id: String,
    muted: bool,
    deafened: bool,
    manager: State<'_, VoiceManager>,
    gateway: State<'_, GatewayManager>,
) -> Result<(), String> {
    if let Some(control) = manager.connections.lock().await.get(&account_id) {
        control.muted.store(muted, Ordering::Relaxed);
        control.deafened.store(deafened, Ordering::Relaxed);
    }
    if let Some(pending) = manager.pending.lock().await.get(&account_id) {
        pending.muted.store(muted, Ordering::Relaxed);
        pending.deafened.store(deafened, Ordering::Relaxed);
    }
    gateway
        .join_voice_channel(&account_id, guild_id, Some(channel_id), muted, deafened)
        .await
}

#[tauri::command]
pub async fn set_voice_output_device(
    account_id: String,
    output_device_id: Option<String>,
    manager: State<'_, VoiceManager>,
) -> Result<(), String> {
    if let Some(control) = manager.connections.lock().await.get(&account_id) {
        control.output_device.send_replace(output_device_id);
        return Ok(());
    }
    if let Some(pending) = manager.pending.lock().await.get(&account_id) {
        pending.output_device.send_replace(output_device_id);
        return Ok(());
    }
    Err("Nenhuma chamada ativa para trocar a saída de áudio".into())
}

#[tauri::command]
pub async fn stop_voice_connection(
    account_id: String,
    manager: State<'_, VoiceManager>,
) -> Result<(), String> {
    manager.stop(&account_id).await;
    Ok(())
}

pub async fn handle_gateway_voice_state(app: &AppHandle, account_id: &str, data: &Value) {
    let manager = app.state::<VoiceManager>();
    let mut status = None;
    {
        let mut pending = manager.pending.lock().await;
        if let Some(join) = pending.get_mut(account_id) {
            match join.apply_voice_state(data) {
                PendingUpdate::Waiting => {
                    log::warn!(
                        "[voice][allocation] account={} attempt={} event=voice_state channel=null action=ignore_intermediate",
                        account_id,
                        join.attempt_id
                    );
                }
                PendingUpdate::Applied => {
                    status = Some((
                        join.attempt_id.clone(),
                        allocation_stage(join),
                        join.endpoint.clone(),
                    ));
                }
                PendingUpdate::Ignored => {
                    log::warn!(
                        "[voice][allocation] account={} attempt={} event=voice_state action=ignore_other_channel",
                        account_id,
                        join.attempt_id
                    );
                }
            }
        }
    }
    if let Some((attempt_id, stage, endpoint)) = status {
        emit_voice_status(
            app,
            account_id,
            &attempt_id,
            "connecting",
            stage,
            endpoint,
            false,
        );
    }
    manager.maybe_start(account_id, app.clone()).await;
}

pub async fn handle_gateway_voice_server(app: &AppHandle, account_id: &str, data: &Value) {
    let manager = app.state::<VoiceManager>();
    let mut status = None;
    {
        let mut pending = manager.pending.lock().await;
        if let Some(join) = pending.get_mut(account_id) {
            match join.apply_voice_server(data) {
                PendingUpdate::Waiting => {
                    log::info!(
                        "[voice][allocation] account={} attempt={} event=voice_server endpoint=null action=wait",
                        account_id,
                        join.attempt_id
                    );
                    status = Some((
                        join.attempt_id.clone(),
                        allocation_stage(join),
                        join.endpoint.clone(),
                    ));
                }
                PendingUpdate::Applied => {
                    status = Some((
                        join.attempt_id.clone(),
                        allocation_stage(join),
                        join.endpoint.clone(),
                    ));
                }
                PendingUpdate::Ignored => {
                    log::warn!(
                        "[voice][allocation] account={} attempt={} event=voice_server action=ignore_other_server",
                        account_id,
                        join.attempt_id
                    );
                }
            }
        }
    }
    if let Some((attempt_id, stage, endpoint)) = status {
        emit_voice_status(
            app,
            account_id,
            &attempt_id,
            "connecting",
            stage,
            endpoint,
            false,
        );
    }
    manager.maybe_start(account_id, app.clone()).await;
}

fn allocation_stage(pending: &PendingVoiceConnection) -> &'static str {
    match (
        pending.session_id.is_some(),
        pending.token.is_some(),
        pending.endpoint.is_some(),
    ) {
        (true, true, true) => "Alocação concluída. Abrindo servidor de voz...",
        (false, true, true) => "Servidor alocado. Aguardando sessão de voz...",
        (true, false, _) => "Sessão recebida. Aguardando credenciais do servidor de voz...",
        (_, true, false) => {
            "Credenciais recebidas. O Discord ainda está alocando o servidor de voz..."
        }
        _ => "Aguardando alocação do servidor de voz...",
    }
}

fn emit_voice_status<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    attempt_id: &str,
    status: &'static str,
    stage: &str,
    endpoint: Option<String>,
    encrypted: bool,
) {
    let _ = app.emit(
        "voice-status",
        VoiceStatusEvent {
            account_id: account_id.to_owned(),
            attempt_id: attempt_id.to_owned(),
            status,
            stage: stage.to_owned(),
            endpoint,
            encrypted,
        },
    );
}

async fn send_json<S>(sink: &mut S, payload: Value) -> Result<(), String>
where
    S: futures_util::Sink<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::fmt::Display,
{
    sink.send(Message::Text(payload.to_string()))
        .await
        .map_err(|error| error.to_string())
}

async fn send_key_package<S>(
    sink: &mut S,
    session: &Arc<Mutex<Option<DaveSession>>>,
) -> Result<(), String>
where
    S: futures_util::Sink<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::fmt::Display,
{
    let key_package = {
        let mut lock = session.lock().await;
        lock.as_mut()
            .ok_or("Sessão DAVE não inicializada")?
            .create_key_package()
            .map_err(|error| format!("Falha ao criar pacote DAVE: {error:?}"))?
    };
    let mut payload = Vec::with_capacity(1 + key_package.len());
    payload.push(26);
    payload.extend_from_slice(&key_package);
    sink.send(Message::Binary(payload))
        .await
        .map_err(|error| error.to_string())
}

#[allow(clippy::too_many_arguments)]
async fn start_audio_threads(
    socket: Arc<UdpSocket>,
    target_addr: String,
    ssrc: u32,
    secret_key: Vec<u8>,
    encryption_mode: VoiceEncryptionMode,
    session: Arc<Mutex<Option<DaveSession>>>,
    input_device_id: Option<String>,
    output_device: watch::Receiver<Option<String>>,
    krisp_enabled: bool,
    muted: Arc<AtomicBool>,
    deafened: Arc<AtomicBool>,
    ssrc_users: Arc<Mutex<HashMap<u32, u64>>>,
    cancel: watch::Receiver<bool>,
    speaking_sender: Option<tokio::sync::mpsc::UnboundedSender<bool>>,
) -> Result<(AudioKeepers, AudioOutputInfo), String> {
    let runtime = tokio::runtime::Handle::current();
    let (capture_tx, capture_rx) = std::sync::mpsc::channel();
    let capture_runtime = runtime.clone();
    let capture_socket = socket.clone();
    let capture_session = session.clone();
    let capture_key = secret_key.clone();
    std::thread::spawn(move || {
        let _runtime_guard = capture_runtime.enter();
        match crate::commands::audio::start_audio_capture(
            capture_socket,
            target_addr,
            ssrc,
            capture_key,
            encryption_mode,
            capture_session,
            input_device_id,
            krisp_enabled,
            muted,
            speaking_sender,
        ) {
            Ok(_stream) => {
                let _ = capture_rx.recv();
            }
            Err(error) => log::error!("[audio] Falha na captura: {error}"),
        }
    });

    let (initial_tx, initial_rx) = tokio::sync::oneshot::channel();
    let (playback_events_tx, playback_events_rx) = tokio::sync::mpsc::unbounded_channel();
    std::thread::spawn(move || {
        if let Err(error) = crate::commands::audio::run_audio_playback(
            runtime,
            socket,
            secret_key,
            encryption_mode,
            session,
            output_device,
            ssrc_users,
            deafened,
            cancel,
            initial_tx,
            playback_events_tx,
        ) {
            log::error!("[audio] Falha na reprodução: {error}");
        }
    });

    let initial_info = tokio::time::timeout(Duration::from_secs(5), initial_rx)
        .await
        .map_err(|_| "Tempo esgotado ao abrir a saída de áudio".to_string())?
        .map_err(|_| "A thread de reprodução encerrou durante a inicialização".to_string())??;
    Ok((
        AudioKeepers {
            _capture: capture_tx,
            playback_events: playback_events_rx,
        },
        initial_info,
    ))
}

struct AudioKeepers {
    _capture: std::sync::mpsc::Sender<()>,
    playback_events: tokio::sync::mpsc::UnboundedReceiver<AudioPlaybackEvent>,
}

async fn next_playback_event(keepers: &mut Option<AudioKeepers>) -> Option<AudioPlaybackEvent> {
    match keepers {
        Some(keepers) => keepers.playback_events.recv().await,
        None => std::future::pending().await,
    }
}

async fn run_voice_connection(
    account_id: &str,
    params: &mut PendingVoiceConnection,
    mut cancel: watch::Receiver<bool>,
    events: &impl VoiceEventSink,
) -> Result<(), String> {
    let endpoint = params
        .endpoint
        .as_deref()
        .ok_or("Servidor de voz não informado")?
        .trim_start_matches("wss://")
        .trim_start_matches("https://")
        .trim_end_matches('/')
        .to_owned();
    let url = format!("wss://{endpoint}/?v=8");
    let request = url
        .into_client_request()
        .map_err(|error| error.to_string())?;
    let (stream, _) = tokio::time::timeout(
        Duration::from_secs(15),
        connect_async_tls_with_config(request, None, false, None),
    )
    .await
    .map_err(|_| "Tempo esgotado ao conectar ao servidor de voz".to_string())?
    .map_err(|error| format!("Falha ao conectar ao servidor de voz: {error}"))?;
    let (mut ws_tx, mut ws_rx) = stream.split();

    let dave_session = Arc::new(Mutex::new(None::<DaveSession>));
    let ssrc_users = Arc::new(Mutex::new(HashMap::<u32, u64>::new()));
    let mut expected_users = HashSet::<u64>::new();
    expected_users.insert(
        params
            .user_id
            .parse::<u64>()
            .map_err(|_| "ID de usuário inválido")?,
    );
    let mut udp_socket: Option<Arc<UdpSocket>> = None;
    let mut target_addr: Option<String> = None;
    let mut ssrc = 0u32;
    let mut secret_key: Option<Vec<u8>> = None;
    let mut encryption_mode: Option<VoiceEncryptionMode> = None;
    let mut audio_keepers = None;
    let mut heartbeat_interval = None::<Duration>;
    let mut heartbeat_deadline = Instant::now() + Duration::from_secs(86_400);
    let mut heartbeat_sent = HashMap::<u64, Instant>::new();
    let mut last_voice_sequence = -1i64;

    let (speaking_tx, mut speaking_rx) = tokio::sync::mpsc::unbounded_channel::<bool>();

    log::info!(
        "[voice][gateway] account={} attempt={} state=websocket_connected",
        account_id,
        params.attempt_id
    );

    loop {
        tokio::select! {
            local_speaking = speaking_rx.recv() => {
                if let Some(speaking) = local_speaking {
                    events.speaking(account_id, &params.user_id, speaking);
                    if ssrc != 0 {
                        let _ = send_json(
                            &mut ws_tx,
                            json!({"op": 5, "d": {"speaking": if speaking { 1 } else { 0 }, "delay": 0, "ssrc": ssrc}}),
                        ).await;
                    }
                }
            }
            playback_event = next_playback_event(&mut audio_keepers) => {
                match playback_event {
                    Some(event) => events.audio(account_id, &params.attempt_id, &event),
                    None => return Err("A reprodução de áudio foi encerrada inesperadamente".into()),
                }
            }
            changed = cancel.changed() => {
                if changed.is_err() || *cancel.borrow() {
                    let _ = ws_tx.send(Message::Close(None)).await;
                    return Ok(());
                }
            }
            _ = tokio::time::sleep_until(heartbeat_deadline.into()) => {
                if let Some(interval) = heartbeat_interval {
                    let timestamp = chrono::Utc::now().timestamp_millis().max(0) as u64;
                    heartbeat_sent.insert(timestamp, Instant::now());
                    send_json(
                        &mut ws_tx,
                        voice_heartbeat_payload(timestamp, last_voice_sequence),
                    )
                    .await?;
                    heartbeat_deadline = Instant::now() + interval;
                }
            }
            incoming = ws_rx.next() => {
                let message = incoming.ok_or("Servidor de voz encerrou a conexão")?
                    .map_err(|error| format!("Erro no servidor de voz: {error}"))?;
                match message {
                    Message::Text(text) => {
                        let payload: Value = serde_json::from_str(&text)
                            .map_err(|error| format!("Resposta de voz inválida: {error}"))?;
                        if let Some(sequence) = payload["seq"].as_i64() {
                            last_voice_sequence = sequence;
                        }
                        let op = payload["op"].as_u64().unwrap_or(u64::MAX);
                        let data = &payload["d"];
                        match op {
                            8 => {
                                let interval_ms = data["heartbeat_interval"].as_f64()
                                    .ok_or("HELLO de voz sem heartbeat_interval")?;
                                let interval = Duration::from_millis(interval_ms.max(1.0) as u64);
                                heartbeat_interval = Some(interval);
                                heartbeat_deadline = Instant::now() + interval;
                                log::info!(
                                    "[voice][gateway] account={} attempt={} opcode=8 state=hello heartbeat_ms={}",
                                    account_id,
                                    params.attempt_id,
                                    interval.as_millis()
                                );
                                events.protocol(VoiceProtocolEvent::Hello);
                                send_json(&mut ws_tx, json!({
                                    "op": 0,
                                    "d": {
                                        "server_id": params.server_id,
                                        "user_id": params.user_id,
                                        "session_id": params.session_id.as_deref().ok_or("Sessão de voz ausente")?,
                                        "token": params.token.as_deref().ok_or("Token de voz ausente")?,
                                        "max_dave_protocol_version": DAVE_PROTOCOL_VERSION
                                    }
                                })).await?;
                            }
                            2 => {
                                ssrc = data["ssrc"].as_u64().ok_or("READY sem SSRC")? as u32;
                                let voice_ip = data["ip"].as_str().ok_or("READY sem endereço UDP")?;
                                let voice_port = data["port"].as_u64().ok_or("READY sem porta UDP")? as u16;
                                let selected_mode = select_transport_mode(&data["modes"])
                                    .ok_or("O servidor não ofereceu um modo AEAD de transporte compatível")?;
                                encryption_mode = Some(selected_mode);
                                log::info!(
                                    "[voice][gateway] account={} attempt={} opcode=2 state=ready transport={}",
                                    account_id,
                                    params.attempt_id,
                                    selected_mode.as_str()
                                );
                                events.protocol(VoiceProtocolEvent::Ready);
                                let socket = Arc::new(UdpSocket::bind("0.0.0.0:0").await
                                    .map_err(|error| format!("Falha ao abrir UDP de voz: {error}"))?);
                                let destination = format!("{voice_ip}:{voice_port}");
                                let mut discovery = [0u8; 74];
                                discovery[1] = 1;
                                discovery[3] = 70;
                                discovery[4..8].copy_from_slice(&ssrc.to_be_bytes());
                                socket.send_to(&discovery, &destination).await
                                    .map_err(|error| format!("Falha na descoberta UDP: {error}"))?;
                                let mut response = [0u8; 1024];
                                let (length, _) = tokio::time::timeout(Duration::from_secs(5), socket.recv_from(&mut response))
                                    .await.map_err(|_| "Tempo esgotado na descoberta UDP".to_string())?
                                    .map_err(|error| format!("Falha na descoberta UDP: {error}"))?;
                                if length < 74 {
                                    return Err("Resposta de descoberta UDP incompleta".into());
                                }
                                let ip_end = response[8..72].iter().position(|byte| *byte == 0).unwrap_or(64);
                                let external_ip = String::from_utf8_lossy(&response[8..8 + ip_end]);
                                let external_port = u16::from_be_bytes([response[72], response[73]]);
                                send_json(&mut ws_tx, json!({
                                    "op": 1,
                                    "d": {
                                        "protocol": "udp",
                                        "data": {
                                            "address": external_ip,
                                            "port": external_port,
                                            "mode": selected_mode.as_str()
                                        }
                                    }
                                })).await?;
                                udp_socket = Some(socket);
                                target_addr = Some(destination);
                            }
                            4 => {
                                if data["dave_protocol_version"].as_u64() != Some(DAVE_PROTOCOL_VERSION as u64) {
                                    return Err("A sessão não negociou o DAVE obrigatório".into());
                                }
                                let key = data["secret_key"].as_array()
                                    .ok_or("SESSION_DESCRIPTION sem chave de transporte")?
                                    .iter().map(|value| value.as_u64().map(|byte| byte as u8))
                                    .collect::<Option<Vec<_>>>().ok_or("Chave de transporte inválida")?;
                                if key.len() != 32 {
                                    return Err("Chave de transporte de voz inválida".into());
                                }
                                secret_key = Some(key);
                                let described_mode = data["mode"]
                                    .as_str()
                                    .and_then(parse_transport_mode)
                                    .or(encryption_mode)
                                    .ok_or("SESSION_DESCRIPTION sem modo de transporte compatível")?;
                                encryption_mode = Some(described_mode);
                                log::info!(
                                    "[voice][gateway] account={} attempt={} opcode=4 state=session_description transport={} dave_version={}",
                                    account_id,
                                    params.attempt_id,
                                    described_mode.as_str(),
                                    DAVE_PROTOCOL_VERSION
                                );
                                events.protocol(VoiceProtocolEvent::SessionDescription);
                                let protocol_version = NonZeroU16::new(DAVE_PROTOCOL_VERSION)
                                    .ok_or("Versão DAVE inválida")?;
                                let user_id = params.user_id.parse::<u64>().map_err(|_| "ID de usuário inválido")?;
                                let channel_id = params.channel_id.parse::<u64>().map_err(|_| "ID de canal inválido")?;
                                *dave_session.lock().await = Some(
                                    DaveSession::new(protocol_version, user_id, channel_id, None)
                                        .map_err(|error| format!("Falha ao iniciar DAVE: {error:?}"))?
                                );
                                send_key_package(&mut ws_tx, &dave_session).await?;
                                send_json(&mut ws_tx, json!({"op": 5, "d": {"speaking": 1, "delay": 0, "ssrc": ssrc}})).await?;
                            }
                            5 => {
                                let is_speaking = data["speaking"].as_u64().unwrap_or(0) != 0;
                                if let (Some(remote_ssrc), Some(remote_user)) = (data["ssrc"].as_u64(), data["user_id"].as_str()) {
                                    if let Ok(user_id) = remote_user.parse::<u64>() {
                                        ssrc_users.lock().await.insert(remote_ssrc as u32, user_id);
                                        log::info!(
                                            "[voice][receive] account={} attempt={} speaking_ssrc_mapped ssrc={} user={} speaking={}",
                                            account_id,
                                            params.attempt_id,
                                            remote_ssrc,
                                            remote_user,
                                            is_speaking
                                        );
                                    }
                                    events.speaking(account_id, remote_user, is_speaking);
                                }
                            }
                            6 => {
                                let timestamp = data["t"].as_u64().or_else(|| data.as_u64());
                                if let Some(timestamp) = timestamp {
                                    if let Some(sent_at) = heartbeat_sent.remove(&timestamp) {
                                        events.metric(
                                            account_id,
                                            &params.attempt_id,
                                            sent_at.elapsed().as_millis() as u64,
                                        );
                                        events.protocol(VoiceProtocolEvent::HeartbeatAck);
                                        log::debug!(
                                            "[voice][gateway] account={} attempt={} opcode=6 state=heartbeat_ack",
                                            account_id,
                                            params.attempt_id
                                        );
                                    }
                                }
                            }
                            11 => {
                                if let Some(users) = data["user_ids"].as_array() {
                                    for user in users {
                                        if let Some(id) = user.as_str().and_then(|id| id.parse::<u64>().ok()) {
                                            expected_users.insert(id);
                                        }
                                    }
                                    log::info!(
                                        "[voice][dave] account={} attempt={} clients_connected expected_users={}",
                                        account_id,
                                        params.attempt_id,
                                        expected_users.len()
                                    );
                                }
                            }
                            13 => {
                                if let Some(id) = data["user_id"].as_str().and_then(|id| id.parse::<u64>().ok()) {
                                    expected_users.remove(&id);
                                }
                            }
                            21 => {
                                log::info!(
                                    "[voice][dave] account={} attempt={} opcode=21 state=prepare_transition",
                                    account_id,
                                    params.attempt_id
                                );
                                let version = data["protocol_version"].as_u64().unwrap_or(0);
                                if version == 0 {
                                    return Err("O servidor tentou reduzir a chamada para áudio sem DAVE".into());
                                }
                                if data["transition_id"].as_u64() == Some(0) {
                                    log::info!(
                                        "[voice][dave] account={} attempt={} opcode=21 transition_id=0 state=executed_immediately",
                                        account_id,
                                        params.attempt_id
                                    );
                                }
                            }
                            22 => {
                                let ready = dave_session.lock().await.as_ref().is_some_and(DaveSession::is_ready);
                                if !ready {
                                    return Err("Transição DAVE executada antes de a sessão estar pronta".into());
                                }
                                log::info!(
                                    "[voice][dave] account={} attempt={} opcode=22 state=transition_executed",
                                    account_id,
                                    params.attempt_id
                                );
                                events.protocol(VoiceProtocolEvent::DaveTransitionExecuted);
                            }
                            24 => {
                                if data["protocol_version"].as_u64() != Some(DAVE_PROTOCOL_VERSION as u64) {
                                    return Err("Mudança para uma versão DAVE incompatível".into());
                                }
                                if data["epoch"].as_u64() == Some(1) {
                                    let protocol_version = NonZeroU16::new(DAVE_PROTOCOL_VERSION)
                                        .ok_or("A versão DAVE configurada não pode ser zero")?;
                                    let mut lock = dave_session.lock().await;
                                    lock.as_mut().ok_or("Sessão DAVE ausente")?
                                        .reinit(
                                            protocol_version,
                                            params.user_id.parse().map_err(|_| "ID de usuário inválido")?,
                                            params.channel_id.parse().map_err(|_| "ID de canal inválido")?,
                                            None,
                                        )
                                        .map_err(|error| format!("Falha ao reiniciar DAVE: {error:?}"))?;
                                    drop(lock);
                                    send_key_package(&mut ws_tx, &dave_session).await?;
                                }
                            }
                            _ => {}
                        }
                    }
                    Message::Binary(binary) => {
                        if binary.len() < 3 {
                            continue;
                        }
                        last_voice_sequence =
                            i64::from(u16::from_be_bytes([binary[0], binary[1]]));
                        let opcode = binary[2];
                        log::info!(
                            "[voice][dave] account={} attempt={} binary_opcode={} bytes={}",
                            account_id,
                            params.attempt_id,
                            opcode,
                            binary.len()
                        );
                        match opcode {
                            25 => {
                                dave_session.lock().await.as_mut().ok_or("Sessão DAVE ausente")?
                                    .set_external_sender(&binary[3..])
                                    .map_err(|error| format!("External sender DAVE inválido: {error:?}"))?;
                            }
                            27 if binary.len() >= 4 => {
                                let operation = match binary[3] {
                                    0 => ProposalsOperationType::APPEND,
                                    1 => ProposalsOperationType::REVOKE,
                                    _ => return Err("Operação de proposta DAVE inválida".into()),
                                };
                                let users: Vec<u64> = expected_users.iter().copied().collect();
                                let commit_welcome = dave_session.lock().await.as_mut().ok_or("Sessão DAVE ausente")?
                                    .process_proposals(operation, &binary[4..], Some(&users))
                                    .map_err(|error| format!("Proposta DAVE inválida: {error:?}"))?;
                                if let Some(value) = commit_welcome {
                                    let mut response = Vec::with_capacity(
                                        1 + value.commit.len() + value.welcome.as_ref().map_or(0, Vec::len)
                                    );
                                    response.push(28);
                                    response.extend_from_slice(&value.commit);
                                    if let Some(welcome) = value.welcome {
                                        response.extend_from_slice(&welcome);
                                    }
                                    ws_tx.send(Message::Binary(response)).await.map_err(|error| error.to_string())?;
                                }
                            }
                            29 if binary.len() >= 5 => {
                                let transition_id = u16::from_be_bytes([binary[3], binary[4]]);
                                let result = dave_session.lock().await.as_mut().ok_or("Sessão DAVE ausente")?
                                    .process_commit(&binary[5..]);
                                if let Err(error) = result {
                                    send_json(&mut ws_tx, json!({"op": 31, "d": {"transition_id": transition_id}})).await?;
                                    return Err(format!("Commit DAVE inválido: {error:?}"));
                                }
                                log::info!(
                                    "[voice][dave] account={} attempt={} commit_processed ready={}",
                                    account_id,
                                    params.attempt_id,
                                    dave_session.lock().await.as_ref().is_some_and(DaveSession::is_ready)
                                );
                                send_json(&mut ws_tx, json!({"op": 23, "d": {"transition_id": transition_id}})).await?;
                            }
                            30 if binary.len() >= 5 => {
                                let transition_id = u16::from_be_bytes([binary[3], binary[4]]);
                                let result = dave_session.lock().await.as_mut().ok_or("Sessão DAVE ausente")?
                                    .process_welcome(&binary[5..]);
                                if let Err(error) = result {
                                    send_json(&mut ws_tx, json!({"op": 31, "d": {"transition_id": transition_id}})).await?;
                                    return Err(format!("Welcome DAVE inválido: {error:?}"));
                                }
                                log::info!(
                                    "[voice][dave] account={} attempt={} welcome_processed ready={}",
                                    account_id,
                                    params.attempt_id,
                                    dave_session.lock().await.as_ref().is_some_and(DaveSession::is_ready)
                                );
                                send_json(&mut ws_tx, json!({"op": 23, "d": {"transition_id": transition_id}})).await?;
                            }
                            _ => {}
                        }
                    }
                    Message::Close(frame) => {
                        let details = frame.map_or_else(
                            || "sem código informado".to_owned(),
                            |frame| format!("código={}, motivo={}", frame.code, frame.reason),
                        );
                        return Err(format!("Servidor de voz encerrou a conexão ({details})"));
                    }
                    _ => {}
                }

                // Discord considers the voice connection established as soon as UDP discovery and
                // SELECT_PROTOCOL_ACK complete. DAVE group formation may legitimately remain pending
                // in a solo call until another participant joins; the shared session becomes usable
                // by the audio workers automatically once MLS finishes.
                let dave_negotiated = dave_session.lock().await.is_some();
                if audio_keepers.is_none() && dave_negotiated {
                    if let (Some(socket), Some(destination), Some(key), Some(mode)) = (
                        udp_socket.clone(),
                        target_addr.clone(),
                        secret_key.clone(),
                        encryption_mode,
                    ) {
                        let (keepers, output_info) = start_audio_threads(
                            socket,
                            destination,
                            ssrc,
                            key,
                            mode,
                            dave_session.clone(),
                            params.input_device_id.clone(),
                            params.output_device.subscribe(),
                            params.krisp_enabled,
                            params.muted.clone(),
                            params.deafened.clone(),
                            ssrc_users.clone(),
                            cancel.clone(),
                            Some(speaking_tx.clone()),
                        ).await?;
                        events.audio(
                            account_id,
                            &params.attempt_id,
                            &AudioPlaybackEvent::OutputReady(output_info),
                        );
                        audio_keepers = Some(keepers);
                        events.status(
                            account_id,
                            &params.attempt_id,
                            "connected",
                            "Voz conectada; DAVE v1 negociado",
                            Some(endpoint.clone()),
                            true,
                        );
                        events.protocol(VoiceProtocolEvent::Connected);
                        log::info!(
                            "[voice][connection] account={} attempt={} state=connected transport_encrypted=true dave_version={} dave_group=pending_or_active transport={}",
                            account_id,
                            params.attempt_id,
                            DAVE_PROTOCOL_VERSION,
                            mode.as_str()
                        );
                    }
                }
            }
        }
    }
}

fn parse_transport_mode(mode: &str) -> Option<VoiceEncryptionMode> {
    match mode {
        "aead_aes256_gcm_rtpsize" => Some(VoiceEncryptionMode::AeadAes256GcmRtpSize),
        "aead_xchacha20_poly1305_rtpsize" => {
            Some(VoiceEncryptionMode::AeadXChaCha20Poly1305RtpSize)
        }
        _ => None,
    }
}

fn select_transport_mode(modes: &Value) -> Option<VoiceEncryptionMode> {
    let modes = modes.as_array()?;
    if modes
        .iter()
        .any(|mode| mode.as_str() == Some("aead_aes256_gcm_rtpsize"))
    {
        return Some(VoiceEncryptionMode::AeadAes256GcmRtpSize);
    }
    modes
        .iter()
        .any(|mode| mode.as_str() == Some("aead_xchacha20_poly1305_rtpsize"))
        .then_some(VoiceEncryptionMode::AeadXChaCha20Poly1305RtpSize)
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use tokio::sync::{mpsc, oneshot, watch};
    use tokio_tungstenite::tungstenite::Message;

    #[derive(Debug)]
    enum TestVoiceSignal {
        Status(String),
        Protocol(VoiceProtocolEvent),
        Audio(AudioPlaybackEvent),
    }

    struct TestVoiceEventSink {
        tx: mpsc::UnboundedSender<TestVoiceSignal>,
    }

    impl VoiceEventSink for TestVoiceEventSink {
        fn status(
            &self,
            _account_id: &str,
            _attempt_id: &str,
            status: &'static str,
            _stage: &str,
            _endpoint: Option<String>,
            _encrypted: bool,
        ) {
            let _ = self.tx.send(TestVoiceSignal::Status(status.to_owned()));
        }

        fn metric(&self, _account_id: &str, _attempt_id: &str, _ping_ms: u64) {}

        fn audio(&self, _account_id: &str, _attempt_id: &str, event: &AudioPlaybackEvent) {
            let _ = self.tx.send(TestVoiceSignal::Audio(event.clone()));
        }

        fn protocol(&self, event: VoiceProtocolEvent) {
            let _ = self.tx.send(TestVoiceSignal::Protocol(event));
        }
    }

    fn pending() -> PendingVoiceConnection {
        let (output_device, _output_device_rx) = watch::channel(None);
        PendingVoiceConnection {
            attempt_id: "attempt".into(),
            server_id: "server".into(),
            channel_id: "channel".into(),
            user_id: "user".into(),
            input_device_id: None,
            output_device,
            krisp_enabled: false,
            session_id: None,
            token: None,
            endpoint: None,
            muted: Arc::new(AtomicBool::new(false)),
            deafened: Arc::new(AtomicBool::new(false)),
        }
    }

    #[test]
    fn null_voice_state_is_intermediate_and_does_not_cancel_pending_join() {
        let mut pending = pending();
        let outcome = pending.apply_voice_state(&json!({
            "user_id": "user",
            "channel_id": null,
            "session_id": "stale"
        }));

        assert_eq!(outcome, PendingUpdate::Waiting);
        assert!(pending.session_id.is_none());
    }

    #[test]
    fn null_endpoint_preserves_a_previously_allocated_server() {
        let mut pending = pending();
        pending.endpoint = Some("voice.example.test".into());

        let outcome = pending.apply_voice_server(&json!({
            "guild_id": null,
            "token": "rtc-token",
            "endpoint": null
        }));

        assert_eq!(outcome, PendingUpdate::Waiting);
        assert_eq!(pending.endpoint.as_deref(), Some("voice.example.test"));
        assert!(pending.token.is_some());
    }

    #[test]
    fn out_of_order_allocation_events_converge_to_ready() {
        let mut pending = pending();
        assert_eq!(
            pending.apply_voice_server(&json!({
                "guild_id": null,
                "token": "rtc-token",
                "endpoint": null
            })),
            PendingUpdate::Waiting
        );
        assert_eq!(
            pending.apply_voice_state(&json!({
                "user_id": "user",
                "channel_id": "channel",
                "session_id": "session"
            })),
            PendingUpdate::Applied
        );
        assert!(!pending.is_allocation_ready());
        assert_eq!(
            pending.apply_voice_server(&json!({
                "guild_id": null,
                "token": "rtc-token-2",
                "endpoint": "voice.example.test"
            })),
            PendingUpdate::Applied
        );
        assert!(pending.is_allocation_ready());
    }

    #[test]
    fn transport_prefers_aes_and_falls_back_to_xchacha() {
        assert_eq!(
            select_transport_mode(&json!([
                "aead_xchacha20_poly1305_rtpsize",
                "aead_aes256_gcm_rtpsize"
            ])),
            Some(VoiceEncryptionMode::AeadAes256GcmRtpSize)
        );
        assert_eq!(
            select_transport_mode(&json!(["aead_xchacha20_poly1305_rtpsize"])),
            Some(VoiceEncryptionMode::AeadXChaCha20Poly1305RtpSize)
        );
    }

    #[test]
    fn voice_v8_heartbeat_carries_timestamp_and_sequence_ack() {
        let heartbeat = voice_heartbeat_payload(1_234_567, 42);
        assert_eq!(heartbeat["op"], 3);
        assert_eq!(heartbeat["d"]["t"], 1_234_567);
        assert_eq!(heartbeat["d"]["seq_ack"], 42);
    }

    /// Opt-in live probe. It is ignored in normal CI and never persists the token.
    /// Run with `ORGANICCORD_VOICE_TEST_TOKEN` set in the process environment, or set
    /// `ORGANICCORD_VOICE_USE_STORED_ACCOUNT=1` to read the already encrypted local account.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "performs an authorized live Discord voice call"]
    async fn live_dm_voice_reaches_dave_and_heartbeat_ack() {
        let _ = env_logger::Builder::from_env(env_logger::Env::default())
            .is_test(true)
            .try_init();
        let account_token = if let Ok(token) = std::env::var("ORGANICCORD_VOICE_TEST_TOKEN") {
            Zeroizing::new(token)
        } else if std::env::var("ORGANICCORD_VOICE_USE_STORED_ACCOUNT").as_deref() == Ok("1") {
            let app_data = std::env::var("APPDATA").expect("APPDATA must be available");
            let contents = std::fs::read_to_string(
                std::path::Path::new(&app_data)
                    .join("com.organiccord.desktop")
                    .join("accounts.json"),
            )
            .expect("stored OrganicCord accounts must be available");
            let value: Value = serde_json::from_str(&contents).expect("valid accounts store");
            let accounts: Vec<crate::session::StoredAccount> =
                serde_json::from_value(value["accounts"].clone()).expect("valid stored accounts");
            let account = accounts.first().expect("at least one stored account");
            Zeroizing::new(
                crate::storage::decrypt_token(&account.token_encrypted)
                    .expect("stored account token must decrypt"),
            )
        } else {
            panic!("set ORGANICCORD_VOICE_TEST_TOKEN or ORGANICCORD_VOICE_USE_STORED_ACCOUNT=1");
        };
        let client = crate::http_client::discord_client(&account_token).expect("Discord client");

        let me: Value = client
            .get("https://discord.com/api/v10/users/@me")
            .send()
            .await
            .expect("GET /users/@me")
            .error_for_status()
            .expect("valid test account")
            .json()
            .await
            .expect("current user JSON");
        let user_id = me["id"].as_str().expect("current user id").to_owned();

        let relationships: Value = client
            .get("https://discord.com/api/v10/users/@me/relationships")
            .send()
            .await
            .expect("GET relationships")
            .error_for_status()
            .expect("relationships available")
            .json()
            .await
            .expect("relationships JSON");
        let target_id = relationships
            .as_array()
            .and_then(|items| {
                items.iter().find_map(|relationship| {
                    (relationship["user"]["username"].as_str() == Some("musashisans2"))
                        .then(|| relationship["user"]["id"].as_str().map(str::to_owned))
                        .flatten()
                })
            })
            .expect("target user musashisans2 must be in the account relationships");

        let dm: Value = client
            .post("https://discord.com/api/v10/users/@me/channels")
            .json(&json!({"recipient_id": target_id}))
            .send()
            .await
            .expect("create/open DM")
            .error_for_status()
            .expect("DM available")
            .json()
            .await
            .expect("DM JSON");
        let channel_id = dm["id"].as_str().expect("DM channel id").to_owned();

        let (allocation_tx, allocation_rx) = oneshot::channel::<(String, String, String)>();
        let (gateway_stop_tx, mut gateway_stop_rx) = watch::channel(false);
        let gateway_token = account_token.to_string();
        let gateway_user_id = user_id.clone();
        let gateway_channel_id = channel_id.clone();
        let gateway_client = client.clone();
        let gateway_task = tokio::spawn(async move {
            let (stream, _) = connect_async_tls_with_config(
                "wss://gateway.discord.gg/?v=10&encoding=json",
                None,
                false,
                None,
            )
            .await
            .expect("main Gateway connection");
            let (mut sink, mut source) = stream.split();
            let mut heartbeat_deadline = Instant::now() + Duration::from_secs(86_400);
            let mut heartbeat_interval = None;
            let mut sequence = None::<u64>;
            let mut joined = false;
            let mut session_id = None::<String>;
            let mut rtc_token = None::<String>;
            let mut endpoint = None::<String>;
            let mut allocation_tx = Some(allocation_tx);

            loop {
                tokio::select! {
                    changed = gateway_stop_rx.changed() => {
                        if changed.is_err() || *gateway_stop_rx.borrow() {
                            let _ = sink.send(Message::Text(json!({
                                "op": 4,
                                "d": {
                                    "guild_id": null,
                                    "channel_id": null,
                                    "self_mute": false,
                                    "self_deaf": false
                                }
                            }).to_string())).await;
                            let _ = sink.send(Message::Close(None)).await;
                            return;
                        }
                    }
                    _ = tokio::time::sleep_until(heartbeat_deadline.into()) => {
                        if let Some(interval) = heartbeat_interval {
                            let heartbeat = crate::gateway::gateway_heartbeat_payload(sequence, joined);
                            sink.send(Message::Text(heartbeat.to_string()))
                                .await.expect("main Gateway heartbeat");
                            heartbeat_deadline = Instant::now() + interval;
                        }
                    }
                    incoming = source.next() => {
                        let message = incoming.expect("main Gateway open").expect("main Gateway frame");
                        let Message::Text(text) = message else { continue };
                        let payload: Value = serde_json::from_str(&text).expect("main Gateway JSON");
                        if let Some(value) = payload["s"].as_u64() {
                            sequence = Some(value);
                        }
                        match payload["op"].as_u64() {
                            Some(10) => {
                                let interval = Duration::from_millis(
                                    payload["d"]["heartbeat_interval"].as_u64().expect("Gateway heartbeat interval")
                                );
                                heartbeat_interval = Some(interval);
                                heartbeat_deadline = Instant::now() + interval;
                                let heartbeat = crate::gateway::gateway_heartbeat_payload(sequence, false);
                                sink.send(Message::Text(heartbeat.to_string()))
                                    .await.expect("initial main Gateway heartbeat");
                                sink.send(Message::Text(json!({
                                    "op": 2,
                                    "d": {
                                        "token": gateway_token,
                                        "properties": {"os": std::env::consts::OS, "browser": "organiccord", "device": "organiccord"},
                                        "intents": crate::gateway::INTENTS,
                                        "compress": false
                                    }
                                }).to_string())).await.expect("Gateway identify");
                            }
                            Some(0) => {
                                match payload["t"].as_str().unwrap_or_default() {
                                    "READY" if !joined => {
                                        let ring_response = gateway_client
                                            .post(format!("https://discord.com/api/v10/channels/{gateway_channel_id}/call/ring"))
                                            .json(&json!({"recipients": null}))
                                            .send().await.expect("ring DM call");
                                        assert!(ring_response.status().is_success(), "DM ring failed with status {}", ring_response.status());
                                        sink.send(Message::Text(json!({
                                            "op": 4,
                                            "d": {
                                                "guild_id": null,
                                                "channel_id": gateway_channel_id,
                                                "self_mute": false,
                                                "self_deaf": false
                                            }
                                        }).to_string())).await.expect("voice state update");
                                        eprintln!("[live-probe] main Gateway opcode=4 sent target=dm");
                                        joined = true;
                                    }
                                    "VOICE_STATE_UPDATE"
                                        if payload["d"]["user_id"].as_str() == Some(gateway_user_id.as_str())
                                            && payload["d"]["channel_id"].as_str() == Some(gateway_channel_id.as_str()) =>
                                    {
                                        session_id = payload["d"]["session_id"].as_str().map(str::to_owned);
                                        eprintln!("[live-probe] dispatch=VOICE_STATE_UPDATE session_present={}", session_id.is_some());
                                    }
                                    "VOICE_SERVER_UPDATE" => {
                                        if let Some(value) = payload["d"]["token"].as_str().filter(|value| !value.is_empty()) {
                                            rtc_token = Some(value.to_owned());
                                        }
                                        if let Some(value) = payload["d"]["endpoint"].as_str().filter(|value| !value.is_empty()) {
                                            endpoint = Some(value.to_owned());
                                        }
                                        eprintln!("[live-probe] dispatch=VOICE_SERVER_UPDATE token_present={} endpoint_present={}", rtc_token.is_some(), endpoint.is_some());
                                    }
                                    _ => {}
                                }
                                if let (Some(session), Some(token), Some(host)) = (
                                    session_id.clone(),
                                    rtc_token.clone(),
                                    endpoint.clone(),
                                ) {
                                    if let Some(sender) = allocation_tx.take() {
                                        let _ = sender.send((session, token, host));
                                    }
                                }
                            }
                            Some(11) => eprintln!("[live-probe] main Gateway heartbeat ACK"),
                            _ => {}
                        }
                    }
                }
            }
        });

        let (session_id, rtc_token, endpoint) =
            tokio::time::timeout(Duration::from_secs(35), allocation_rx)
                .await
                .expect("voice allocation timed out")
                .expect("voice allocation channel closed");

        let (event_tx, mut event_rx) = mpsc::unbounded_channel::<TestVoiceSignal>();

        let mut params = pending();
        params.server_id = channel_id.clone();
        params.channel_id = channel_id;
        params.user_id = user_id;
        params.session_id = Some(session_id);
        params.token = Some(Zeroizing::new(rtc_token));
        params.endpoint = Some(endpoint);
        let (cancel_tx, cancel_rx) = watch::channel(false);
        let voice_task = tokio::spawn(async move {
            let result_tx = event_tx.clone();
            let sink = TestVoiceEventSink { tx: event_tx };
            let result = run_voice_connection("live-probe", &mut params, cancel_rx, &sink).await;
            if let Err(error) = &result {
                let _ = result_tx.send(TestVoiceSignal::Status(format!("error:{error}")));
            }
            result
        });

        let mut connected = false;
        let mut heartbeat_acks = 0u8;
        let mut session_description = false;
        let mut output_ready = false;
        let mut pcm_consumed = false;
        let require_receive =
            std::env::var("ORGANICCORD_VOICE_REQUIRE_RECEIVE").as_deref() == Ok("1");
        tokio::time::timeout(Duration::from_secs(55), async {
            while !connected
                || !session_description
                || !output_ready
                || heartbeat_acks < 2
                || (require_receive && !pcm_consumed)
            {
                match event_rx.recv().await.expect("voice event channel") {
                    TestVoiceSignal::Protocol(VoiceProtocolEvent::SessionDescription) => {
                        session_description = true;
                        eprintln!(
                            "[live-probe] voice opcode=4 transport_encryption=true dave_version=1"
                        );
                    }
                    TestVoiceSignal::Protocol(VoiceProtocolEvent::Connected) => {
                        connected = true;
                        eprintln!(
                            "[live-probe] voice state=connected transport=stable DAVE=negotiated"
                        );
                    }
                    TestVoiceSignal::Protocol(VoiceProtocolEvent::HeartbeatAck) => {
                        heartbeat_acks += 1;
                        eprintln!(
                            "[live-probe] voice opcode=6 heartbeat_ack count={heartbeat_acks}"
                        );
                    }
                    TestVoiceSignal::Status(status) if status.starts_with("error:") => {
                        panic!("voice backend failed: {status}")
                    }
                    TestVoiceSignal::Audio(AudioPlaybackEvent::OutputReady(info)) => {
                        output_ready = true;
                        eprintln!(
                            "[live-probe] output ready device={} fallback={}",
                            info.active_device_name, info.fallback
                        );
                    }
                    TestVoiceSignal::Audio(AudioPlaybackEvent::PipelineProgress(stage)) => {
                        eprintln!("[live-probe] receive stage={}", stage.as_str());
                        if stage == AudioPipelineStage::PcmConsumed {
                            pcm_consumed = true;
                        }
                    }
                    _ => {}
                }
            }
        })
        .await
        .expect("voice did not reach connected with two heartbeat ACKs");

        cancel_tx.send(true).expect("cancel live voice probe");
        gateway_stop_tx.send(true).expect("stop main Gateway probe");
        voice_task
            .await
            .expect("voice probe task")
            .expect("voice probe result");
        gateway_task.await.expect("main Gateway probe task");
        assert!(connected);
        assert!(session_description);
        assert!(output_ready);
        assert!(heartbeat_acks >= 2);
        if require_receive {
            assert!(pcm_consumed);
        }
    }
}
