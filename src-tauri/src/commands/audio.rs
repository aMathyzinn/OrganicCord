use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample, I24, U24};
use davey::{Codec, DaveSession, MediaType};
use nnnoiseless::DenoiseState;
use opus::{Application, Channels, Decoder, Encoder};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::HashSet;
use std::collections::VecDeque;
use std::sync::Mutex as StdMutex;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::net::UdpSocket;
use tokio::sync::{mpsc, watch};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VoiceEncryptionMode {
    AeadAes256GcmRtpSize,
    AeadXChaCha20Poly1305RtpSize,
}

impl VoiceEncryptionMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AeadAes256GcmRtpSize => "aead_aes256_gcm_rtpsize",
            Self::AeadXChaCha20Poly1305RtpSize => "aead_xchacha20_poly1305_rtpsize",
        }
    }
}

enum TransportCipher {
    Aes(Box<Aes256Gcm>),
    XChaCha(XChaCha20Poly1305),
}

impl TransportCipher {
    fn new(mode: VoiceEncryptionMode, secret_key: &[u8]) -> Result<Self, String> {
        if secret_key.len() != 32 {
            return Err(format!(
                "Secret key inválida: esperados 32 bytes, recebidos {}",
                secret_key.len()
            ));
        }
        Ok(match mode {
            VoiceEncryptionMode::AeadAes256GcmRtpSize => Self::Aes(Box::new(Aes256Gcm::new(
                Key::<Aes256Gcm>::from_slice(secret_key),
            ))),
            VoiceEncryptionMode::AeadXChaCha20Poly1305RtpSize => Self::XChaCha(
                XChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(secret_key)),
            ),
        })
    }

    fn encrypt(&self, nonce_counter: u32, header: &[u8], plaintext: &[u8]) -> Option<Vec<u8>> {
        let payload = Payload {
            msg: plaintext,
            aad: header,
        };
        match self {
            Self::Aes(cipher) => {
                let mut nonce = [0u8; 12];
                nonce[..4].copy_from_slice(&nonce_counter.to_be_bytes());
                cipher.encrypt(Nonce::from_slice(&nonce), payload).ok()
            }
            Self::XChaCha(cipher) => {
                let mut nonce = [0u8; 24];
                nonce[..4].copy_from_slice(&nonce_counter.to_be_bytes());
                cipher.encrypt(XNonce::from_slice(&nonce), payload).ok()
            }
        }
    }

    fn decrypt(&self, nonce_suffix: &[u8], header: &[u8], ciphertext: &[u8]) -> Option<Vec<u8>> {
        if nonce_suffix.len() != 4 {
            return None;
        }
        let payload = Payload {
            msg: ciphertext,
            aad: header,
        };
        match self {
            Self::Aes(cipher) => {
                let mut nonce = [0u8; 12];
                nonce[..4].copy_from_slice(nonce_suffix);
                cipher.decrypt(Nonce::from_slice(&nonce), payload).ok()
            }
            Self::XChaCha(cipher) => {
                let mut nonce = [0u8; 24];
                nonce[..4].copy_from_slice(nonce_suffix);
                cipher.decrypt(XNonce::from_slice(&nonce), payload).ok()
            }
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_input: bool,
    pub is_default: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputInfo {
    pub requested_device_id: Option<String>,
    pub active_device_id: Option<String>,
    pub active_device_name: String,
    pub fallback: bool,
    pub sample_rate: u32,
    pub channels: u16,
}

#[derive(Clone, Debug)]
pub enum AudioPlaybackEvent {
    OutputReady(AudioOutputInfo),
    OutputChangeFailed {
        requested_device_id: Option<String>,
        error: String,
    },
    PipelineProgress(AudioPipelineStage),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AudioPipelineStage {
    UdpPacketReceived,
    TransportDecrypted,
    DaveDecrypted,
    OpusDecoded,
    PcmConsumed,
}

impl AudioPipelineStage {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::UdpPacketReceived => "udp_packet_received",
            Self::TransportDecrypted => "transport_decrypted",
            Self::DaveDecrypted => "dave_decrypted",
            Self::OpusDecoded => "opus_decoded",
            Self::PcmConsumed => "pcm_consumed",
        }
    }
}

struct SelectedOutputDevice {
    device: cpal::Device,
    requested_device_id: Option<String>,
    fallback: bool,
}

#[cfg(target_os = "windows")]
fn communications_output_device_id() -> Option<String> {
    use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows::Win32::Media::Audio::{
        eCommunications, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };

    unsafe {
        // CPAL uses the Console role. Calls should follow Windows' communications role instead,
        // which is where Bluetooth headsets are commonly assigned.
        let initialization = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if !initialization.is_ok() && initialization != RPC_E_CHANGED_MODE {
            log::warn!("[audio] Não foi possível inicializar COM para ler o dispositivo de comunicações: {initialization}");
            return None;
        }

        let result = (|| {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eCommunications)
                .ok()?;
            device.GetId().ok()?.to_string().ok()
        })();

        if initialization.is_ok() {
            CoUninitialize();
        }
        result
    }
}

#[cfg(not(target_os = "windows"))]
fn communications_output_device_id() -> Option<String> {
    None
}

