use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use audiopus::{coder::Encoder, coder::Decoder, Application, SampleRate, Channels};
use std::sync::Arc;
use tokio::net::UdpSocket;
use davey::{DaveSession, MediaType, Codec};
use serde::{Serialize, Deserialize};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit, Payload};
use std::collections::VecDeque;
use std::sync::Mutex as StdMutex;

#[derive(Serialize, Deserialize)]
pub struct AudioDevice {
    id: String,
    name: String,
    is_input: bool,
}

#[tauri::command]
pub fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let mut devices = Vec::new();

    if let Ok(input_devices) = host.input_devices() {
        for (i, device) in input_devices.enumerate() {
            let name = device.name().unwrap_or_else(|_| format!("Dispositivo de Entrada {}", i));
            let display_name = device.name().unwrap_or_else(|_| name.clone());
            
            devices.push(AudioDevice {
                id: format!("{}-in-{}", name, i),
                name: display_name,
                is_input: true,
            });
        }
    }

    if let Ok(output_devices) = host.output_devices() {
        for (i, device) in output_devices.enumerate() {
            let name = device.name().unwrap_or_else(|_| format!("Dispositivo de Saída {}", i));
            let display_name = device.name().unwrap_or_else(|_| name.clone());

            devices.push(AudioDevice {
                id: format!("{}-out-{}", name, i),
                name: display_name,
                is_input: false,
            });
        }
    }

    Ok(devices)
}

pub fn start_audio_capture(
    socket: Arc<UdpSocket>,
    target_addr: String,
    ssrc: u32,
    secret_key: Vec<u8>,
    session: Arc<tokio::sync::Mutex<Option<DaveSession>>>,
    input_device_id: Option<String>,
) -> Result<cpal::Stream, String> {
    log::info!("[audio] Iniciando captura de microfone...");
    let host = cpal::default_host();
    
    let device = if let Some(id) = input_device_id {
        let mut found = None;
        if let Ok(devices) = host.input_devices() {
            for (i, d) in devices.enumerate() {
                let name = d.name().unwrap_or_else(|_| format!("Dispositivo de Entrada {}", i));
                let computed_id = format!("{}-in-{}", name, i);
                if computed_id == id {
                    found = Some(d);
                    break;
                }
            }
        }
        found.unwrap_or(host.default_input_device().ok_or("Nenhum microfone padrão")?)
    } else {
        host.default_input_device().ok_or("Nenhum microfone padrão")?
    };
    let config = device.default_input_config().map_err(|e| e.to_string())?;

    // Opus Encoder (48kHz, Stereo, Voip)
    let encoder = Encoder::new(SampleRate::Hz48000, Channels::Stereo, Application::Voip)
        .map_err(|e| format!("Erro criando Opus encoder: {:?}", e))?;
    
    let key = if secret_key.len() == 32 {
        Key::<Aes256Gcm>::from_slice(&secret_key).clone()
    } else {
        return Err(format!("Secret key inválida: esperados 32 bytes, recebidos {}", secret_key.len()));
    };
    let cipher = Aes256Gcm::new(&key);

    let mut seq = 0u16;
    let mut timestamp = 0u32;
    let mut nonce_cnt = 0u32;
    
    let mut pcm_buffer = Vec::new();

    let stream = device.build_input_stream(
        &config.into(),
        move |data: &[f32], _: &_| {
            pcm_buffer.extend_from_slice(data);
            
            while pcm_buffer.len() >= 1920 {
                let frame: Vec<f32> = pcm_buffer.drain(0..1920).collect();
                
                let mut opus_out = [0u8; 1000];
                match encoder.encode_float(&frame, &mut opus_out) {
                    Ok(len) => {
                        let opus_payload = &opus_out[..len];
                        
                        let mut encrypted_payload = None;
                        if let Ok(mut lock) = session.try_lock() {
                            if let Some(dave) = lock.as_mut() {
                                if let Ok(encrypted) = dave.encrypt(MediaType::AUDIO, Codec::OPUS, opus_payload) {
                                    encrypted_payload = Some(encrypted);
                                }
                            }
                        }

                        let payload_bytes = encrypted_payload.unwrap_or_else(|| opus_payload.to_vec().into());

                        // 12-byte RTP Header
                        let mut rtp_header = [0u8; 12];
                        rtp_header[0] = 0x80; // Version 2
                        rtp_header[1] = 0x78; // Payload type (120 for Opus)
                        rtp_header[2..4].copy_from_slice(&seq.to_be_bytes());
                        rtp_header[4..8].copy_from_slice(&timestamp.to_be_bytes());
                        rtp_header[8..12].copy_from_slice(&ssrc.to_be_bytes());

                        // 12-byte Nonce para AES-256-GCM
                        let mut nonce_bytes = [0u8; 12];
                        nonce_bytes[0..4].copy_from_slice(&nonce_cnt.to_be_bytes());

                        let ciphertext = match cipher.encrypt(
                            Nonce::from_slice(&nonce_bytes),
                            Payload { msg: &payload_bytes, aad: &rtp_header }
                        ) {
                            Ok(c) => c,
                            Err(e) => {
                                log::error!("[audio] Erro Criptografia AES-GCM: {:?}", e);
                                continue;
                            }
                        };

                        let mut rtp_packet = Vec::with_capacity(12 + ciphertext.len() + 4);
                        rtp_packet.extend_from_slice(&rtp_header);
                        rtp_packet.extend_from_slice(&ciphertext);
                        rtp_packet.extend_from_slice(&nonce_cnt.to_be_bytes());

                        let sock_clone = socket.clone();
                        let target = target_addr.clone();
                        tokio::spawn(async move {
                            let _ = sock_clone.send_to(&rtp_packet, target).await;
                        });

                        seq = seq.wrapping_add(1);
                        timestamp = timestamp.wrapping_add(960);
                        nonce_cnt = nonce_cnt.wrapping_add(1);
                    }
                    Err(e) => {
                        log::error!("[audio] Erro Opus Encode: {:?}", e);
                    }
                }
            }
        },
        move |err| {
            log::error!("[audio] Erro no stream do microfone: {}", err);
        },
        None,
    ).map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;
    log::info!("[audio] Captura e envio de microfone iniciados com sucesso!");

    Ok(stream)
}

