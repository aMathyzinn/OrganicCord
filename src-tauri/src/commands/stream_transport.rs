use crate::commands::stream::{emit_stream_preview, emit_stream_status};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use bytes::Bytes;
use davey::{Codec, DaveSession, MediaType, ProposalsOperationType, DAVE_PROTOCOL_VERSION};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::num::NonZeroU16;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::sync::{mpsc, watch, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{connect_async_tls_with_config, tungstenite::Message};
use webrtc::api::interceptor_registry::{
    configure_twcc_sender_only, register_default_interceptors,
};
use webrtc::api::media_engine::{MediaEngine, MIME_TYPE_H264, MIME_TYPE_OPUS};
use webrtc::api::APIBuilder;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::interceptor::registry::Registry;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::{
    RTCRtpCodecCapability, RTCRtpCodecParameters, RTCRtpHeaderExtensionCapability, RTPCodecType,
};
use webrtc::rtp_transceiver::rtp_transceiver_direction::RTCRtpTransceiverDirection;
use webrtc::rtp_transceiver::{
    RTCPFeedback, RTCRtpCodingParameters, RTCRtpRtxParameters, RTCRtpTransceiverInit,
};
use webrtc::stats::StatsReportType;
use webrtc::track::track_local::track_local_static_sample::TrackLocalStaticSample;
use webrtc_media::Sample;
use zeroize::Zeroizing;

const STREAM_CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const DAVE_NEGOTIATION_TIMEOUT: Duration = Duration::from_secs(15);
const DAVE_MAX_RECOVERY_ATTEMPTS: u8 = 2;
const VIDEO_PAYLOAD_TYPE: u8 = 101;
const VIDEO_RTX_PAYLOAD_TYPE: u8 = 102;
const OPUS_PAYLOAD_TYPE: u8 = 120;
const STREAM_WIDTH: u32 = 1280;
const STREAM_HEIGHT: u32 = 720;
const STREAM_FPS: u32 = 30;
const MAX_ACCESS_UNIT_BYTES: usize = 8 * 1024 * 1024;
const MAX_PREVIEW_FRAME_BYTES: usize = 2 * 1024 * 1024;
const PREVIEW_WIDTH: u32 = 480;
const PREVIEW_HEIGHT: u32 = 270;
const PREVIEW_FPS: u32 = 4;
const AUDIO_LEVEL_URI: &str = "urn:ietf:params:rtp-hdrext:ssrc-audio-level";
const ABS_SEND_TIME_URI: &str = "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time";
const TRANSPORT_CC_URI: &str =
    "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01";

pub(crate) struct StreamTransportParams {
    pub account_id: String,
    pub attempt_id: String,
    pub stream_key: String,
    pub user_id: String,
    pub voice_session_id: String,
    pub rtc_server_id: String,
    pub rtc_channel_id: String,
    pub endpoint: String,
    pub token: Zeroizing<String>,
}

struct WebRtcMedia {
    peer: Arc<RTCPeerConnection>,
    video_track: Arc<TrackLocalStaticSample>,
}

struct ScreenCaptureContext {
    peer: Arc<RTCPeerConnection>,
    track: Arc<TrackLocalStaticSample>,
    dave_session: Arc<Mutex<Option<DaveSession>>>,
    app: AppHandle,
    account_id: String,
    attempt_id: String,
    stream_key: String,
    video_ssrc: u32,
}

#[derive(Clone, Copy)]
struct DaveIdentity {
    protocol_version: NonZeroU16,
    user_id: u64,
    channel_id: u64,
}

#[derive(Debug, Clone, Copy)]
struct DaveBinaryOutcome {
    opcode: u8,
    ready: bool,
    recovered: bool,
}

#[derive(Debug, Clone, Copy)]
enum WebRtcEvent {
    Peer(RTCPeerConnectionState),
    Ice(RTCIceConnectionState),
}

pub(crate) async fn run_stream_connection(
    params: StreamTransportParams,
    mut cancel: watch::Receiver<bool>,
    app: AppHandle,
) -> Result<(), String> {
    let endpoint = params
        .endpoint
        .trim_start_matches("wss://")
        .trim_start_matches("https://")
        .trim_end_matches('/');
    let request = format!("wss://{endpoint}/?v=8")
        .into_client_request()
        .map_err(|error| error.to_string())?;
    let (stream, _) = tokio::time::timeout(
        STREAM_CONNECT_TIMEOUT,
        connect_async_tls_with_config(request, None, false, None),
    )
    .await
    .map_err(|_| "Tempo esgotado ao conectar ao servidor de compartilhamento".to_string())?
    .map_err(|error| format!("Falha no servidor de compartilhamento: {error}"))?;
    let (mut ws_tx, mut ws_rx) = stream.split();

    log::info!(
        "[stream][gateway] account={} attempt={} state=websocket_connected",
        params.account_id,
        params.attempt_id
    );
    emit_stream_status(
        &app,
        &params.account_id,
        &params.attempt_id,
        "negotiating",
        "Conectado ao servidor. Negociando WebRTC...",
        Some(params.stream_key.clone()),
    );

    let dave_session = Arc::new(Mutex::new(None::<DaveSession>));
    let mut dave_identity = None::<DaveIdentity>;
    let mut expected_users = HashSet::<u64>::new();
    expected_users.insert(
        params
            .user_id
            .parse::<u64>()
            .map_err(|_| "ID de usuário inválido")?,
    );
    let mut pending_transitions = HashMap::<u64, u16>::new();
    let mut web_rtc: Option<WebRtcMedia> = None;
    let mut audio_ssrc = 0u32;
    let mut video_ssrc = 0u32;
    let mut rtx_ssrc = 0u32;
    let mut heartbeat_interval = None::<Duration>;
    let mut heartbeat_deadline = Instant::now() + Duration::from_secs(86_400);
    let mut last_sequence = -1i64;
    let (web_rtc_event_tx, mut web_rtc_event_rx) = mpsc::unbounded_channel();
    let mut capture_task: Option<JoinHandle<Result<(), String>>> = None;
    let mut peer_connect_deadline = None::<Instant>;
    let mut dave_negotiation_deadline = None::<Instant>;
    let mut last_dave_opcode = None::<u8>;
    let mut dave_recovery_attempts = 0u8;
    let mut peer_connected = false;

    loop {
        tokio::select! {
            changed = cancel.changed() => {
                if changed.is_err() || *cancel.borrow() {
                    if let Some(media) = web_rtc.take() {
                        let _ = media.peer.close().await;
                    }
                    let _ = ws_tx.send(Message::Close(None)).await;
                    return Ok(());
                }
            }
            event = web_rtc_event_rx.recv() => {
                match event {
                    Some(WebRtcEvent::Peer(RTCPeerConnectionState::Connected)) => {
                        peer_connect_deadline = None;
                        if peer_connected {
                            continue;
                        }
                        peer_connected = true;
                        log::info!(
                            "[stream][webrtc] account={} attempt={} state=connected",
                            params.account_id,
                            params.attempt_id
                        );
                        emit_stream_status(
                            &app,
                            &params.account_id,
                            &params.attempt_id,
                            "connected",
                            "Transporte conectado. Preparando vídeo...",
                            Some(params.stream_key.clone()),
                        );
                        let media = web_rtc.as_ref()
                            .ok_or("WebRTC conectado sem mídia de vídeo")?;
                        capture_task = Some(tokio::spawn(run_screen_capture(
                            ScreenCaptureContext {
                                peer: media.peer.clone(),
                                track: media.video_track.clone(),
                                dave_session: dave_session.clone(),
                                app: app.clone(),
                                account_id: params.account_id.clone(),
                                attempt_id: params.attempt_id.clone(),
                                stream_key: params.stream_key.clone(),
                                video_ssrc,
                            },
                            cancel.clone(),
                        )));
                    }
                    Some(WebRtcEvent::Peer(RTCPeerConnectionState::Failed)) => {
                        return Err("A negociação WebRTC do compartilhamento falhou".into());
                    }
                    Some(WebRtcEvent::Peer(RTCPeerConnectionState::Closed)) if !*cancel.borrow() => {
                        return Err("A conexão WebRTC do compartilhamento foi encerrada".into());
                    }
                    Some(WebRtcEvent::Peer(state)) => {
                        log::info!(
                            "[stream][webrtc] account={} attempt={} peer_state={}",
                            params.account_id,
                            params.attempt_id,
                            state
                        );
                    }
                    Some(WebRtcEvent::Ice(RTCIceConnectionState::Failed)) => {
                        return Err("O Discord não conseguiu estabelecer a rota ICE da transmissão".into());
                    }
                    Some(WebRtcEvent::Ice(state)) => {
                        log::info!(
                            "[stream][webrtc] account={} attempt={} ice_state={}",
                            params.account_id,
                            params.attempt_id,
                            state
                        );
                    }
                    _ => {}
                }
            }
            capture_result = next_capture_result(&mut capture_task) => {
                match capture_result {
                    Ok(()) if *cancel.borrow() => return Ok(()),
                    Ok(()) => return Err("A captura de tela foi encerrada inesperadamente".into()),
                    Err(error) => return Err(error),
                }
            }
            _ = wait_for_deadline(peer_connect_deadline) => {
                return Err(
                    "Tempo esgotado ao estabelecer o transporte WebRTC/ICE da transmissão"
                        .into(),
                );
            }
            _ = wait_for_deadline(dave_negotiation_deadline) => {
                return Err(format!(
                    "Tempo esgotado na negociação DAVE da transmissão (último opcode: {})",
                    last_dave_opcode.map_or_else(|| "nenhum".to_owned(), |opcode| opcode.to_string())
                ));
            }
            _ = tokio::time::sleep_until(heartbeat_deadline.into()) => {
                if let Some(interval) = heartbeat_interval {
                    send_json(&mut ws_tx, json!({
                        "op": 3,
                        "d": {
                            "t": chrono::Utc::now().timestamp_millis().max(0) as u64,
                            "seq_ack": last_sequence
                        }
                    })).await?;
                    heartbeat_deadline = Instant::now() + interval;
                }
            }
            incoming = ws_rx.next() => {
                let message = incoming
                    .ok_or("Servidor de compartilhamento encerrou a conexão")?
                    .map_err(|error| format!("Erro no servidor de compartilhamento: {error}"))?;
                match message {
                    Message::Text(text) => {
                        let payload: Value = serde_json::from_str(&text)
                            .map_err(|error| format!("Resposta de compartilhamento inválida: {error}"))?;
                        if let Some(sequence) = payload["seq"].as_i64() {
                            last_sequence = sequence;
                        }
                        let op = payload["op"].as_u64().unwrap_or(u64::MAX);
                        let data = &payload["d"];
                        match op {
                            8 => {
                                let interval_ms = data["heartbeat_interval"]
                                    .as_f64()
                                    .ok_or("HELLO do stream sem heartbeat_interval")?;
                                let interval = Duration::from_millis(interval_ms.max(1.0) as u64);
                                heartbeat_interval = Some(interval);
                                heartbeat_deadline = Instant::now() + interval;
                                send_json(&mut ws_tx, json!({
                                    "op": 0,
                                    "d": {
                                        "server_id": params.rtc_server_id,
                                        "channel_id": params.rtc_channel_id,
                                        "user_id": params.user_id,
                                        "session_id": params.voice_session_id,
                                        "token": params.token.as_str(),
                                        "video": true,
                                        "streams": [{
                                            "type": "screen",
                                            "rid": "100",
                                            "quality": 100,
                                            "active": true,
                                            "max_bitrate": 10_000_000,
                                            "max_framerate": STREAM_FPS,
                                            "max_resolution": {
                                                "type": "fixed",
                                                "width": STREAM_WIDTH,
                                                "height": STREAM_HEIGHT
                                            }
                                        }],
                                        "max_dave_protocol_version": DAVE_PROTOCOL_VERSION
                                    }
                                })).await?;
                                log::info!(
                                    "[stream][gateway] account={} attempt={} opcode=8 state=identified heartbeat_ms={}",
                                    params.account_id,
                                    params.attempt_id,
                                    interval.as_millis()
                                );
                            }
                            2 => {
                                audio_ssrc = data["ssrc"].as_u64().ok_or("READY sem SSRC de áudio")? as u32;
                                let stream = data["streams"]
                                    .as_array()
                                    .and_then(|streams| streams.first())
                                    .ok_or("READY sem stream de vídeo")?;
                                video_ssrc = stream["ssrc"].as_u64().ok_or("READY sem SSRC de vídeo")? as u32;
                                rtx_ssrc = stream["rtx_ssrc"].as_u64().ok_or("READY sem SSRC RTX")? as u32;

                                let (media, local_sdp) = create_web_rtc(
                                    audio_ssrc,
                                    video_ssrc,
                                    rtx_ssrc,
                                    web_rtc_event_tx.clone(),
                                ).await?;
                                web_rtc = Some(media);
                                send_json(&mut ws_tx, json!({
                                    "op": 1,
                                    "d": {
                                        "protocol": "webrtc",
                                        "codecs": discord_codecs(),
                                        "data": local_sdp,
                                        "sdp": local_sdp,
                                        "rtc_connection_id": uuid::Uuid::new_v4().to_string()
                                    }
                                })).await?;
                                log::info!(
                                    "[stream][gateway] account={} attempt={} opcode=2 state=ready audio_ssrc={} video_ssrc={} rtx_ssrc={}",
                                    params.account_id,
                                    params.attempt_id,
                                    audio_ssrc,
                                    video_ssrc,
                                    rtx_ssrc
                                );
                            }
                            4 => {
                                let remote_sdp = data["sdp"].as_str()
                                    .ok_or("Session Description do stream sem SDP")?;
                                let protocol_version = data["dave_protocol_version"]
                                    .as_u64()
                                    .ok_or("Session Description sem versão DAVE")? as u16;
                                if protocol_version == 0 || protocol_version > DAVE_PROTOCOL_VERSION {
                                    return Err(format!("Versão DAVE do stream incompatível: {protocol_version}"));
                                }
                                let normalized = normalize_discord_answer_sdp(remote_sdp)?;
                                let description = RTCSessionDescription::answer(normalized)
                                    .map_err(|error| format!("SDP remoto inválido: {error}"))?;
                                let media = web_rtc.as_ref().ok_or("WebRTC ausente antes do ACK")?;
                                media.peer.set_remote_description(description).await
                                    .map_err(|error| format!("Falha ao aplicar SDP remoto: {error}"))?;
                                peer_connect_deadline = Some(Instant::now() + STREAM_CONNECT_TIMEOUT);

                                let channel_id = params.rtc_server_id
                                    .parse::<u64>()
                                    .map_err(|_| "RTC server id inválido")?
                                    .checked_sub(1)
                                    .ok_or("RTC server id não pode ser zero")?;
                                let user_id = params.user_id.parse::<u64>()
                                    .map_err(|_| "ID de usuário inválido")?;
                                let version = NonZeroU16::new(protocol_version)
                                    .ok_or("Versão DAVE inválida")?;
                                let identity = DaveIdentity {
                                    protocol_version: version,
                                    user_id,
                                    channel_id,
                                };
                                dave_identity = Some(identity);
                                *dave_session.lock().await = Some(
                                    DaveSession::new(
                                        identity.protocol_version,
                                        identity.user_id,
                                        identity.channel_id,
                                        None,
                                    )
                                        .map_err(|error| format!("Falha ao iniciar DAVE do stream: {error:?}"))?
                                );
                                send_key_package(&mut ws_tx, &dave_session).await?;
                                // A solo Go Live connection only receives the external sender
                                // package. The MLS group is formed when a viewer joins, so the
                                // negotiation timeout must not kill an otherwise healthy stream.
                                dave_negotiation_deadline = None;
                                emit_stream_status(
                                    &app,
                                    &params.account_id,
                                    &params.attempt_id,
                                    "connected",
                                    "Transporte pronto. Aguardando alguém abrir a transmissão...",
                                    Some(params.stream_key.clone()),
                                );
                                send_video_attributes(
                                    &mut ws_tx,
                                    audio_ssrc,
                                    video_ssrc,
                                    rtx_ssrc,
                                    STREAM_WIDTH,
                                    STREAM_HEIGHT,
                                    STREAM_FPS,
                                ).await?;
                                send_json(&mut ws_tx, json!({
                                    "op": 5,
                                    "d": { "speaking": 2, "delay": 0, "ssrc": audio_ssrc }
                                })).await?;
                                emit_stream_status(
                                    &app,
                                    &params.account_id,
                                    &params.attempt_id,
                                    "negotiating",
                                    "SDP aceito. Estabelecendo a rota segura de vídeo...",
                                    Some(params.stream_key.clone()),
                                );
                                log::info!(
                                    "[stream][gateway] account={} attempt={} opcode=4 state=session_description dave_version={} rtc_server_id={} dave_group_id={}",
                                    params.account_id,
                                    params.attempt_id,
                                    protocol_version,
                                    params.rtc_server_id,
                                    channel_id
                                );
                            }
                            6 => {
                                log::debug!(
                                    "[stream][gateway] account={} attempt={} opcode=6 state=heartbeat_ack",
                                    params.account_id,
                                    params.attempt_id
                                );
                            }
                            11 => {
                                if let Some(users) = data["user_ids"].as_array() {
                                    for user in users {
                                        if let Some(id) = user.as_str().and_then(|id| id.parse().ok()) {
                                            expected_users.insert(id);
                                        }
                                    }
                                    if expected_users.len() > 1 {
                                        dave_negotiation_deadline = Some(
                                            Instant::now() + DAVE_NEGOTIATION_TIMEOUT
                                        );
                                        emit_stream_status(
                                            &app,
                                            &params.account_id,
                                            &params.attempt_id,
                                            "connected",
                                            "Espectador conectado. Formando o grupo criptografado...",
                                            Some(params.stream_key.clone()),
                                        );
                                    }
                                    log::info!(
                                        "[stream][dave] account={} attempt={} opcode=11 state=clients_connected expected_users={}",
                                        params.account_id,
                                        params.attempt_id,
                                        expected_users.len()
                                    );
                                }
                            }
                            13 => {
                                if let Some(id) = data["user_id"].as_str().and_then(|id| id.parse().ok()) {
                                    expected_users.remove(&id);
                                    log::info!(
                                        "[stream][dave] account={} attempt={} opcode=13 state=client_disconnected expected_users={}",
                                        params.account_id,
                                        params.attempt_id,
                                        expected_users.len()
                                    );
                                }
                            }
                            21 => {
                                let transition_id = data["transition_id"].as_u64().unwrap_or(0);
                                let version = data["protocol_version"].as_u64().unwrap_or(0) as u16;
                                if version == 0 {
                                    return Err(
                                        "O servidor tentou remover DAVE da transmissão".into()
                                    );
                                }
                                pending_transitions.insert(transition_id, version);
                                log::info!(
                                    "[stream][dave] account={} attempt={} opcode=21 state=prepare_transition id={} version={}",
                                    params.account_id,
                                    params.attempt_id,
                                    transition_id,
                                    version
                                );
                            }
                            22 => {
                                let transition_id = data["transition_id"].as_u64().unwrap_or(0);
                                let version = pending_transitions.remove(&transition_id)
                                    .or_else(|| dave_identity.map(|identity| identity.protocol_version.get()))
                                    .ok_or("Transição DAVE executada sem versão conhecida")?;
                                let ready = dave_session.lock().await.as_ref()
                                    .is_some_and(DaveSession::is_ready);
                                if version > 0 && !ready {
                                    return Err(
                                        "O servidor executou a transição DAVE antes das chaves estarem prontas"
                                            .into()
                                    );
                                }
                                dave_negotiation_deadline = None;
                                log::info!(
                                    "[stream][dave] account={} attempt={} state=transition_executed id={} version={} ready={}",
                                    params.account_id,
                                    params.attempt_id,
                                    transition_id,
                                    version,
                                    ready
                                );
                            }
                            24 => {
                                if data["epoch"].as_u64() == Some(1) {
                                    let version = data["protocol_version"].as_u64().unwrap_or(0) as u16;
                                    let version = NonZeroU16::new(version).ok_or("Epoch DAVE inválida")?;
                                    let user_id = params.user_id.parse().map_err(|_| "ID de usuário inválido")?;
                                    let channel_id = params.rtc_server_id.parse::<u64>()
                                        .map_err(|_| "RTC server id inválido")?
                                        .checked_sub(1).ok_or("RTC server id não pode ser zero")?;
                                    let identity = DaveIdentity {
                                        protocol_version: version,
                                        user_id,
                                        channel_id,
                                    };
                                    dave_identity = Some(identity);
                                    dave_session.lock().await.as_mut().ok_or("Sessão DAVE do stream ausente")?
                                        .reinit(
                                            identity.protocol_version,
                                            identity.user_id,
                                            identity.channel_id,
                                            None,
                                        )
                                        .map_err(|error| format!("Falha ao reiniciar DAVE do stream: {error:?}"))?;
                                    send_key_package(&mut ws_tx, &dave_session).await?;
                                    dave_negotiation_deadline = Some(
                                        Instant::now() + DAVE_NEGOTIATION_TIMEOUT
                                    );
                                    log::info!(
                                        "[stream][dave] account={} attempt={} opcode=24 state=epoch_prepared version={} group_id={}",
                                        params.account_id,
                                        params.attempt_id,
                                        version,
                                        channel_id
                                    );
                                }
                            }
                            _ => {}
                        }
                    }
                    Message::Binary(binary) => {
                        let Some((sequence, opcode)) = dave_binary_header(&binary) else {
                            continue;
                        };
                        last_sequence = sequence;
                        last_dave_opcode = Some(opcode);
                        let identity = dave_identity
                            .ok_or("Identidade DAVE ausente ao receber mensagem MLS")?;
                        let outcome = handle_dave_binary(
                            &mut ws_tx,
                            &binary,
                            &dave_session,
                            &expected_users,
                            identity,
                        ).await?;
                        if matches!(outcome.opcode, 27 | 29 | 30)
                            && dave_negotiation_deadline.is_none()
                        {
                            dave_negotiation_deadline = Some(
                                Instant::now() + DAVE_NEGOTIATION_TIMEOUT
                            );
                        }
                        log::info!(
                            "[stream][dave] account={} attempt={} binary_opcode={} sequence={} ready={} recovered={}",
                            params.account_id,
                            params.attempt_id,
                            outcome.opcode,
                            sequence,
                            outcome.ready,
                            outcome.recovered
                        );
                        if outcome.ready {
                            dave_negotiation_deadline = None;
                            emit_stream_status(
                                &app,
                                &params.account_id,
                                &params.attempt_id,
                                "connected",
                                "Criptografia pronta. Iniciando o fluxo RTP...",
                                Some(params.stream_key.clone()),
                            );
                        } else {
                            if outcome.recovered {
                                dave_recovery_attempts = dave_recovery_attempts.saturating_add(1);
                                if dave_recovery_attempts > DAVE_MAX_RECOVERY_ATTEMPTS {
                                    return Err(format!(
                                        "O grupo DAVE da transmissão foi rejeitado {} vezes (último opcode: {})",
                                        dave_recovery_attempts,
                                        outcome.opcode
                                    ));
                                }
                                dave_negotiation_deadline = Some(
                                    Instant::now() + DAVE_NEGOTIATION_TIMEOUT
                                );
                            }
                            emit_stream_status(
                                &app,
                                &params.account_id,
                                &params.attempt_id,
                                "connected",
                                dave_stage_for_opcode(outcome.opcode, outcome.recovered),
                                Some(params.stream_key.clone()),
                            );
                        }
                    }
                    Message::Close(frame) => {
                        let details = frame.map_or_else(
                            || "sem código".to_owned(),
                            |frame| format!("código={}, motivo={}", frame.code, frame.reason),
                        );
                        return Err(format!("Servidor de compartilhamento encerrou a conexão ({details})"));
                    }
                    _ => {}
                }
            }
        }
    }
}

async fn next_capture_result(
    task: &mut Option<JoinHandle<Result<(), String>>>,
) -> Result<(), String> {
    match task.as_mut() {
        Some(task) => task
            .await
            .map_err(|error| format!("A tarefa de captura falhou: {error}"))?,
        None => std::future::pending().await,
    }
}

async fn wait_for_deadline(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => tokio::time::sleep_until(deadline.into()).await,
        None => std::future::pending().await,
    }
}