fn device_id(device: &cpal::Device) -> Option<String> {
    device.id().ok().map(|id| id.to_string())
}

fn native_device_id(device: &cpal::Device) -> Option<String> {
    device.id().ok().map(|id| id.1)
}

fn matches_device_id(device: &cpal::Device, requested_id: &str) -> bool {
    device
        .id()
        .is_ok_and(|id| id.to_string() == requested_id || id.1 == requested_id)
}

fn device_name(device: &cpal::Device, fallback: String) -> String {
    device
        .description()
        .map(|description| description.name().to_owned())
        .unwrap_or(fallback)
}

fn output_device_by_id(host: &cpal::Host, id: &str) -> Option<cpal::Device> {
    host.output_devices()
        .ok()?
        .find(|device| matches_device_id(device, id))
}

fn preferred_output_device(
    host: &cpal::Host,
    requested_id: Option<&str>,
) -> Result<SelectedOutputDevice, String> {
    if let Some(id) = requested_id {
        if let Some(device) = output_device_by_id(host, id) {
            log::info!(
                "[audio] Saída manual selecionada: {}",
                device_name(&device, "Dispositivo de saída".into())
            );
            return Ok(SelectedOutputDevice {
                device,
                requested_device_id: Some(id.to_owned()),
                fallback: false,
            });
        }
        log::warn!("[audio] A saída salva não está disponível; usando o dispositivo de comunicações do Windows.");
    }

    if let Some(id) = communications_output_device_id() {
        if let Some(device) = output_device_by_id(host, &id) {
            log::info!(
                "[audio] Saída automática: padrão de comunicações do Windows ({})",
                device_name(&device, "Dispositivo de saída".into())
            );
            return Ok(SelectedOutputDevice {
                device,
                requested_device_id: requested_id.map(str::to_owned),
                fallback: requested_id.is_some(),
            });
        }
        log::warn!("[audio] O padrão de comunicações do Windows não pôde ser aberto pelo WASAPI; usando o padrão geral.");
    }

    host.default_output_device()
        .map(|device| SelectedOutputDevice {
            device,
            requested_device_id: requested_id.map(str::to_owned),
            fallback: requested_id.is_some(),
        })
        .ok_or_else(|| "Nenhum alto-falante disponível no Windows".to_string())
}

