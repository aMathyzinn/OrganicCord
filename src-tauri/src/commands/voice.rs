use tauri::State;
use crate::gateway::GatewayManager;
use tokio_tungstenite::{connect_async_tls_with_config, tungstenite::Message};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::net::UdpSocket;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Duration;
use std::num::NonZeroU16;
use davey::{DaveSession, DAVE_PROTOCOL_VERSION};

/// Envia o sinal para o gateway principal dizendo "Quero entrar nesse canal de voz"
#[tauri::command]
pub async fn gateway_join_voice(
    account_id: String,
    guild_id: Option<String>,
    channel_id: Option<String>,
    gateway: State<'_, GatewayManager>,
) -> Result<(), String> {
    gateway.join_voice_channel(&account_id, guild_id, channel_id).await
}

/// Inicia o WebSocket de voz com os parâmetros recebidos do Discord
#[tauri::command]
pub async fn start_voice_connection(
    account_id: String,
    server_id: String, 
    channel_id: String,
    session_id: String,
    token: String,
    endpoint: String,
    user_id: String,
    input_device_id: Option<String>,
) -> Result<(), String> {
    log::info!("[voice] Iniciando Voice WS para a conta {} no endpoint {}", account_id, endpoint);
    
    // O Discord pode retornar a URL com porta (ex: "us-east1.discord.media:443")
    // Precisamos formatar com wss:// e passar v=8 (A versão 8 suporta DAVE/MLS)
    let url = format!("wss://{}/?v=8", endpoint);
    let request = match url.into_client_request() {
        Ok(r) => r,
        Err(e) => return Err(format!("Falha ao criar request: {}", e)),
    };

    tokio::spawn(async move {
        match connect_async_tls_with_config(request, None, false, None).await {
            Ok((ws_stream, _)) => {
                log::info!("[voice] Conectado com sucesso ao servidor de voz");
                let (ws_tx, mut ws_rx) = ws_stream.split();

                let ws_tx = Arc::new(Mutex::new(ws_tx));
                
                // Variáveis compartilhadas
                let session = Arc::new(Mutex::new(None::<DaveSession>));
                let heartbeat_interval = Arc::new(Mutex::new(0.0));
                let udp_socket_ref: Arc<Mutex<Option<Arc<UdpSocket>>>> = Arc::new(Mutex::new(None));
                let target_addr_ref = Arc::new(Mutex::new(String::new()));
                let ssrc_ref = Arc::new(Mutex::new(0u32));
                
                let mut _audio_keeper = None; // Mantém o canal TX vivo até a conexão ser desfeita

                // Loop principal de WS
                while let Some(msg) = ws_rx.next().await {
                    match msg {
                        Ok(Message::Text(text)) => {
                            let payload: Value = match serde_json::from_str(&text) {
                                Ok(p) => p,
                                Err(_) => continue,
                            };
                            let op = payload["op"].as_i64().unwrap_or(-1);

                            if op == 8 {
                                // HELLO
                                let d = &payload["d"];
                                let interval = d["heartbeat_interval"].as_f64().unwrap_or(41.25);
                                *heartbeat_interval.lock().await = interval;
                                log::info!("[voice] HELLO recebido, heartbeat: {}", interval);
                                
                                // Inicia rotina de heartbeat
                                let tx_clone = ws_tx.clone();
                                tokio::spawn(async move {
                                    let mut seq: u64 = 0;
                                    loop {
                                        tokio::time::sleep(Duration::from_millis(interval as u64)).await;
                                        seq += 1;
                                        let hb = json!({ "op": 3, "d": seq });
                                        if let Err(e) = tx_clone.lock().await.send(Message::Text(hb.to_string().into())).await {
                                            log::error!("[voice] Erro enviando heartbeat: {}", e);
                                            break;
                                        }
                                    }
                                });

                                // Envia IDENTIFY
                                let identify = json!({
                                    "op": 0,
                                    "d": {
                                        "server_id": server_id,
                                        "user_id": user_id,
                                        "session_id": session_id,
                                        "token": token
                                    }
                                });
                                
                                if let Err(e) = ws_tx.lock().await.send(Message::Text(identify.to_string().into())).await {
                                    log::error!("[voice] Erro enviando IDENTIFY: {}", e);
                                }

                            } else if op == 2 {
                                // READY
                                log::info!("[voice] READY recebido");
                                let d = &payload["d"];
                                let ssrc = d["ssrc"].as_u64().unwrap_or(0) as u32;
                                let voice_ip = d["ip"].as_str().unwrap_or("").to_string();
                                let voice_port = d["port"].as_u64().unwrap_or(0) as u16;

                                if !voice_ip.is_empty() && voice_port > 0 {
                                    let socket = Arc::new(UdpSocket::bind("0.0.0.0:0").await.expect("Failed to bind UDP"));
                                    let target_addr = format!("{}:{}", voice_ip, voice_port);

                                    *udp_socket_ref.lock().await = Some(socket.clone());
                                    *target_addr_ref.lock().await = target_addr.clone();
                                    *ssrc_ref.lock().await = ssrc;

                                    let mut packet = [0u8; 74];
                                    packet[0] = 0x00; packet[1] = 0x01;
                                    packet[2] = 0x00; packet[3] = 0x46;
                                    packet[4..8].copy_from_slice(&ssrc.to_be_bytes());

                                    if socket.send_to(&packet, &target_addr).await.is_ok() {
                                        let mut buf = [0u8; 1024];
                                        if let Ok(Ok((len, _))) = tokio::time::timeout(Duration::from_secs(5), socket.recv_from(&mut buf)).await {
                                            if len >= 74 {
                                                let ip_end = buf[8..72].iter().position(|&b| b == 0).unwrap_or(64);
                                                let ext_ip = String::from_utf8_lossy(&buf[8..8+ip_end]).into_owned();
                                                let ext_port = u16::from_be_bytes([buf[72], buf[73]]);
                                                
                                                log::info!("[voice] Discovered IP: {}:{}", ext_ip, ext_port);

                                                let select_protocol = json!({
                                                    "op": 1,
                                                    "d": {
                                                        "protocol": "udp",
                                                        "data": {
                                                            "address": ext_ip,
                                                            "port": ext_port,
                                                            "mode": "aead_aes256_gcm_rtpsize"
                                                        }
                                                    }
                                                });
                                                if let Err(e) = ws_tx.lock().await.send(Message::Text(select_protocol.to_string().into())).await {
                                                    log::error!("[voice] Erro SELECT_PROTOCOL: {}", e);
                                                }
                                            }
                                        }
                                    }
                                }
                            } else if op == 4 {
                                // SESSION_DESCRIPTION
                                log::info!("[voice] SESSION_DESCRIPTION recebido!");
                                let protocol_version = NonZeroU16::new(DAVE_PROTOCOL_VERSION).unwrap();
                                let my_user_id = user_id.parse::<u64>().unwrap_or(0);
                                let my_channel_id = channel_id.parse::<u64>().unwrap_or(0);

                                let mut dave = match DaveSession::new(protocol_version, my_user_id, my_channel_id, None) {
                                    Ok(s) => s,
                                    Err(e) => {
                                        log::error!("[voice] Erro criando DaveSession: {:?}", e);
                                        continue;
                                    }
                                };
                                
                                if let Ok(key_package) = dave.create_key_package() {
                                    let dave_payload = json!({
                                        "op": 26,
                                        "d": { "key_package": key_package }
                                    });
                                    if ws_tx.lock().await.send(Message::Text(dave_payload.to_string().into())).await.is_ok() {
                                        log::info!("[voice] DAVE MLS Key Package enviado!");
                                    }
                                }
                                *session.lock().await = Some(dave);

                                let (audio_tx, audio_rx) = std::sync::mpsc::channel::<()>();
                                _audio_keeper = Some(audio_tx);
                                
                                if let (Some(socket), target_addr, ssrc) = (
                                    udp_socket_ref.lock().await.clone(),
                                    target_addr_ref.lock().await.clone(),
                                    *ssrc_ref.lock().await
                                ) {
                                    let input_id_clone = input_device_id.clone();
                                    let session_clone = session.clone();
                                    std::thread::spawn(move || {
                                        match crate::commands::audio::start_audio_capture(socket, target_addr, ssrc, session_clone, input_id_clone) {
                                            Ok(_stream) => {
                                                log::info!("[audio] Stream iniciada. Mantendo thread viva...");
                                                let _ = audio_rx.recv(); // Bloqueia até o canal ser fechado ou enviar mensagem
                                                log::info!("[audio] Stream encerrada.");
                                            }
                                            Err(e) => {
                                                log::error!("[voice] Erro ao iniciar áudio: {}", e);
                                            }
                                        }
                                    });
                                }

                            } else if op == 27 {
                                log::info!("[voice] DAVE MLS Proposals (Opcode 27) recebido!");
                            } else if op == 29 {
                                log::info!("[voice] DAVE MLS Announce Commit Transition (Opcode 29) recebido!");
                            } else if op == 30 {
                                log::info!("[voice] DAVE MLS Welcome (Opcode 30) recebido!");
                            }
                        }
                        Ok(_) => {}
                        Err(e) => {
                            log::error!("[voice] Erro no WS: {}", e);
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("[voice] Falha ao conectar ao servidor de voz: {}", e);
            }
        }
    });

    Ok(())
}