async fn run_screen_capture(
    context: ScreenCaptureContext,
    mut cancel: watch::Receiver<bool>,
) -> Result<(), String> {
    let ScreenCaptureContext {
        peer,
        track,
        dave_session,
        app,
        account_id,
        attempt_id,
        stream_key,
        video_ssrc,
    } = context;
    let executable = std::env::var_os("ORGANICCORD_FFMPEG_PATH").unwrap_or_else(|| "ffmpeg".into());
    let synthetic = std::env::var("ORGANICCORD_STREAM_SOURCE")
        .is_ok_and(|source| source.eq_ignore_ascii_case("testsrc"));
    let mut command = Command::new(executable);
    command.args(["-hide_banner", "-loglevel", "quiet", "-nostdin"]);
    if synthetic {
        command.args(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=15"]);
    } else {
        command.args([
            "-f",
            "gdigrab",
            "-framerate",
            &STREAM_FPS.to_string(),
            "-draw_mouse",
            "1",
            "-i",
            "desktop",
        ]);
    }
    let video_filter = format!(
        "[0:v]split=2[stream][preview];\
         [stream]scale={STREAM_WIDTH}:{STREAM_HEIGHT}:force_original_aspect_ratio=decrease:flags=fast_bilinear,\
         pad={STREAM_WIDTH}:{STREAM_HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[streamout];\
         [preview]fps={PREVIEW_FPS},scale={PREVIEW_WIDTH}:{PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease:flags=fast_bilinear,\
         pad={PREVIEW_WIDTH}:{PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=yuvj420p[previewout]"
    );
    command
        .args([
            "-an",
            "-filter_complex",
            &video_filter,
            "-map",
            "[streamout]",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-tune",
            "zerolatency",
            "-profile:v",
            "baseline",
            "-level:v",
            "3.1",
            "-g",
            "60",
            "-keyint_min",
            "60",
            "-sc_threshold",
            "0",
            "-x264-params",
            "aud=1:repeat-headers=1:scenecut=0",
            "-f",
            "h264",
            "pipe:1",
            "-map",
            "[previewout]",
            "-an",
            "-c:v",
            "mjpeg",
            "-q:v",
            "7",
            "-f",
            "image2pipe",
            "pipe:2",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);

    let mut child = command.spawn().map_err(|error| {
        format!(
            "Não foi possível iniciar o encoder de tela. Instale o FFmpeg ou configure ORGANICCORD_FFMPEG_PATH: {error}"
        )
    })?;
    let stdout = child
        .stdout
        .take()
        .ok_or("O encoder não disponibilizou o fluxo de vídeo")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("O encoder não disponibilizou o fluxo de prévia")?;

    log::info!(
        "[stream][capture] account={} attempt={} state=started source={} width={} height={} fps={}",
        account_id,
        attempt_id,
        if synthetic { "testsrc" } else { "desktop" },
        STREAM_WIDTH,
        STREAM_HEIGHT,
        STREAM_FPS
    );
    let (dave_ready_at_capture_start, dave_status_at_capture_start) = {
        let guard = dave_session.lock().await;
        guard
            .as_ref()
            .map_or((false, "absent".to_owned()), |session| {
                (session.is_ready(), format!("{:?}", session.status()))
            })
    };
    log::info!(
        "[stream][capture] account={} attempt={} state=dave_snapshot ready={} status={}",
        account_id,
        attempt_id,
        dave_ready_at_capture_start,
        dave_status_at_capture_start
    );
    emit_stream_status(
        &app,
        &account_id,
        &attempt_id,
        "connected",
        if dave_ready_at_capture_start {
            "Criptografia pronta. Preparando os primeiros pacotes RTP..."
        } else {
            "Tela capturada. Aguardando a criptografia da transmissão..."
        },
        Some(stream_key.clone()),
    );

    let (frame_tx, mut frame_rx) = watch::channel(None::<Vec<u8>>);
    let (reader_end_tx, mut reader_end_rx) = mpsc::channel(1);
    let reader_task = tokio::spawn(async move {
        let mut access_units = H264AccessUnitReader::new(stdout);
        let result = loop {
            match access_units.next_access_unit().await {
                Ok(Some(access_unit)) => {
                    // A watch channel holds only the newest encoded frame. Slow encryption or
                    // network writes therefore reduce FPS instead of accumulating latency.
                    frame_tx.send_replace(Some(access_unit));
                }
                Ok(None) => break Ok(()),
                Err(error) => break Err(error),
            }
        };
        let _ = reader_end_tx.send(result).await;
    });
    let (preview_end_tx, mut preview_end_rx) = mpsc::channel(1);
    let preview_app = app.clone();
    let preview_account_id = account_id.clone();
    let preview_attempt_id = attempt_id.clone();
    let preview_task = tokio::spawn(async move {
        let mut frames = JpegFrameReader::new(stderr);
        let mut sequence = 0u64;
        let result = loop {
            match frames.next_frame().await {
                Ok(Some(frame)) => {
                    sequence = sequence.wrapping_add(1);
                    emit_stream_preview(
                        &preview_app,
                        &preview_account_id,
                        &preview_attempt_id,
                        sequence,
                        BASE64_STANDARD.encode(frame),
                    );
                }
                Ok(None) => break Ok(()),
                Err(error) => break Err(error),
            }
        };
        let _ = preview_end_tx.send(result).await;
    });
    let frame_duration = Duration::from_nanos(1_000_000_000 / u64::from(STREAM_FPS));
    let mut streaming_announced = false;
    let mut first_media_deadline = None::<Instant>;
    let mut last_stats_check = Instant::now() - Duration::from_secs(1);
    let mut last_stats_log = Instant::now();

    loop {
        let access_unit = tokio::select! {
            changed = cancel.changed() => {
                if changed.is_err() || *cancel.borrow() {
                    let _ = child.kill().await;
                    reader_task.abort();
                    preview_task.abort();
                    return Ok(());
                }
                continue;
            }
            result = reader_end_rx.recv() => {
                let reader_error = result
                    .unwrap_or_else(|| Err("A tarefa de leitura do encoder foi encerrada".into()))
                    .err();
                let status = child.wait().await
                    .map_err(|error| format!("Falha ao aguardar o encoder: {error}"))?;
                return Err(reader_error.unwrap_or_else(|| {
                    format!("O encoder de tela encerrou com o status {status}")
                }));
            }
            result = preview_end_rx.recv() => {
                let preview_error = result
                    .unwrap_or_else(|| Err("A tarefa de prévia foi encerrada".into()))
                    .err();
                let status = child.wait().await
                    .map_err(|error| format!("Falha ao aguardar o encoder: {error}"))?;
                return Err(preview_error.unwrap_or_else(|| {
                    format!("O fluxo de prévia encerrou antes do vídeo ({status})")
                }));
            }
            changed = frame_rx.changed() => {
                changed.map_err(|_| "O fluxo de frames do encoder foi encerrado".to_string())?;
                frame_rx.borrow_and_update().clone()
                    .ok_or("O encoder não produziu um frame H.264")?
            }
        };

        let encrypted = {
            let mut guard = dave_session.lock().await;
            let Some(session) = guard.as_mut() else {
                continue;
            };
            if !session.is_ready() {
                continue;
            }
            session
                .encrypt(MediaType::VIDEO, Codec::H264, &access_unit)
                .map_err(|error| format!("Falha ao criptografar frame de vídeo: {error:?}"))?
                .into_owned()
        };

        track
            .write_sample(&Sample {
                data: Bytes::from(encrypted),
                timestamp: std::time::SystemTime::now(),
                duration: frame_duration,
                packet_timestamp: 0,
                prev_dropped_packets: 0,
                prev_padding_packets: 0,
            })
            .await
            .map_err(|error| format!("Falha ao enviar frame de vídeo: {error}"))?;

        first_media_deadline.get_or_insert_with(|| Instant::now() + Duration::from_secs(8));
        if last_stats_check.elapsed() >= Duration::from_millis(250) {
            last_stats_check = Instant::now();
            let (packets_sent, bytes_sent) = video_outbound_stats(&peer, video_ssrc).await;

            if !streaming_announced && is_outbound_video_flowing(packets_sent, bytes_sent) {
                streaming_announced = true;
                log::info!(
                    "[stream][capture] account={} attempt={} state=rtp_flowing ssrc={} packets={} bytes={}",
                    account_id,
                    attempt_id,
                    video_ssrc,
                    packets_sent,
                    bytes_sent
                );
                emit_stream_status(
                    &app,
                    &account_id,
                    &attempt_id,
                    "streaming",
                    "Sua tela inteira está sendo compartilhada",
                    Some(stream_key.clone()),
                );
            }

            if last_stats_log.elapsed() >= Duration::from_secs(5) {
                last_stats_log = Instant::now();
                log::info!(
                    "[stream][media] account={} attempt={} ssrc={} packets_sent={} bytes_sent={}",
                    account_id,
                    attempt_id,
                    video_ssrc,
                    packets_sent,
                    bytes_sent
                );
            }

            if !streaming_announced
                && first_media_deadline.is_some_and(|deadline| Instant::now() >= deadline)
            {
                return Err(
                    "O transporte conectou, mas nenhum pacote RTP de vídeo saiu do OrganicCord"
                        .into(),
                );
            }
        }
    }
}

async fn video_outbound_stats(peer: &RTCPeerConnection, expected_ssrc: u32) -> (u64, u64) {
    peer.get_stats()
        .await
        .reports
        .into_values()
        .filter_map(|report| match report {
            StatsReportType::OutboundRTP(stats)
                if stats.kind.eq_ignore_ascii_case("video") && stats.ssrc == expected_ssrc =>
            {
                Some((stats.packets_sent, stats.bytes_sent))
            }
            _ => None,
        })
        .fold((0, 0), |total, current| {
            (total.0 + current.0, total.1 + current.1)
        })
}

fn is_outbound_video_flowing(packets_sent: u64, bytes_sent: u64) -> bool {
    packets_sent > 0 && bytes_sent > 0
}

struct H264AccessUnitReader<R> {
    reader: R,
    buffer: Vec<u8>,
    eof: bool,
}

struct JpegFrameReader<R> {
    reader: R,
    buffer: Vec<u8>,
    eof: bool,
}

impl<R> JpegFrameReader<R>
where
    R: AsyncRead + Unpin,
{
    fn new(reader: R) -> Self {
        Self {
            reader,
            buffer: Vec::with_capacity(128 * 1024),
            eof: false,
        }
    }

    async fn next_frame(&mut self) -> Result<Option<Vec<u8>>, String> {
        loop {
            let start = self
                .buffer
                .windows(2)
                .position(|bytes| bytes == [0xff, 0xd8]);
            if let Some(start) = start.filter(|start| *start > 0) {
                self.buffer.drain(..start);
                continue;
            }
            if start.is_some() {
                if let Some(relative_end) = self.buffer[2..]
                    .windows(2)
                    .position(|bytes| bytes == [0xff, 0xd9])
                {
                    let end = relative_end + 4;
                    let remaining = self.buffer.split_off(end);
                    return Ok(Some(std::mem::replace(&mut self.buffer, remaining)));
                }
            }

            if self.eof {
                return if self.buffer.is_empty() {
                    Ok(None)
                } else {
                    Err("O encoder encerrou no meio de um frame da prévia".into())
                };
            }
            if self.buffer.len() > MAX_PREVIEW_FRAME_BYTES {
                return Err("A prévia gerou um frame excessivamente grande".into());
            }

            let mut chunk = [0u8; 32 * 1024];
            let read = self
                .reader
                .read(&mut chunk)
                .await
                .map_err(|error| format!("Falha ao ler a prévia local: {error}"))?;
            if read == 0 {
                self.eof = true;
            } else {
                self.buffer.extend_from_slice(&chunk[..read]);
            }
        }
    }
}

impl<R> H264AccessUnitReader<R>
where
    R: AsyncRead + Unpin,
{
    fn new(reader: R) -> Self {
        Self {
            reader,
            buffer: Vec::with_capacity(256 * 1024),
            eof: false,
        }
    }

    async fn next_access_unit(&mut self) -> Result<Option<Vec<u8>>, String> {
        loop {
            let aud_offsets = h264_aud_offsets(&self.buffer);
            if let Some(first) = aud_offsets.first().copied().filter(|offset| *offset > 0) {
                self.buffer.drain(..first);
                continue;
            }
            if aud_offsets.len() >= 2 {
                let remaining = self.buffer.split_off(aud_offsets[1]);
                return Ok(Some(std::mem::replace(&mut self.buffer, remaining)));
            }
            if self.eof {
                return if self.buffer.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(std::mem::take(&mut self.buffer)))
                };
            }
            if self.buffer.len() > MAX_ACCESS_UNIT_BYTES {
                return Err("O encoder produziu um frame H.264 excessivamente grande".into());
            }

            let mut chunk = [0u8; 64 * 1024];
            let read = self
                .reader
                .read(&mut chunk)
                .await
                .map_err(|error| format!("Falha ao ler vídeo do encoder: {error}"))?;
            if read == 0 {
                self.eof = true;
            } else {
                self.buffer.extend_from_slice(&chunk[..read]);
            }
        }
    }
}