#[tauri::command]
pub fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let mut devices = Vec::new();
    let mut seen = HashSet::new();
    let default_input_id = host.default_input_device().as_ref().and_then(device_id);
    let communications_output_id = communications_output_device_id();
    let fallback_output_id = host.default_output_device().as_ref().and_then(device_id);

    match host.input_devices() {
        Ok(input_devices) => {
            for (i, device) in input_devices.enumerate() {
                let id = device_id(&device).unwrap_or_else(|| format!("input-{i}"));
                if !seen.insert((true, id.clone())) {
                    continue;
                }
                let is_default = default_input_id.as_deref() == Some(id.as_str());

                devices.push(AudioDevice {
                    id,
                    name: device_name(&device, format!("Dispositivo de entrada {}", i + 1)),
                    is_input: true,
                    is_default,
                });
            }
        }
        Err(error) => log::warn!("[audio] Não foi possível enumerar microfones: {error}"),
    }

    match host.output_devices() {
        Ok(output_devices) => {
            for (i, device) in output_devices.enumerate() {
                let id = device_id(&device).unwrap_or_else(|| format!("output-{i}"));
                if !seen.insert((false, id.clone())) {
                    continue;
                }
                let is_default = communications_output_id
                    .as_deref()
                    .is_some_and(|default_id| {
                        native_device_id(&device).as_deref() == Some(default_id)
                    })
                    || (communications_output_id.is_none()
                        && fallback_output_id.as_deref() == Some(id.as_str()));

                devices.push(AudioDevice {
                    id,
                    name: device_name(&device, format!("Dispositivo de saída {}", i + 1)),
                    is_input: false,
                    is_default,
                });
            }
        }
        Err(error) => log::warn!("[audio] Não foi possível enumerar saídas de áudio: {error}"),
    }

    devices.sort_by(|left, right| {
        right
            .is_default
            .cmp(&left.is_default)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(devices)
}

struct StereoLinearResampler {
    source_rate: f64,
    target_rate: f64,
    frames: VecDeque<[f32; 2]>,
    position: f64,
}

impl StereoLinearResampler {
    fn new(source_rate: u32, target_rate: u32) -> Self {
        Self {
            source_rate: f64::from(source_rate),
            target_rate: f64::from(target_rate),
            frames: VecDeque::new(),
            position: 0.0,
        }
    }

    fn push_interleaved(&mut self, samples: &[f32]) -> Vec<f32> {
        self.frames
            .extend(samples.chunks_exact(2).map(|frame| [frame[0], frame[1]]));

        let step = self.source_rate / self.target_rate;
        let mut output =
            Vec::with_capacity(((samples.len() as f64 / step).ceil() as usize).saturating_add(4));

        while self.position + 1.0 < self.frames.len() as f64 {
            let index = self.position.floor() as usize;
            let fraction = (self.position - index as f64) as f32;
            let current = self.frames[index];
            let next = self.frames[index + 1];
            output.push(current[0] + (next[0] - current[0]) * fraction);
            output.push(current[1] + (next[1] - current[1]) * fraction);
            self.position += step;
        }

        let consumed = self.position.floor() as usize;
        for _ in 0..consumed.min(self.frames.len().saturating_sub(1)) {
            self.frames.pop_front();
        }
        self.position -= consumed as f64;
        output
    }
}

fn input_to_stereo<T>(data: &[T], channels: usize) -> Vec<f32>
where
    T: Sample + Copy,
    f32: FromSample<T>,
{
    if channels == 0 {
        return Vec::new();
    }

    let mut output = Vec::with_capacity((data.len() / channels) * 2);
    for frame in data.chunks_exact(channels) {
        let left = f32::from_sample(frame[0]);
        let right = if channels > 1 {
            f32::from_sample(frame[1])
        } else {
            left
        };
        output.extend_from_slice(&[left, right]);
    }
    output
}

#[allow(clippy::too_many_arguments)]
fn build_capture_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    socket: Arc<UdpSocket>,
    target_addr: String,
    ssrc: u32,
    secret_key: &[u8],
    encryption_mode: VoiceEncryptionMode,
    session: Arc<tokio::sync::Mutex<Option<DaveSession>>>,
    krisp_enabled: bool,
    muted: Arc<AtomicBool>,
    speaking_sender: Option<mpsc::UnboundedSender<bool>>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample + Sample + Copy,
    f32: FromSample<T>,
{
    let mut encoder = Encoder::new(48_000, Channels::Stereo, Application::Voip)
        .map_err(|error| format!("Erro criando Opus encoder: {error:?}"))?;
    let cipher = TransportCipher::new(encryption_mode, secret_key)?;
    let channels = usize::from(config.channels);
    let mut resampler = StereoLinearResampler::new(config.sample_rate, 48_000);
    let mut pcm_buffer = Vec::with_capacity(3_840);
    let mut denoiser = DenoiseState::new();
    let mut sequence = 0u16;
    let mut timestamp = 0u32;
    let mut nonce_counter = 0u32;

    // The real-time callback must never create one Tokio task per packet. A bounded
    // queue applies backpressure and a single async worker owns UDP transmission.
    let (packet_tx, mut packet_rx) = mpsc::channel::<Vec<u8>>(128);
    let sender_socket = socket;
    let runtime = tokio::runtime::Handle::current();
    runtime.spawn(async move {
        while let Some(packet) = packet_rx.recv().await {
            if let Err(error) = sender_socket.send_to(&packet, &target_addr).await {
                log::debug!("[audio] Falha ao enviar pacote UDP: {error}");
            }
        }
    });

    let mut is_speaking = false;
    let mut silence_frames = 0u32;
    const VAD_THRESHOLD: f32 = 0.012;
    const HANGOVER_FRAMES: u32 = 12;

    device
        .build_input_stream(
            config,
            move |data: &[T], _: &_| {
                let stereo = input_to_stereo(data, channels);
                pcm_buffer.extend(resampler.push_interleaved(&stereo));

                while pcm_buffer.len() >= 1_920 {
                    let mut frame: Vec<f32> = pcm_buffer.drain(..1_920).collect();
                    let is_muted = muted.load(Ordering::Relaxed);
                    if is_muted {
                        if is_speaking {
                            is_speaking = false;
                            silence_frames = 0;
                            if let Some(tx) = &speaking_sender {
                                let _ = tx.send(false);
                            }
                        }
                        continue;
                    }

                    let sum_sq: f32 = frame.iter().map(|&s| s * s).sum();
                    let rms = (sum_sq / frame.len() as f32).sqrt();
                    if rms > VAD_THRESHOLD {
                        silence_frames = 0;
                        if !is_speaking {
                            is_speaking = true;
                            if let Some(tx) = &speaking_sender {
                                let _ = tx.send(true);
                            }
                        }
                    } else if is_speaking {
                        silence_frames = silence_frames.saturating_add(1);
                        if silence_frames >= HANGOVER_FRAMES {
                            is_speaking = false;
                            silence_frames = 0;
                            if let Some(tx) = &speaking_sender {
                                let _ = tx.send(false);
                            }
                        }
                    }

                    if krisp_enabled {
                        for offset in [0, 480] {
                            let mut left_in = [0.0f32; 480];
                            let mut right_in = [0.0f32; 480];
                            let mut left_out = [0.0f32; 480];
                            let mut right_out = [0.0f32; 480];
                            for index in 0..480 {
                                left_in[index] = frame[(offset + index) * 2];
                                right_in[index] = frame[(offset + index) * 2 + 1];
                            }
                            denoiser.process_frame(&mut left_out, &left_in);
                            denoiser.process_frame(&mut right_out, &right_in);
                            for index in 0..480 {
                                frame[(offset + index) * 2] = left_out[index];
                                frame[(offset + index) * 2 + 1] = right_out[index];
                            }
                        }
                    }

                    let mut opus = [0u8; 1_000];
                    let Ok(length) = encoder.encode_float(&frame, &mut opus) else {
                        continue;
                    };
                    let encrypted_dave = session.try_lock().ok().and_then(|mut lock| {
                        lock.as_mut().and_then(|dave| {
                            dave.encrypt(MediaType::AUDIO, Codec::OPUS, &opus[..length])
                                .ok()
                        })
                    });
                    let Some(dave_payload) = encrypted_dave else {
                        // Never downgrade a DAVE call to plaintext media.
                        continue;
                    };

                    let mut rtp_header = [0u8; 12];
                    rtp_header[0] = 0x80;
                    rtp_header[1] = 0x78;
                    rtp_header[2..4].copy_from_slice(&sequence.to_be_bytes());
                    rtp_header[4..8].copy_from_slice(&timestamp.to_be_bytes());
                    rtp_header[8..12].copy_from_slice(&ssrc.to_be_bytes());

                    let Some(ciphertext) =
                        cipher.encrypt(nonce_counter, &rtp_header, &dave_payload)
                    else {
                        continue;
                    };

                    let mut packet = Vec::with_capacity(12 + ciphertext.len() + 4);
                    packet.extend_from_slice(&rtp_header);
                    packet.extend_from_slice(&ciphertext);
                    packet.extend_from_slice(&nonce_counter.to_be_bytes());
                    if packet_tx.try_send(packet).is_ok() {
                        sequence = sequence.wrapping_add(1);
                        timestamp = timestamp.wrapping_add(960);
                        nonce_counter = nonce_counter.wrapping_add(1);
                    }
                }
            },
            move |error| log::error!("[audio] Erro no stream do microfone: {error}"),
            None,
        )
        .map_err(|error| error.to_string())
}

#[allow(clippy::too_many_arguments)]
pub fn start_audio_capture(
    socket: Arc<UdpSocket>,
    target_addr: String,
    ssrc: u32,
    secret_key: Vec<u8>,
    encryption_mode: VoiceEncryptionMode,
    session: Arc<tokio::sync::Mutex<Option<DaveSession>>>,
    input_device_id: Option<String>,
    krisp_enabled: bool,
    muted: Arc<AtomicBool>,
    speaking_sender: Option<mpsc::UnboundedSender<bool>>,
) -> Result<cpal::Stream, String> {
    log::info!(
        "[audio] Iniciando captura de microfone (Krisp IA: {})...",
        krisp_enabled
    );
    let host = cpal::default_host();

    let device = if let Some(id) = input_device_id {
        let mut found = None;
        if let Ok(devices) = host.input_devices() {
            for d in devices {
                if d.id().is_ok_and(|device_id| device_id.to_string() == id) {
                    found = Some(d);
                    break;
                }
            }
        }
        found.unwrap_or(
            host.default_input_device()
                .ok_or("Nenhum microfone padrão")?,
        )
    } else {
        host.default_input_device()
            .ok_or("Nenhum microfone padrão")?
    };
    let supported = device
        .default_input_config()
        .map_err(|error| error.to_string())?;
    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();

    macro_rules! capture {
        ($sample:ty) => {
            build_capture_stream::<$sample>(
                &device,
                &config,
                socket,
                target_addr,
                ssrc,
                &secret_key,
                encryption_mode,
                session,
                krisp_enabled,
                muted,
                speaking_sender.clone(),
            )
        };
    }

    let stream = match sample_format {
        SampleFormat::I8 => capture!(i8),
        SampleFormat::I16 => capture!(i16),
        SampleFormat::I24 => capture!(I24),
        SampleFormat::I32 => capture!(i32),
        SampleFormat::I64 => capture!(i64),
        SampleFormat::U8 => capture!(u8),
        SampleFormat::U16 => capture!(u16),
        SampleFormat::U24 => capture!(U24),
        SampleFormat::U32 => capture!(u32),
        SampleFormat::U64 => capture!(u64),
        SampleFormat::F32 => capture!(f32),
        SampleFormat::F64 => capture!(f64),
        format => Err(format!("Formato de entrada não suportado: {format}")),
    }?;

    stream.play().map_err(|e| e.to_string())?;
    log::info!("[audio] Captura e envio de microfone iniciados com sucesso!");

    Ok(stream)
}

fn build_playback_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    queues: Arc<StdMutex<HashMap<u32, VecDeque<f32>>>>,
    deafened: Arc<AtomicBool>,
    first_pcm_consumed: Arc<AtomicBool>,
    playback_events: mpsc::UnboundedSender<AudioPlaybackEvent>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &_| {
                let muted = deafened.load(Ordering::Relaxed);
                let Ok(mut sources) = queues.lock() else {
                    data.fill(T::from_sample(0.0));
                    return;
                };
                for target in data {
                    let sample = if muted {
                        0.0
                    } else {
                        let mut mixed = 0.0f32;
                        let mut active_sources = 0usize;
                        for samples in sources.values_mut() {
                            if let Some(sample) = samples.pop_front() {
                                mixed += sample;
                                active_sources += 1;
                            }
                        }
                        if active_sources > 0 && !first_pcm_consumed.swap(true, Ordering::Relaxed) {
                            log::info!("[audio][playback] first_pcm_consumed");
                            let _ = playback_events.send(AudioPlaybackEvent::PipelineProgress(
                                AudioPipelineStage::PcmConsumed,
                            ));
                        }
                        if active_sources > 1 {
                            mixed /= (active_sources as f32).sqrt();
                        }
                        mixed.clamp(-1.0, 1.0)
                    };
                    *target = T::from_sample(sample);
                }
                if muted {
                    sources.clear();
                } else {
                    sources.retain(|_, samples| !samples.is_empty());
                }
            },
            move |error| log::error!("[audio] Erro no stream de saída: {error}"),
            None,
        )
        .map_err(|error| error.to_string())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct RtpTransportLayout {
    aad_length: usize,
    encrypted_extension_length: usize,
}

