use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use audiopus::{coder::Encoder, Application, SampleRate, Channels};
use std::sync::Arc;
use tokio::net::UdpSocket;
use davey::{DaveSession, MediaType, Codec};
use serde::{Serialize, Deserialize};

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
            // Tenta pegar a descrição detalhada (pode falhar ou não existir dependendo do SO)
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

    // Configurando Opus Encoder (48kHz, Stereo, 20ms)
    let encoder = Encoder::new(SampleRate::Hz48000, Channels::Stereo, Application::Voip)
        .map_err(|e| format!("Erro criando Opus encoder: {:?}", e))?;
    
    // Variáveis de estado RTP
    let mut seq = 0u16;
    let mut timestamp = 0u32;
    
    // Buffer temporário para acomodar os frames de áudio (20ms = 960 samples por canal = 1920 f32)
    let mut pcm_buffer = Vec::new();

    let stream = device.build_input_stream(
        &config.into(),
        move |data: &[f32], _: &_| {
            // Em um app real, precisaríamos fazer resample do sample rate do sistema para 48kHz
            // e converter canais se não for stereo. Aqui, para a PoC, assumiremos o melhor cenário
            // ou faremos encode de qualquer forma.
            
            pcm_buffer.extend_from_slice(data);
            
            // 960 samples/canal = 1920 floats. Opus requer frames fixos.
            while pcm_buffer.len() >= 1920 {
                let frame: Vec<f32> = pcm_buffer.drain(0..1920).collect();
                
                // Opus Encode
                let mut opus_out = [0u8; 1000];
                match encoder.encode_float(&frame, &mut opus_out) {
                    Ok(len) => {
                        let opus_payload = &opus_out[..len];
                        
                        // Tentar encriptar com DAVE (se a sessão existir)
                        let mut encrypted_payload = None;
                        
                        // Não podemos bloquear a thread de áudio com await, então tentamos um try_lock
                        if let Ok(mut lock) = session.try_lock() {
                            if let Some(dave) = lock.as_mut() {
                                if let Ok(encrypted) = dave.encrypt(MediaType::AUDIO, Codec::OPUS, opus_payload) {
                                    encrypted_payload = Some(encrypted);
                                }
                            }
                        }

                        let final_payload = encrypted_payload.unwrap_or_else(|| opus_payload.to_vec().into());

                        // Montar pacote RTP
                        let mut rtp_packet = Vec::with_capacity(12 + final_payload.len());
                        rtp_packet.push(0x80); // Version 2
                        rtp_packet.push(0x78); // Payload type (120 for Opus)
                        rtp_packet.extend_from_slice(&seq.to_be_bytes());
                        rtp_packet.extend_from_slice(&timestamp.to_be_bytes());
                        rtp_packet.extend_from_slice(&ssrc.to_be_bytes());
                        rtp_packet.extend_from_slice(&final_payload);

                        // Enviar pelo UDP (Non-blocking send via block_on ou thread de envio separada)
                        // Para simplificar, usamos UdpSocket síncrono ou enviamos para um channel tokio
                        let sock_clone = socket.clone();
                        let target = target_addr.clone();
                        tokio::spawn(async move {
                            let _ = sock_clone.send_to(&rtp_packet, target).await;
                        });

                        seq = seq.wrapping_add(1);
                        timestamp = timestamp.wrapping_add(960);
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
    log::info!("[audio] Captura iniciada!");

    Ok(stream)
}