fn h264_aud_offsets(bytes: &[u8]) -> Vec<usize> {
    let mut offsets = Vec::new();
    let mut index = 0;
    while index + 4 <= bytes.len() {
        let nal_index = if bytes[index..].starts_with(&[0, 0, 0, 1]) {
            Some(index + 4)
        } else if bytes[index..].starts_with(&[0, 0, 1]) {
            Some(index + 3)
        } else {
            None
        };
        if let Some(nal_index) = nal_index {
            if nal_index < bytes.len() && bytes[nal_index] & 0x1f == 9 {
                offsets.push(index);
            }
            index = nal_index;
        } else {
            index += 1;
        }
    }
    offsets
}

async fn create_web_rtc(
    audio_ssrc: u32,
    video_ssrc: u32,
    rtx_ssrc: u32,
    event_tx: mpsc::UnboundedSender<WebRtcEvent>,
) -> Result<(WebRtcMedia, String), String> {
    let mut media_engine = MediaEngine::default();
    media_engine
        .register_codec(
            RTCRtpCodecParameters {
                capability: RTCRtpCodecCapability {
                    mime_type: MIME_TYPE_OPUS.to_owned(),
                    clock_rate: 48_000,
                    channels: 2,
                    sdp_fmtp_line: "minptime=10;useinbandfec=1;usedtx=1".to_owned(),
                    rtcp_feedback: standard_feedback(),
                },
                payload_type: OPUS_PAYLOAD_TYPE,
                ..Default::default()
            },
            RTPCodecType::Audio,
        )
        .map_err(|error| error.to_string())?;
    media_engine
        .register_codec(
            RTCRtpCodecParameters {
                capability: RTCRtpCodecCapability {
                    mime_type: MIME_TYPE_H264.to_owned(),
                    clock_rate: 90_000,
                    channels: 0,
                    sdp_fmtp_line:
                        "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f"
                            .to_owned(),
                    rtcp_feedback: standard_feedback(),
                },
                payload_type: VIDEO_PAYLOAD_TYPE,
                ..Default::default()
            },
            RTPCodecType::Video,
        )
        .map_err(|error| error.to_string())?;
    media_engine
        .register_codec(
            RTCRtpCodecParameters {
                capability: RTCRtpCodecCapability {
                    mime_type: "video/rtx".to_owned(),
                    clock_rate: 90_000,
                    channels: 0,
                    sdp_fmtp_line: format!("apt={VIDEO_PAYLOAD_TYPE}"),
                    rtcp_feedback: vec![],
                },
                payload_type: VIDEO_RTX_PAYLOAD_TYPE,
                ..Default::default()
            },
            RTPCodecType::Video,
        )
        .map_err(|error| error.to_string())?;

    // Discord's Go Live SDP uses stable extension identifiers: audio level = 1,
    // absolute send time = 2 and transport-wide congestion control = 3. The
    // MediaEngine assigns identifiers lazily while building each media section.
    // Register abs-send-time for both kinds to reserve id 2 while the audio
    // section is built; Discord rejects it for audio by omitting it in its
    // answer, while video negotiates it normally.
    media_engine
        .register_header_extension(
            RTCRtpHeaderExtensionCapability {
                uri: AUDIO_LEVEL_URI.to_owned(),
            },
            RTPCodecType::Audio,
            None,
        )
        .map_err(|error| error.to_string())?;
    for media_type in [RTPCodecType::Audio, RTPCodecType::Video] {
        media_engine
            .register_header_extension(
                RTCRtpHeaderExtensionCapability {
                    uri: ABS_SEND_TIME_URI.to_owned(),
                },
                media_type,
                None,
            )
            .map_err(|error| error.to_string())?;
    }

    let registry = register_default_interceptors(Registry::new(), &mut media_engine)
        .map_err(|error| error.to_string())?;
    // The defaults generate TWCC reports for received media. Go Live sends
    // media, so it also needs the sender interceptor to number outgoing RTP.
    let registry = configure_twcc_sender_only(registry, &mut media_engine)
        .map_err(|error| error.to_string())?;
    let api = APIBuilder::new()
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .build();
    let peer = Arc::new(
        api.new_peer_connection(RTCConfiguration {
            ice_servers: if cfg!(test) {
                vec![]
            } else {
                vec![RTCIceServer {
                    urls: vec!["stun:stun.l.google.com:19302".to_owned()],
                    ..Default::default()
                }]
            },
            ..Default::default()
        })
        .await
        .map_err(|error| error.to_string())?,
    );
    let peer_event_tx = event_tx.clone();
    peer.on_peer_connection_state_change(Box::new(move |state| {
        let event_tx = peer_event_tx.clone();
        Box::pin(async move {
            let _ = event_tx.send(WebRtcEvent::Peer(state));
        })
    }));
    peer.on_ice_connection_state_change(Box::new(move |state| {
        let event_tx = event_tx.clone();
        Box::pin(async move {
            let _ = event_tx.send(WebRtcEvent::Ice(state));
        })
    }));

    let audio_track = Arc::new(TrackLocalStaticSample::new(
        RTCRtpCodecCapability {
            mime_type: MIME_TYPE_OPUS.to_owned(),
            ..Default::default()
        },
        "0".to_owned(),
        "organiccord-screen".to_owned(),
    ));
    let audio_transceiver = peer
        .add_transceiver_from_track(
            audio_track,
            Some(RTCRtpTransceiverInit {
                direction: RTCRtpTransceiverDirection::Sendrecv,
                send_encodings: vec![RTCRtpCodingParameters {
                    ssrc: audio_ssrc,
                    payload_type: OPUS_PAYLOAD_TYPE,
                    ..Default::default()
                }],
            }),
        )
        .await
        .map_err(|error| error.to_string())?;
    let audio_sender = audio_transceiver.sender().await;
    let mut audio_parameters = audio_sender.get_parameters().await;
    audio_parameters.encodings = vec![RTCRtpCodingParameters {
        ssrc: audio_ssrc,
        payload_type: OPUS_PAYLOAD_TYPE,
        ..Default::default()
    }];
    audio_sender
        .send(&audio_parameters)
        .await
        .map_err(|error| format!("Falha ao fixar o SSRC de áudio do stream: {error}"))?;

    let video_track = Arc::new(TrackLocalStaticSample::new(
        RTCRtpCodecCapability {
            mime_type: MIME_TYPE_H264.to_owned(),
            clock_rate: 90_000,
            sdp_fmtp_line: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f"
                .to_owned(),
            rtcp_feedback: standard_feedback(),
            ..Default::default()
        },
        "1".to_owned(),
        "organiccord-screen".to_owned(),
    ));
    let video_transceiver = peer
        .add_transceiver_from_track(
            video_track.clone(),
            Some(RTCRtpTransceiverInit {
                direction: RTCRtpTransceiverDirection::Sendrecv,
                send_encodings: vec![RTCRtpCodingParameters {
                    rid: "100".into(),
                    ssrc: video_ssrc,
                    payload_type: VIDEO_PAYLOAD_TYPE,
                    rtx: RTCRtpRtxParameters { ssrc: rtx_ssrc },
                }],
            }),
        )
        .await
        .map_err(|error| error.to_string())?;
    let video_sender = video_transceiver.sender().await;
    let mut video_parameters = video_sender.get_parameters().await;
    video_parameters.encodings = vec![RTCRtpCodingParameters {
        rid: "100".into(),
        ssrc: video_ssrc,
        payload_type: VIDEO_PAYLOAD_TYPE,
        rtx: RTCRtpRtxParameters { ssrc: rtx_ssrc },
    }];
    video_sender
        .send(&video_parameters)
        .await
        .map_err(|error| format!("Falha ao fixar os SSRCs de vídeo do stream: {error}"))?;

    let offer = peer
        .create_offer(None)
        .await
        .map_err(|error| error.to_string())?;
    let mut gathering = peer.gathering_complete_promise().await;
    peer.set_local_description(offer)
        .await
        .map_err(|error| error.to_string())?;
    tokio::time::timeout(Duration::from_secs(10), gathering.recv())
        .await
        .map_err(|_| "Tempo esgotado ao coletar candidatos WebRTC".to_string())?;
    let local_sdp = peer
        .local_description()
        .await
        .ok_or("WebRTC não produziu uma descrição local")?
        .sdp;
    let local_sdp = rewrite_offer_ssrcs(&local_sdp, audio_ssrc, video_ssrc, rtx_ssrc);

    Ok((WebRtcMedia { peer, video_track }, local_sdp))
}