/// Parses the unencrypted RTP prefix used as AEAD additional data by Discord's
/// `*_rtpsize` modes and the encrypted extension payload that follows it.
fn rtp_transport_layout(packet: &[u8]) -> Option<RtpTransportLayout> {
    if packet.len() < 12 || packet[0] >> 6 != 2 || packet[1] & 0x7f != 0x78 {
        return None;
    }
    let csrc_count = usize::from(packet[0] & 0x0f);
    let mut aad_length = 12usize.checked_add(csrc_count.checked_mul(4)?)?;
    if packet.len() < aad_length {
        return None;
    }
    let mut encrypted_extension_length = 0usize;
    if packet[0] & 0x10 != 0 {
        if packet.len() < aad_length + 4 {
            return None;
        }
        let extension_words = u16::from_be_bytes([packet[aad_length + 2], packet[aad_length + 3]]);
        encrypted_extension_length = usize::from(extension_words).checked_mul(4)?;
        aad_length = aad_length.checked_add(4)?;
    }
    (aad_length <= packet.len()).then_some(RtpTransportLayout {
        aad_length,
        encrypted_extension_length,
    })
}

fn media_payload_after_rtp_extension(
    decrypted: &[u8],
    layout: RtpTransportLayout,
) -> Option<&[u8]> {
    decrypted.get(layout.encrypted_extension_length..)
}