pub fn start_audio_playback(
    socket: Arc<UdpSocket>,
    secret_key: Vec<u8>,
    session: Arc<tokio::sync::Mutex<Option<DaveSession>>>,
    output_device_id: Option<String>,
) -> Result<cpal::Stream, String> {
    log::info!("[audio] Iniciando recepção e reprodução de áudio...");
    let host = cpal::default_host();

    let device = if let Some(id) = output_device_id {
        let mut found = None;
        if let Ok(devices) = host.output_devices() {
            for (i, d) in devices.enumerate() {
                let name = d.name().unwrap_or_else(|_| format!("Dispositivo de Saída {}", i));
                let computed_id = format!("{}-out-{}", name, i);
                if computed_id == id {
                    found = Some(d);
                    break;
                }
            }
        }
        found.unwrap_or(host.default_output_device().ok_or("Nenhum alto-falante padrão")?)
    } else {
        host.default_output_device().ok_or("Nenhum alto-falante padrão")?
    };
    let config = device.default_output_config().map_err(|e| e.to_string())?;

    let sample_queue = Arc::new(StdMutex::new(VecDeque::<f32>::with_capacity(38400)));
    let queue_clone = sample_queue.clone();

    // Stream de saída do CPAL
    let stream = device.build_output_stream(
        &config.into(),
        move |data: &mut [f32], _: &_| {
            let mut queue = queue_clone.lock().unwrap();
            for sample in data.iter_mut() {
                *sample = queue.pop_front().unwrap_or(0.0);
            }
        },
        move |err| {
            log::error!("[audio] Erro no stream de saída de som: {}", err);
        },
        None,
    ).map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;

    // Thread receptora de pacotes UDP do Discord
    let key = if secret_key.len() == 32 {
        Key::<Aes256Gcm>::from_slice(&secret_key).clone()
    } else {
        return Err(format!("Secret key inválida: esperados 32 bytes, recebidos {}", secret_key.len()));
    };

    tokio::spawn(async move {
        let cipher = Aes256Gcm::new(&key);
        let mut decoder = match Decoder::new(SampleRate::Hz48000, Channels::Stereo) {
            Ok(d) => d,
            Err(e) => {
                log::error!("[audio] Erro criando Opus Decoder: {:?}", e);
                return;
            }
        };

        let mut buf = [0u8; 2048];
        loop {
            match socket.recv_from(&mut buf).await {
                Ok((len, _)) => {
                    // Mínimo de tamanho de pacote RTP encriptado (12B header + 16B GCM tag + 4B nonce)
                    if len < 32 {
                        continue;
                    }

                    // Ignorar se não for versão RTP 2 (0x80)
                    if (buf[0] & 0xC0) != 0x80 {
                        continue;
                    }

                    let rtp_header = &buf[0..12];
                    let nonce_bytes_suffix = &buf[len - 4..len];
                    let ciphertext_and_tag = &buf[12..len - 4];

                    let mut nonce_bytes = [0u8; 12];
                    nonce_bytes[0..4].copy_from_slice(nonce_bytes_suffix);

                    let decrypted = match cipher.decrypt(
                        Nonce::from_slice(&nonce_bytes),
                        Payload { msg: ciphertext_and_tag, aad: rtp_header }
                    ) {
                        Ok(d) => d,
                        Err(_) => continue,
                    };

                    // Tentativa de descriptografia DAVE
                    let sender_ssrc = u32::from_be_bytes([buf[8], buf[9], buf[10], buf[11]]) as u64;
                    let mut final_opus = decrypted;
                    if let Ok(mut lock) = session.try_lock() {
                        if let Some(dave) = lock.as_mut() {
                            if let Ok(plain) = dave.decrypt(sender_ssrc, MediaType::AUDIO, &final_opus) {
                                final_opus = plain.to_vec();
                            }
                        }
                    }

                    let mut pcm_out = vec![0.0f32; 1920];
                    match decoder.decode_float(Some(&final_opus), &mut pcm_out, false) {
                        Ok(num_samples) => {
                            let total_floats = num_samples * 2;
                            let mut queue = sample_queue.lock().unwrap();
                            if queue.len() < 38400 {
                                queue.extend(&pcm_out[..total_floats]);
                            }
                        }
                        Err(e) => {
                            log::debug!("[audio] Erro ao decodificar Opus: {:?}", e);
                        }
                    }
                }
                Err(e) => {
                    log::error!("[audio] Erro ao receber pacote UDP: {}", e);
                    break;
                }
            }
        }
    });

    log::info!("[audio] Loop de reprodução e recepção UDP de áudio iniciado!");
    Ok(stream)
}