fn standard_feedback() -> Vec<RTCPFeedback> {
    vec![
        RTCPFeedback {
            typ: "nack".to_owned(),
            parameter: String::new(),
        },
        RTCPFeedback {
            typ: "nack".to_owned(),
            parameter: "pli".to_owned(),
        },
        RTCPFeedback {
            typ: "ccm".to_owned(),
            parameter: "fir".to_owned(),
        },
        RTCPFeedback {
            typ: "transport-cc".to_owned(),
            parameter: String::new(),
        },
    ]
}

fn discord_codecs() -> Value {
    json!([
        { "name": "opus", "type": "audio", "clockRate": 48000, "priority": 1000, "payload_type": 120 },
        { "name": "H264", "type": "video", "clockRate": 90000, "priority": 1000, "payload_type": 101, "rtx_payload_type": 102, "encode": true, "decode": false }
    ])
}

fn rewrite_offer_ssrcs(raw: &str, audio_ssrc: u32, video_ssrc: u32, rtx_ssrc: u32) -> String {
    #[derive(Clone, Copy)]
    enum MediaSection {
        Audio,
        Video,
        Other,
    }

    fn append_ssrcs(
        output: &mut Vec<String>,
        section: Option<MediaSection>,
        audio: u32,
        video: u32,
        rtx: u32,
    ) {
        match section {
            Some(MediaSection::Audio) => {
                output.push(format!("a=ssrc:{audio} cname:organiccord"));
                output.push(format!("a=ssrc:{audio} msid:organiccord-screen 0"));
            }
            Some(MediaSection::Video) => {
                output.push(format!("a=ssrc-group:FID {video} {rtx}"));
                for (ssrc, track) in [(video, "1"), (rtx, "1")] {
                    output.push(format!("a=ssrc:{ssrc} cname:organiccord"));
                    output.push(format!("a=ssrc:{ssrc} msid:organiccord-screen {track}"));
                }
            }
            _ => {}
        }
    }

    let mut output = Vec::new();
    let mut section = None;
    for line in raw.lines().map(str::trim_end) {
        if line.starts_with("m=") {
            append_ssrcs(&mut output, section, audio_ssrc, video_ssrc, rtx_ssrc);
            section = if line.starts_with("m=audio ") {
                Some(MediaSection::Audio)
            } else if line.starts_with("m=video ") {
                Some(MediaSection::Video)
            } else {
                Some(MediaSection::Other)
            };
        }
        if line.starts_with("a=ssrc:") || line.starts_with("a=ssrc-group:") {
            continue;
        }
        output.push(line.to_owned());
    }
    append_ssrcs(&mut output, section, audio_ssrc, video_ssrc, rtx_ssrc);
    format!("{}\r\n", output.join("\r\n"))
}

