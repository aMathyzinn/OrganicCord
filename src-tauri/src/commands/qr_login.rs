use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use tauri::{AppHandle, Emitter};

use rsa::{RsaPrivateKey, Oaep};
use spki::EncodePublicKey;
use sha2::{Sha256, Digest};

use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{
    connect_async_tls_with_config,
    tungstenite::Message,
    tungstenite::client::IntoClientRequest,
};

use qrcode::QrCode;
use image::Luma;

pub type QrLoginHandle = Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>;

pub fn new_qr_handle() -> QrLoginHandle {
    Arc::new(Mutex::new(None))
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum QrEvent {
    QrReady { png_b64: String, fingerprint: String },
    Scanned { username: String },
    Confirmed { token: String },
    Error { message: String },
    Cancelled,
}

// Incoming gateway messages
#[derive(Debug, Deserialize)]
struct GwMsg {
    op: String,
    #[serde(default)]
    fingerprint: Option<String>,
    #[serde(default)]
    encrypted_nonce: Option<String>,
    #[serde(default)]
    encrypted_user_payload: Option<String>,
    #[serde(default)]
    encrypted_token: Option<String>,
    #[serde(default)]
    ticket: Option<String>,
}

#[derive(Serialize)]
struct GwInit {
    op: String,
    encoded_public_key: String,
}

#[derive(Serialize)]
struct GwNonceProof {
    op: String,
    proof: String,
}

#[tauri::command]
pub async fn start_qr_login(
    app: AppHandle,
    handle_state: tauri::State<'_, QrLoginHandle>,
) -> Result<(), String> {
    cancel_inner(&handle_state).await;

    let app2 = app.clone();
    let task = tokio::spawn(async move {
        if let Err(e) = run_flow(app2.clone()).await {
            let _ = app2.emit("qr_login_event", QrEvent::Error { message: e.to_string() });
        }
    });

    *handle_state.lock().await = Some(task);
    Ok(())
}

#[tauri::command]
pub async fn cancel_qr_login(
    handle_state: tauri::State<'_, QrLoginHandle>,
) -> Result<(), String> {
    cancel_inner(&handle_state).await;
    Ok(())
}

async fn cancel_inner(h: &QrLoginHandle) {
    if let Some(t) = h.lock().await.take() {
        t.abort();
    }
}

async fn run_flow(app: AppHandle) -> anyhow::Result<()> {
    // --- 1. Generate RSA-2048 ephemeral keypair ---
    let private_key = {
        let mut rng = rand::thread_rng();
        RsaPrivateKey::new(&mut rng, 2048)
            .map_err(|e| anyhow::anyhow!("RSA Keygen error: {}", e))?
    };
    
    let spki_der = private_key.to_public_key().to_public_key_der()
        .map_err(|e| anyhow::anyhow!("SPKI error: {}", e))?;
    
    // Discord expects standard base64 of the SPKI DER key
    let pub_b64 = B64.encode(spki_der.as_bytes());

    // --- 2. WebSocket handshake with required headers ---
    let mut req = "wss://remote-auth-gateway.discord.gg/?v=2"
        .into_client_request()
        .map_err(|e| anyhow::anyhow!("URL error: {}", e))?;
    {
        let h = req.headers_mut();
        h.insert("Origin", "https://discord.com".parse()?);
        h.insert(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                .parse()?,
        );
    }

    let (mut ws, _) = connect_async_tls_with_config(req, None, false, None)
        .await
        .map_err(|e| anyhow::anyhow!("WS connect failed: {}", e))?;

    loop {
        let raw = match ws.next().await {
            Some(Ok(Message::Text(t))) => t.to_string(),
            Some(Ok(Message::Ping(d))) => {
                ws.send(Message::Pong(d)).await.ok();
                continue;
            }
            Some(Ok(Message::Close(_))) | None => {
                let _ = app.emit("qr_login_event", QrEvent::Cancelled);
                return Ok(());
            }
            Some(Ok(_)) => continue,
            Some(Err(e)) => return Err(anyhow::anyhow!("WS error: {}", e)),
        };

        let msg: GwMsg = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };

        match msg.op.as_str() {
            // Server greeting — send our RSA public key
            "hello" => {
                let init = serde_json::to_string(&GwInit {
                    op: "init".into(),
                    encoded_public_key: pub_b64.clone(),
                })?;
                ws.send(Message::Text(init.into())).await?;
            }

            "init" => {
                // Ignore (v2 init is handled via pending_remote_init usually)
            }

            // Server challenges us with encrypted nonce (Encrypted with our RSA public key)
            "nonce_proof" => {
                let enc_b64 = msg.encrypted_nonce
                    .ok_or_else(|| anyhow::anyhow!("nonce_proof missing encrypted_nonce"))?;

                let enc = B64.decode(&enc_b64)?;
                let padding = Oaep::new::<Sha256>();
                let nonce_bytes = private_key.decrypt(padding, &enc)
                    .map_err(|e| anyhow::anyhow!("RSA decrypt failed: {}", e))?;

                // proof = base64url(sha256(nonce)) no padding
                let hash = Sha256::digest(&nonce_bytes);
                let proof = URL_SAFE_NO_PAD.encode(hash.as_slice());

                let reply = serde_json::to_string(&GwNonceProof {
                    op: "nonce_proof".into(),
                    proof,
                })?;
                ws.send(Message::Text(reply.into())).await?;
            }

            // Server responds with fingerprint (what goes in the QR URL)
            "pending_remote_init" => {
                let fingerprint = msg.fingerprint
                    .ok_or_else(|| anyhow::anyhow!("pending_remote_init missing fingerprint"))?;

                // Build QR URL and render PNG
                let qr_url = format!("https://discordapp.com/ra/{}", fingerprint);
                let png_b64 = make_qr_png(&qr_url)?;
                let _ = app.emit("qr_login_event", QrEvent::QrReady { png_b64, fingerprint });
            }

            // User scanned — payload contains "id:avatar_hash:discriminator:username"
            "pending_finish" => {
                let enc_b64 = msg.encrypted_user_payload
                    .ok_or_else(|| anyhow::anyhow!("pending_finish missing encrypted_user_payload"))?;

                let enc = B64.decode(&enc_b64)?;
                let padding = Oaep::new::<Sha256>();
                let plain = private_key.decrypt(padding, &enc)
                    .map_err(|_| anyhow::anyhow!("AES-CBC -> RSA decrypt failed for user payload"))?;
                let text = String::from_utf8_lossy(&plain).to_string();

                // format: "id:avatar:discriminator:username"
                let username = text.splitn(4, ':').nth(3).unwrap_or(&text).to_string();
                let _ = app.emit("qr_login_event", QrEvent::Scanned { username });
            }

            // User confirmed on mobile — contains the token (or ticket in v2)
            "pending_login" | "pending_ticket" | "ticket" => {
                // Em Remote Auth v2, o Discord envia "ticket" em vez de "encrypted_token".
                if let Some(ticket) = msg.ticket {
                    // Nós emitimos isso para o frontend para trocar o ticket pelo token!
                    // Ou podemos pegar o token diretamente via HTTP POST aqui no backend!
                    let client = reqwest::Client::new();
                    let res = client.post("https://discord.com/api/v9/users/@me/remote-auth/login")
                        .json(&serde_json::json!({ "ticket": ticket }))
                        .send()
                        .await
                        .map_err(|e| anyhow::anyhow!("Failed to POST ticket: {}", e))?;
                        
                    let body: serde_json::Value = res.json()
                        .await
                        .map_err(|e| anyhow::anyhow!("Failed to read ticket response: {}", e))?;
                        
                    let enc_b64 = body.get("encrypted_token")
                        .and_then(|t| t.as_str())
                        .ok_or_else(|| anyhow::anyhow!("Response missing encrypted_token"))?;
                        
                    let enc = B64.decode(&enc_b64)?;
                    let padding = Oaep::new::<Sha256>();
                    let token_bytes = private_key.decrypt(padding, &enc)
                        .map_err(|_| anyhow::anyhow!("RSA decrypt failed for token from ticket"))?;
                    let token = String::from_utf8(token_bytes)
                        .map_err(|_| anyhow::anyhow!("Token not valid UTF-8"))?;

                    let _ = app.emit("qr_login_event", QrEvent::Confirmed { token });
                    ws.close(None).await.ok();
                    return Ok(());
                }

                // Fallback para v1 ou se vier no mesmo payload
                let enc_b64 = msg.encrypted_token
                    .ok_or_else(|| anyhow::anyhow!("pending_login missing encrypted_token or ticket"))?;

                let enc = B64.decode(&enc_b64)?;
                let padding = Oaep::new::<Sha256>();
                let token_bytes = private_key.decrypt(padding, &enc)
                    .map_err(|_| anyhow::anyhow!("RSA decrypt failed for token"))?;
                let token = String::from_utf8(token_bytes)
                    .map_err(|_| anyhow::anyhow!("Token not valid UTF-8"))?;

                let _ = app.emit("qr_login_event", QrEvent::Confirmed { token });
                ws.close(None).await.ok();
                return Ok(());
            }

            "cancel" => {
                let _ = app.emit("qr_login_event", QrEvent::Cancelled);
                return Ok(());
            }

            _ => {
                println!("Unhandled WS op: {}", msg.op);
            }
        }
    }
}

fn make_qr_png(content: &str) -> anyhow::Result<String> {
    let code = QrCode::new(content.as_bytes())
        .map_err(|e| anyhow::anyhow!("QR encode: {}", e))?;

    let img = code
        .render::<Luma<u8>>()
        .min_dimensions(260, 260)
        .quiet_zone(true)
        .build();

    let dyn_img = image::DynamicImage::ImageLuma8(img);
    let mut buf = Vec::new();
    dyn_img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
    Ok(B64.encode(&buf))
}