fn should_report_audio_drop(count: u64) -> bool {
    count == 1 || count.is_power_of_two()
}

#[derive(Clone, Copy)]
struct PlaybackFormat {
    sample_rate: u32,
    channels: usize,
    generation: u64,
}

fn open_playback_stream(
    requested_device_id: Option<&str>,
    queues: Arc<StdMutex<HashMap<u32, VecDeque<f32>>>>,
    deafened: Arc<AtomicBool>,
    playback_events: mpsc::UnboundedSender<AudioPlaybackEvent>,
) -> Result<(cpal::Stream, AudioOutputInfo, PlaybackFormat), String> {
    let host = cpal::default_host();
    let selected = preferred_output_device(&host, requested_device_id)?;
    let active_device_id = device_id(&selected.device);
    let active_device_name = device_name(&selected.device, "Dispositivo de saída".into());
    let supported = selected
        .device
        .default_output_config()
        .map_err(|error| error.to_string())?;
    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let first_pcm_consumed = Arc::new(AtomicBool::new(false));
    macro_rules! playback {
        ($sample:ty) => {
            build_playback_stream::<$sample>(
                &selected.device,
                &config,
                queues.clone(),
                deafened.clone(),
                first_pcm_consumed.clone(),
                playback_events.clone(),
            )
        };
    }
    let stream = match sample_format {
        SampleFormat::I8 => playback!(i8),
        SampleFormat::I16 => playback!(i16),
        SampleFormat::I24 => playback!(I24),
        SampleFormat::I32 => playback!(i32),
        SampleFormat::I64 => playback!(i64),
        SampleFormat::U8 => playback!(u8),
        SampleFormat::U16 => playback!(u16),
        SampleFormat::U24 => playback!(U24),
        SampleFormat::U32 => playback!(u32),
        SampleFormat::U64 => playback!(u64),
        SampleFormat::F32 => playback!(f32),
        SampleFormat::F64 => playback!(f64),
        format => Err(format!("Formato de saída não suportado: {format}")),
    }?;
    stream.play().map_err(|error| error.to_string())?;

    let info = AudioOutputInfo {
        requested_device_id: selected.requested_device_id,
        active_device_id,
        active_device_name,
        fallback: selected.fallback,
        sample_rate: config.sample_rate,
        channels: config.channels,
    };
    let format = PlaybackFormat {
        sample_rate: config.sample_rate,
        channels: usize::from(config.channels),
        generation: 0,
    };
    log::info!(
        "[audio][playback] output_ready device={} rate={} channels={} format={} fallback={}",
        info.active_device_name,
        info.sample_rate,
        info.channels,
        sample_format,
        info.fallback
    );
    Ok((stream, info, format))
}