async fn send_video_attributes<S>(
    sink: &mut S,
    audio_ssrc: u32,
    video_ssrc: u32,
    rtx_ssrc: u32,
    width: u32,
    height: u32,
    fps: u32,
) -> Result<(), String>
where
    S: futures_util::Sink<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::fmt::Display,
{
    send_json(
        sink,
        json!({
            "op": 12,
            "d": {
                "audio_ssrc": audio_ssrc,
                "video_ssrc": video_ssrc,
                "rtx_ssrc": rtx_ssrc,
                "streams": [{
                    "type": "video",
                    "rid": "100",
                    "ssrc": video_ssrc,
                    "active": true,
                    "quality": 100,
                    "rtx_ssrc": rtx_ssrc,
                    "max_bitrate": 10_000_000,
                    "max_framerate": fps,
                    "max_resolution": { "type": "fixed", "width": width, "height": height }
                }]
            }
        }),
    )
    .await
}

fn normalize_discord_answer_sdp(raw: &str) -> Result<String, String> {
    let mut connection = None;
    let mut port = None;
    let mut ice_username = None;
    let mut ice_password = None;
    let mut fingerprint = None;
    let mut candidates = Vec::new();

    for line in raw.lines().map(str::trim) {
        if line.starts_with("c=") {
            connection = Some(line.to_owned());
        } else if let Some(value) = line.strip_prefix("a=rtcp:") {
            port = value.split_whitespace().next().map(str::to_owned);
        } else if line.starts_with("a=ice-ufrag:") {
            ice_username = Some(line.to_owned());
        } else if line.starts_with("a=ice-pwd:") {
            ice_password = Some(line.to_owned());
        } else if line.starts_with("a=fingerprint:") {
            fingerprint = Some(line.to_owned());
        } else if line.starts_with("a=candidate:")
            && is_usable_discord_candidate(line)
            && !candidates.iter().any(|candidate| candidate == line)
        {
            candidates.push(line.to_owned());
        }
    }

    let connection = connection.ok_or("SDP do Discord sem endereço")?;
    let port = port.ok_or("SDP do Discord sem porta RTCP")?;
    let ice_username = ice_username.ok_or("SDP do Discord sem ICE ufrag")?;
    let ice_password = ice_password.ok_or("SDP do Discord sem ICE password")?;
    let fingerprint = fingerprint.ok_or("SDP do Discord sem fingerprint")?;
    if candidates.is_empty() {
        return Err("SDP do Discord sem candidato ICE UDP de mídia".into());
    }
    let candidate_block = format!("{}\r\na=end-of-candidates", candidates.join("\r\n"));

    Ok(format!(
        "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0 1\r\na=msid-semantic: WMS\r\n\
m=audio {port} UDP/TLS/RTP/SAVPF 120\r\n{connection}\r\na=extmap:1 {AUDIO_LEVEL_URI}\r\na=extmap:3 {TRANSPORT_CC_URI}\r\na=setup:passive\r\na=mid:0\r\na=recvonly\r\n{ice_username}\r\n{ice_password}\r\n{fingerprint}\r\n{candidate_block}\r\na=rtcp-mux\r\na=rtpmap:120 opus/48000/2\r\na=fmtp:120 minptime=10;useinbandfec=1;usedtx=1\r\na=rtcp-fb:120 transport-cc\r\na=rtcp-fb:120 nack\r\na=ice-lite\r\n\
m=video {port} UDP/TLS/RTP/SAVPF 101 102\r\n{connection}\r\na=extmap:2 {ABS_SEND_TIME_URI}\r\na=extmap:3 {TRANSPORT_CC_URI}\r\na=setup:passive\r\na=mid:1\r\na=recvonly\r\n{ice_username}\r\n{ice_password}\r\n{fingerprint}\r\n{candidate_block}\r\na=rtcp-mux\r\na=rtpmap:101 H264/90000\r\na=fmtp:101 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\na=rtpmap:102 rtx/90000\r\na=fmtp:102 apt=101\r\na=rtcp-fb:101 ccm fir\r\na=rtcp-fb:101 nack\r\na=rtcp-fb:101 nack pli\r\na=rtcp-fb:101 transport-cc\r\na=ice-lite\r\n"
    ))
}

fn is_usable_discord_candidate(line: &str) -> bool {
    let fields: Vec<_> = line.split_whitespace().collect();
    fields.len() >= 6 && fields[1] == "1" && fields[2].eq_ignore_ascii_case("udp")
}

async fn handle_dave_binary<S>(
    sink: &mut S,
    binary: &[u8],
    session: &Arc<Mutex<Option<DaveSession>>>,
    expected_users: &HashSet<u64>,
    identity: DaveIdentity,
) -> Result<DaveBinaryOutcome, String>
where
    S: futures_util::Sink<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::fmt::Display,
{
    let (_, opcode) =
        dave_binary_header(binary).ok_or("Mensagem DAVE binária sem cabeçalho completo")?;
    let mut recovered = false;
    match opcode {
        25 => {
            session
                .lock()
                .await
                .as_mut()
                .ok_or("Sessão DAVE do stream ausente")?
                .set_external_sender(&binary[3..])
                .map_err(|error| format!("External sender DAVE inválido: {error:?}"))?;
        }
        27 if binary.len() >= 4 => {
            let operation = match binary[3] {
                0 => ProposalsOperationType::APPEND,
                1 => ProposalsOperationType::REVOKE,
                _ => return Err("Operação DAVE inválida".into()),
            };
            let users: Vec<u64> = expected_users.iter().copied().collect();
            let value = session
                .lock()
                .await
                .as_mut()
                .ok_or("Sessão DAVE do stream ausente")?
                .process_proposals(operation, &binary[4..], Some(&users))
                .map_err(|error| format!("Proposta DAVE inválida: {error:?}"))?;
            if let Some(value) = value {
                let mut response = Vec::with_capacity(
                    1 + value.commit.len() + value.welcome.as_ref().map_or(0, Vec::len),
                );
                response.push(28);
                response.extend_from_slice(&value.commit);
                if let Some(welcome) = value.welcome {
                    response.extend_from_slice(&welcome);
                }
                sink.send(Message::Binary(response))
                    .await
                    .map_err(|error| error.to_string())?;
            }
        }
        29 if binary.len() >= 5 => {
            let transition_id = u16::from_be_bytes([binary[3], binary[4]]);
            let result = session
                .lock()
                .await
                .as_mut()
                .ok_or("Sessão DAVE do stream ausente")?
                .process_commit(&binary[5..]);
            if let Err(error) = result {
                log::warn!(
                    "[stream][dave] opcode=29 state=invalid_commit transition_id={} detail={:?}",
                    transition_id,
                    error
                );
                recover_invalid_dave(sink, session, identity, transition_id).await?;
                recovered = true;
            } else if transition_id > 0 {
                send_json(
                    sink,
                    json!({ "op": 23, "d": { "transition_id": transition_id } }),
                )
                .await?;
            }
        }
        30 if binary.len() >= 5 => {
            let transition_id = u16::from_be_bytes([binary[3], binary[4]]);
            let result = session
                .lock()
                .await
                .as_mut()
                .ok_or("Sessão DAVE do stream ausente")?
                .process_welcome(&binary[5..]);
            if let Err(error) = result {
                log::warn!(
                    "[stream][dave] opcode=30 state=invalid_welcome transition_id={} detail={:?}",
                    transition_id,
                    error
                );
                recover_invalid_dave(sink, session, identity, transition_id).await?;
                recovered = true;
            } else if transition_id > 0 {
                send_json(
                    sink,
                    json!({ "op": 23, "d": { "transition_id": transition_id } }),
                )
                .await?;
            }
        }
        _ => {}
    }
    let ready = session
        .lock()
        .await
        .as_ref()
        .is_some_and(DaveSession::is_ready);
    Ok(DaveBinaryOutcome {
        opcode,
        ready,
        recovered,
    })
}