#[allow(clippy::too_many_arguments)]
pub fn run_audio_playback(
    runtime: tokio::runtime::Handle,
    socket: Arc<UdpSocket>,
    secret_key: Vec<u8>,
    encryption_mode: VoiceEncryptionMode,
    session: Arc<tokio::sync::Mutex<Option<DaveSession>>>,
    mut output_device: watch::Receiver<Option<String>>,
    ssrc_users: Arc<tokio::sync::Mutex<HashMap<u32, u64>>>,
    deafened: Arc<AtomicBool>,
    mut cancel: watch::Receiver<bool>,
    initial_result: tokio::sync::oneshot::Sender<Result<AudioOutputInfo, String>>,
    playback_events: mpsc::UnboundedSender<AudioPlaybackEvent>,
) -> Result<(), String> {
    log::info!("[audio] Iniciando recepção e reprodução de áudio...");
    let cipher = TransportCipher::new(encryption_mode, &secret_key)?;
    let sample_queues = Arc::new(StdMutex::new(HashMap::<u32, VecDeque<f32>>::new()));
    let initial_requested = output_device.borrow().clone();
    let (mut stream, initial_info, initial_format) = match open_playback_stream(
        initial_requested.as_deref(),
        sample_queues.clone(),
        deafened.clone(),
        playback_events.clone(),
    ) {
        Ok(value) => value,
        Err(error) => {
            let _ = initial_result.send(Err(error.clone()));
            return Err(error);
        }
    };
    let playback_format = Arc::new(StdMutex::new(initial_format));
    let _ = initial_result.send(Ok(initial_info.clone()));

    let receiver_queues = sample_queues.clone();
    let receiver_format = playback_format.clone();
    let receiver_events = playback_events.clone();
    runtime.spawn(async move {
        let mut decoders = HashMap::<u32, Decoder>::new();
        let mut resamplers = HashMap::<u32, StereoLinearResampler>::new();
        let mut resampler_generation = initial_format.generation;
        let mut received_packets = 0u64;
        let mut invalid_rtp_packets = 0u64;
        let mut invalid_extension_packets = 0u64;
        let mut transport_decrypt_failures = 0u64;
        let mut transport_decrypted_packets = 0u64;
        let mut unknown_ssrc_packets = 0u64;
        let mut dave_decrypt_failures = 0u64;
        let mut dave_decrypted_packets = 0u64;
        let mut opus_decode_failures = 0u64;
        let mut decoded_packets = 0u64;

        let mut buf = [0u8; 2048];
        loop {
            let received = tokio::select! {
                changed = cancel.changed() => {
                    if changed.is_err() || *cancel.borrow() {
                        break;
                    }
                    continue;
                }
                received = socket.recv_from(&mut buf) => received,
            };
            match received {
                Ok((len, _)) => {
                    received_packets = received_packets.saturating_add(1);
                    if received_packets == 1 {
                        log::info!("[audio][receive] first_udp_packet bytes={len}");
                        let _ = receiver_events.send(AudioPlaybackEvent::PipelineProgress(
                            AudioPipelineStage::UdpPacketReceived,
                        ));
                    }
                    if len < 32 {
                        continue;
                    }
                    let Some(layout) = rtp_transport_layout(&buf[..len]) else {
                        invalid_rtp_packets = invalid_rtp_packets.saturating_add(1);
                        if should_report_audio_drop(invalid_rtp_packets) {
                            log::warn!(
                                "[audio][receive] drop=invalid_rtp count={invalid_rtp_packets} bytes={len}"
                            );
                        }
                        continue;
                    };
                    if len < layout.aad_length + 20 {
                        continue;
                    }
                    let rtp_header = &buf[..layout.aad_length];
                    let nonce_bytes_suffix = &buf[len - 4..len];
                    let ciphertext_and_tag = &buf[layout.aad_length..len - 4];

                    let Some(decrypted) =
                        cipher.decrypt(nonce_bytes_suffix, rtp_header, ciphertext_and_tag)
                    else {
                        transport_decrypt_failures = transport_decrypt_failures.saturating_add(1);
                        if should_report_audio_drop(transport_decrypt_failures) {
                            log::warn!(
                                "[audio][receive] drop=transport_decrypt count={transport_decrypt_failures} bytes={len} rtp_header_bytes={} extension={} mode={}",
                                layout.aad_length,
                                buf[0] & 0x10 != 0,
                                encryption_mode.as_str()
                            );
                        }
                        continue;
                    };
                    transport_decrypted_packets = transport_decrypted_packets.saturating_add(1);
                    if transport_decrypted_packets == 1 {
                        log::info!(
                            "[audio][receive] first_transport_packet_decrypted extension_bytes={}",
                            layout.encrypted_extension_length
                        );
                        let _ = receiver_events.send(AudioPlaybackEvent::PipelineProgress(
                            AudioPipelineStage::TransportDecrypted,
                        ));
                    }
                    let Some(dave_payload) =
                        media_payload_after_rtp_extension(&decrypted, layout)
                    else {
                        invalid_extension_packets = invalid_extension_packets.saturating_add(1);
                        if should_report_audio_drop(invalid_extension_packets) {
                            log::warn!(
                                "[audio][receive] drop=truncated_rtp_extension count={invalid_extension_packets} expected={} decrypted={}",
                                layout.encrypted_extension_length,
                                decrypted.len()
                            );
                        }
                        continue;
                    };

                    // Tentativa de descriptografia DAVE
                    let sender_ssrc = u32::from_be_bytes([buf[8], buf[9], buf[10], buf[11]]);
                    let Some(sender_user_id) = ssrc_users.lock().await.get(&sender_ssrc).copied()
                    else {
                        unknown_ssrc_packets = unknown_ssrc_packets.saturating_add(1);
                        if should_report_audio_drop(unknown_ssrc_packets) {
                            log::warn!(
                                "[audio][receive] drop=unknown_ssrc count={unknown_ssrc_packets} ssrc={sender_ssrc}"
                            );
                        }
                        continue;
                    };
                    let final_opus = {
                        let mut lock = session.lock().await;
                        let Some(dave) = lock.as_mut() else { continue };
                        match dave.decrypt(sender_user_id, MediaType::AUDIO, dave_payload) {
                            Ok(plain) => {
                                dave_decrypted_packets = dave_decrypted_packets.saturating_add(1);
                                if dave_decrypted_packets == 1 {
                                    log::info!(
                                        "[audio][receive] first_dave_frame_decrypted sender={sender_user_id}"
                                    );
                                    let _ = receiver_events.send(
                                        AudioPlaybackEvent::PipelineProgress(
                                            AudioPipelineStage::DaveDecrypted,
                                        ),
                                    );
                                }
                                plain
                            }
                            Err(error) => {
                                dave_decrypt_failures = dave_decrypt_failures.saturating_add(1);
                                if should_report_audio_drop(dave_decrypt_failures) {
                                    log::warn!(
                                        "[audio][receive] drop=dave_decrypt count={dave_decrypt_failures} sender={sender_user_id} error={error:?}"
                                    );
                                }
                                continue;
                            }
                        }
                    };

                    if let std::collections::hash_map::Entry::Vacant(entry) =
                        decoders.entry(sender_ssrc)
                    {
                        let Ok(decoder) = Decoder::new(48_000, Channels::Stereo) else {
                            continue;
                        };
                        entry.insert(decoder);
                    }
                    let Some(decoder) = decoders.get_mut(&sender_ssrc) else {
                        continue;
                    };
                    let mut pcm_out = vec![0.0f32; 11_520];
                    match decoder.decode_float(&final_opus, &mut pcm_out, false) {
                        Ok(num_samples) => {
                            decoded_packets = decoded_packets.saturating_add(1);
                            if decoded_packets == 1 {
                                log::info!(
                                    "[audio][receive] first_packet_decoded ssrc={sender_ssrc} samples_per_channel={num_samples}"
                                );
                                let _ = receiver_events.send(
                                    AudioPlaybackEvent::PipelineProgress(
                                        AudioPipelineStage::OpusDecoded,
                                    ),
                                );
                            }
                            let current_format = match receiver_format.lock() {
                                Ok(format) => *format,
                                Err(_) => continue,
                            };
                            if current_format.generation != resampler_generation {
                                resamplers.clear();
                                resampler_generation = current_format.generation;
                            }
                            let total_floats = num_samples * 2;
                            let stereo = resamplers
                                .entry(sender_ssrc)
                                .or_insert_with(|| {
                                    StereoLinearResampler::new(
                                        48_000,
                                        current_format.sample_rate,
                                    )
                                })
                                .push_interleaved(&pcm_out[..total_floats]);
                            let mut output =
                                Vec::with_capacity(
                                    (stereo.len() / 2) * current_format.channels,
                                );
                            for frame in stereo.chunks_exact(2) {
                                if current_format.channels == 1 {
                                    output.push((frame[0] + frame[1]) * 0.5);
                                } else {
                                    output.push(frame[0]);
                                    output.push(frame[1]);
                                    for _ in 2..current_format.channels {
                                        output.push((frame[0] + frame[1]) * 0.5);
                                    }
                                }
                            }
                            let queue_capacity = (current_format.sample_rate as usize
                                * current_format.channels)
                                / 2;
                            if let Ok(mut queues) = receiver_queues.lock() {
                                let queue = queues
                                    .entry(sender_ssrc)
                                    .or_insert_with(|| VecDeque::with_capacity(queue_capacity));
                                let overflow = queue
                                    .len()
                                    .saturating_add(output.len())
                                    .saturating_sub(queue_capacity);
                                for _ in 0..overflow.min(queue.len()) {
                                    queue.pop_front();
                                }
                                queue.extend(output);
                            }
                        }
                        Err(error) => {
                            opus_decode_failures = opus_decode_failures.saturating_add(1);
                            if should_report_audio_drop(opus_decode_failures) {
                                log::warn!(
                                    "[audio][receive] drop=opus_decode count={opus_decode_failures} ssrc={sender_ssrc} error={error:?}"
                                );
                            }
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
    while runtime.block_on(output_device.changed()).is_ok() {
        let requested = output_device.borrow().clone();
        match open_playback_stream(
            requested.as_deref(),
            sample_queues.clone(),
            deafened.clone(),
            playback_events.clone(),
        ) {
            Ok((new_stream, info, mut new_format)) => {
                if let Ok(mut format) = playback_format.lock() {
                    new_format.generation = format.generation.wrapping_add(1);
                    *format = new_format;
                }
                if let Ok(mut queues) = sample_queues.lock() {
                    queues.clear();
                }
                stream = new_stream;
                log::info!(
                    "[audio][playback] output_changed device={} fallback={}",
                    info.active_device_name,
                    info.fallback
                );
                let _ = playback_events.send(AudioPlaybackEvent::OutputReady(info));
            }
            Err(error) => {
                log::error!("[audio][playback] output_change_failed error={error}");
                let _ = playback_events.send(AudioPlaybackEvent::OutputChangeFailed {
                    requested_device_id: requested,
                    error,
                });
            }
        }
    }
    drop(stream);
    Ok(())
}

#[cfg(test)]
mod transport_tests {
    use super::*;

    #[test]
    fn both_supported_transport_modes_round_trip_rtp_payloads() {
        let key = [7u8; 32];
        let header = [0x80, 0x78, 0, 1, 0, 0, 0, 1, 0, 0, 0, 42];
        let plaintext = b"dave-encrypted-opus";

        for mode in [
            VoiceEncryptionMode::AeadAes256GcmRtpSize,
            VoiceEncryptionMode::AeadXChaCha20Poly1305RtpSize,
        ] {
            let cipher = TransportCipher::new(mode, &key).expect("valid transport key");
            let ciphertext = cipher
                .encrypt(9, &header, plaintext)
                .expect("transport encryption");
            let decrypted = cipher
                .decrypt(&9u32.to_be_bytes(), &header, &ciphertext)
                .expect("transport decryption");
            assert_eq!(decrypted, plaintext);
        }
    }

    #[test]
    fn decrypts_rtpsize_packet_with_encrypted_extension_payload() {
        let key = [11u8; 32];
        let nonce = 37u32;
        let mut transport_header = vec![
            0x90, 0x78, 0, 1, 0, 0, 0, 1, 0, 0, 0, 42, // RTP header with X bit.
            0xbe, 0xde, 0, 2, // Extension profile and two-word length preamble.
        ];
        let plaintext = [
            0x10, 0x01, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, // Encrypted RTP extension.
            0x01, 0x02, 0x03, 0xfa, 0xfa, // DAVE-protected Opus placeholder.
        ];

        for mode in [
            VoiceEncryptionMode::AeadAes256GcmRtpSize,
            VoiceEncryptionMode::AeadXChaCha20Poly1305RtpSize,
        ] {
            let cipher = TransportCipher::new(mode, &key).expect("valid transport key");
            let encrypted = cipher
                .encrypt(nonce, &transport_header, &plaintext)
                .expect("transport encryption");
            transport_header.extend_from_slice(&encrypted);
            transport_header.extend_from_slice(&nonce.to_be_bytes());

            let layout =
                rtp_transport_layout(&transport_header).expect("valid RTP transport header");
            assert_eq!(layout.aad_length, 16);
            assert_eq!(layout.encrypted_extension_length, 8);
            let decrypted = cipher
                .decrypt(
                    &transport_header[transport_header.len() - 4..],
                    &transport_header[..layout.aad_length],
                    &transport_header[layout.aad_length..transport_header.len() - 4],
                )
                .expect("transport decryption");
            assert_eq!(decrypted, plaintext);
            assert_eq!(
                media_payload_after_rtp_extension(&decrypted, layout),
                Some(&plaintext[8..])
            );

            transport_header.truncate(layout.aad_length);
        }
    }

    #[test]
    fn rejects_decrypted_payload_shorter_than_the_rtp_extension() {
        let layout = RtpTransportLayout {
            aad_length: 16,
            encrypted_extension_length: 8,
        };
        assert_eq!(media_payload_after_rtp_extension(&[1, 2, 3], layout), None);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn enumerates_the_active_windows_communications_output() {
        let Some(default_id) = communications_output_device_id() else {
            return;
        };
        let devices = get_audio_devices().expect("audio enumeration should not fail");

        assert!(devices.iter().any(|device| {
            !device.is_input && device.id.ends_with(&default_id) && device.is_default
        }));
    }
}

#[cfg(test)]
mod tests {
    use super::{input_to_stereo, rtp_transport_layout, StereoLinearResampler};

    #[test]
    fn converts_mono_pcm_to_stereo() {
        let stereo = input_to_stereo(&[0.25f32, -0.5], 1);
        assert_eq!(stereo, vec![0.25, 0.25, -0.5, -0.5]);
    }

    #[test]
    fn resamples_44100_hz_to_48000_hz_without_drift_spike() {
        let input = vec![0.25f32; 44_100 * 2];
        let mut resampler = StereoLinearResampler::new(44_100, 48_000);
        let output = resampler.push_interleaved(&input);
        let output_frames = output.len() / 2;
        assert!((47_998..=48_000).contains(&output_frames));
        assert!(output
            .iter()
            .all(|sample| (*sample - 0.25).abs() < f32::EPSILON));
    }

    #[test]
    fn parses_rtp_header_with_csrc_and_extension() {
        let mut packet = vec![0u8; 12 + 4 + 4 + 8 + 20];
        packet[0] = 0x91; // RTP v2, extension bit, one CSRC.
        packet[1] = 0x78; // Discord Opus payload type.
        let extension_offset = 16;
        packet[extension_offset + 2..extension_offset + 4].copy_from_slice(&2u16.to_be_bytes());
        let layout = rtp_transport_layout(&packet).expect("valid RTP packet");
        assert_eq!(layout.aad_length, 20);
        assert_eq!(layout.encrypted_extension_length, 8);
    }

    #[test]
    fn rejects_truncated_rtp_extension_preamble() {
        let mut packet = vec![0u8; 15];
        packet[0] = 0x90;
        packet[1] = 0x78;
        assert_eq!(rtp_transport_layout(&packet), None);
    }

    #[test]
    fn ignores_rtcp_packets_on_the_shared_udp_socket() {
        let mut packet = vec![0u8; 52];
        packet[0] = 0x81;
        packet[1] = 200;
        assert_eq!(rtp_transport_layout(&packet), None);
    }
}