fn dave_binary_header(binary: &[u8]) -> Option<(i64, u8)> {
    (binary.len() >= 3).then(|| {
        (
            i64::from(u16::from_be_bytes([binary[0], binary[1]])),
            binary[2],
        )
    })
}

fn dave_stage_for_opcode(opcode: u8, recovered: bool) -> &'static str {
    if recovered {
        return "O grupo criptografado foi recriado. Aguardando novas chaves...";
    }
    match opcode {
        25 => "Servidor de criptografia validado. Aguardando propostas MLS...",
        27 => "Membros validados. Aguardando confirmação das chaves...",
        29 => "Commit MLS aplicado. Aguardando execução da transição...",
        30 => "Welcome MLS aplicado. Aguardando execução da transição...",
        _ => "Negociando criptografia de ponta a ponta...",
    }
}

async fn recover_invalid_dave<S>(
    sink: &mut S,
    session: &Arc<Mutex<Option<DaveSession>>>,
    identity: DaveIdentity,
    transition_id: u16,
) -> Result<(), String>
where
    S: futures_util::Sink<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::fmt::Display,
{
    send_json(
        sink,
        json!({ "op": 31, "d": { "transition_id": transition_id } }),
    )
    .await?;
    session
        .lock()
        .await
        .as_mut()
        .ok_or("Sessão DAVE do stream ausente durante a recuperação")?
        .reinit(
            identity.protocol_version,
            identity.user_id,
            identity.channel_id,
            None,
        )
        .map_err(|error| format!("Falha ao recriar a sessão DAVE: {error:?}"))?;
    send_key_package(sink, session).await
}

async fn send_key_package<S>(
    sink: &mut S,
    session: &Arc<Mutex<Option<DaveSession>>>,
) -> Result<(), String>
where
    S: futures_util::Sink<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::fmt::Display,
{
    let package = session
        .lock()
        .await
        .as_mut()
        .ok_or("Sessão DAVE do stream ausente")?
        .create_key_package()
        .map_err(|error| format!("Falha ao criar pacote DAVE do stream: {error:?}"))?;
    let mut payload = Vec::with_capacity(package.len() + 1);
    payload.push(26);
    payload.extend_from_slice(&package);
    sink.send(Message::Binary(payload))
        .await
        .map_err(|error| error.to_string())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rebuilds_discord_answer_with_required_media_sections() {
        let raw = "c=IN IP4 203.0.113.1\n\
a=rtcp:50000 IN IP4 203.0.113.1\n\
a=ice-ufrag:abc\n\
a=ice-pwd:def\n\
a=fingerprint:sha-256 00:11\n\
a=candidate:1 1 UDP 1 203.0.113.1 50000 typ host\n";
        let result = normalize_discord_answer_sdp(raw).expect("valid SDP");
        assert!(result.contains("m=audio 50000 UDP/TLS/RTP/SAVPF 120"));
        assert!(result.contains("m=video 50000 UDP/TLS/RTP/SAVPF 101 102"));
        assert!(result.contains("a=group:BUNDLE 0 1"));
        assert!(result.contains(&format!("a=extmap:3 {TRANSPORT_CC_URI}")));
        assert!(result.contains("a=end-of-candidates"));
    }

    #[test]
    fn preserves_all_udp_media_candidates_and_rejects_non_media_candidates() {
        let raw = "c=IN IP4 203.0.113.1\n\
a=rtcp:50000 IN IP4 203.0.113.1\n\
a=ice-ufrag:abc\n\
a=ice-pwd:def\n\
a=fingerprint:sha-256 00:11\n\
a=candidate:tcp 1 TCP 1 203.0.113.1 9 typ host tcptype active\n\
a=candidate:rtcp 2 UDP 2 203.0.113.1 50001 typ host\n\
a=candidate:first 1 UDP 3 203.0.113.1 50000 typ host\n\
a=candidate:second 1 udp 4 203.0.113.2 50002 typ host\n";
        let result = normalize_discord_answer_sdp(raw).expect("valid SDP");

        assert!(result.contains("a=candidate:first 1 UDP"));
        assert!(result.contains("a=candidate:second 1 udp"));
        assert!(!result.contains("a=candidate:tcp"));
        assert!(!result.contains("a=candidate:rtcp"));
        assert_eq!(result.matches("a=candidate:first").count(), 2);
        assert_eq!(result.matches("a=candidate:second").count(), 2);
    }

    #[test]
    fn rejects_sdp_without_ice_credentials() {
        assert!(normalize_discord_answer_sdp("c=IN IP4 127.0.0.1").is_err());
    }

    #[test]
    fn exposes_expected_payload_types() {
        let codecs = discord_codecs();
        assert_eq!(codecs.as_array().map(Vec::len), Some(2));
        assert_eq!(codecs[0]["payload_type"], 120);
        assert_eq!(codecs[1]["payload_type"], 101);
        assert_eq!(codecs[1]["rtx_payload_type"], 102);
        assert_eq!(codecs[1]["name"], "H264");
    }

    #[test]
    fn finds_three_and_four_byte_h264_aud_start_codes() {
        let bytes = [
            0, 0, 0, 1, 0x09, 0xf0, 0, 0, 1, 0x67, 1, 2, 0, 0, 1, 0x09, 0xf0,
        ];
        assert_eq!(h264_aud_offsets(&bytes), vec![0, 12]);
    }

    #[tokio::test]
    async fn splits_h264_stream_into_complete_access_units() {
        let first = vec![0, 0, 0, 1, 0x09, 0xf0, 0, 0, 1, 0x65, 1, 2, 3];
        let second = vec![0, 0, 1, 0x09, 0xf0, 0, 0, 1, 0x41, 4, 5, 6];
        let (mut writer, reader) = tokio::io::duplex(128);
        let expected_first = first.clone();
        let expected_second = second.clone();
        tokio::spawn(async move {
            use tokio::io::AsyncWriteExt;
            writer.write_all(&first).await.expect("write first frame");
            writer.write_all(&second).await.expect("write second frame");
        });

        let mut reader = H264AccessUnitReader::new(reader);
        assert_eq!(
            reader.next_access_unit().await.expect("first unit"),
            Some(expected_first)
        );
        assert_eq!(
            reader.next_access_unit().await.expect("second unit"),
            Some(expected_second)
        );
        assert_eq!(reader.next_access_unit().await.expect("eof"), None);
    }

    #[tokio::test]
    async fn splits_fragmented_mjpeg_preview_frames() {
        let first = vec![0xff, 0xd8, 1, 2, 3, 0xff, 0xd9];
        let second = vec![0xff, 0xd8, 4, 5, 0xff, 0xd9];
        let (mut writer, reader) = tokio::io::duplex(64);
        let expected_first = first.clone();
        let expected_second = second.clone();
        tokio::spawn(async move {
            use tokio::io::AsyncWriteExt;
            writer.write_all(&[7, 8, 9]).await.expect("write noise");
            writer.write_all(&first[..4]).await.expect("write fragment");
            writer.write_all(&first[4..]).await.expect("finish frame");
            writer.write_all(&second).await.expect("write second frame");
        });

        let mut reader = JpegFrameReader::new(reader);
        assert_eq!(
            reader.next_frame().await.expect("first preview"),
            Some(expected_first)
        );
        assert_eq!(
            reader.next_frame().await.expect("second preview"),
            Some(expected_second)
        );
        assert_eq!(reader.next_frame().await.expect("preview eof"), None);
    }

    #[tokio::test]
    async fn offer_uses_discord_go_live_extension_ids() {
        let (event_tx, _event_rx) = mpsc::unbounded_channel();
        let (media, offer) = create_web_rtc(1, 2, 3, event_tx)
            .await
            .expect("create WebRTC offer");

        assert!(offer.contains(&format!("a=extmap:1 {AUDIO_LEVEL_URI}")));
        assert!(offer.contains(&format!("a=extmap:2 {ABS_SEND_TIME_URI}")));
        assert!(offer.contains(&format!("a=extmap:3 {TRANSPORT_CC_URI}")));
        assert!(offer.contains("a=ssrc:1 cname:organiccord"));
        assert!(offer.contains("a=ssrc-group:FID 2 3"));
        assert!(offer.contains("a=ssrc:2 cname:organiccord"));
        assert!(offer.contains("a=ssrc:3 cname:organiccord"));
        media.peer.close().await.expect("close peer");
    }

    #[test]
    fn rewrites_all_generated_ssrcs_to_the_discord_assignment() {
        let offer = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 120\r\na=ssrc:41 cname:old\r\n\
m=video 9 UDP/TLS/RTP/SAVPF 101 102\r\na=ssrc-group:FID 51 52\r\n\
a=ssrc:51 cname:old\r\na=ssrc:52 cname:old\r\n";
        let rewritten = rewrite_offer_ssrcs(offer, 101, 201, 202);

        assert!(!rewritten.contains("a=ssrc:41"));
        assert!(!rewritten.contains("a=ssrc:51"));
        assert!(!rewritten.contains("a=ssrc:52"));
        assert!(rewritten.contains("a=ssrc:101 cname:organiccord"));
        assert!(rewritten.contains("a=ssrc-group:FID 201 202"));
        assert!(rewritten.contains("a=ssrc:201 cname:organiccord"));
        assert!(rewritten.contains("a=ssrc:202 cname:organiccord"));
    }

    #[test]
    fn requires_real_packet_and_byte_growth_before_announcing_streaming() {
        assert!(!is_outbound_video_flowing(0, 0));
        assert!(!is_outbound_video_flowing(1, 0));
        assert!(!is_outbound_video_flowing(0, 1));
        assert!(is_outbound_video_flowing(1, 1200));
    }

    #[test]
    fn reads_dave_binary_sequence_for_gateway_heartbeat_ack() {
        assert_eq!(
            dave_binary_header(&[0x12, 0x34, 29, 0, 1]),
            Some((0x1234, 29))
        );
        assert_eq!(dave_binary_header(&[0, 1]), None);
    }

    #[test]
    fn exposes_precise_dave_negotiation_stages() {
        assert!(dave_stage_for_opcode(25, false).contains("Servidor"));
        assert!(dave_stage_for_opcode(27, false).contains("Membros"));
        assert!(dave_stage_for_opcode(29, false).contains("Commit"));
        assert!(dave_stage_for_opcode(30, false).contains("Welcome"));
        assert!(dave_stage_for_opcode(29, true).contains("recriado"));
    }
}
