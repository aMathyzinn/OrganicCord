import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Camera, Mic, RefreshCw, ShieldCheck, Square, Waves } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { useVoiceStore } from "@/stores/voiceStore";

interface AudioDevice {
  id: string;
  name: string;
  is_input: boolean;
  is_default: boolean;
}

export function VoiceVideoSettings() {
  const {
    inputDeviceId,
    outputDeviceId,
    krispEnabled,
    setInputDevice,
    setOutputDevice,
    setKrispEnabled,
  } = useVoiceStore();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [cameraTesting, setCameraTesting] = useState(false);
  const micStream = useRef<MediaStream | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const animationFrame = useRef<number | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);

  const refreshDevices = useCallback(async () => {
    setLoading(true);
    try {
      setDevices(await invoke<AudioDevice[]>("get_audio_devices"));
    } catch (error) {
      toast.error(`Não foi possível listar os dispositivos: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const stopMicTest = useCallback(() => {
    if (animationFrame.current != null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
    micStream.current?.getTracks().forEach((track) => track.stop());
    micStream.current = null;
    void audioContext.current?.close();
    audioContext.current = null;
    setMicTesting(false);
    setMicLevel(0);
  }, []);

  const startMicTest = async () => {
    stopMicTest();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      micStream.current = stream;
      audioContext.current = context;
      setMicTesting(true);
      const sample = () => {
        analyser.getByteTimeDomainData(values);
        const rms = Math.sqrt(values.reduce((sum, value) => {
          const normalized = (value - 128) / 128;
          return sum + normalized * normalized;
        }, 0) / values.length);
        setMicLevel(Math.min(100, Math.round(rms * 220)));
        animationFrame.current = requestAnimationFrame(sample);
      };
      sample();
    } catch (error) {
      toast.error(`Não foi possível acessar o microfone: ${String(error)}`);
    }
  };

  const stopCameraTest = useCallback(() => {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraTesting(false);
  }, []);

  const startCameraTest = async () => {
    stopCameraTest();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      cameraStream.current = stream;
      if (video.current) {
        video.current.srcObject = stream;
        await video.current.play();
      }
      setCameraTesting(true);
    } catch (error) {
      toast.error(`Não foi possível acessar a câmera: ${String(error)}`);
    }
  };

  useEffect(() => {
    void refreshDevices();
    return () => {
      stopMicTest();
      stopCameraTest();
    };
  }, [refreshDevices, stopCameraTest, stopMicTest]);

  const inputs = devices.filter((device) => device.is_input);
  const outputs = devices.filter((device) => !device.is_input);
  const defaultInput = inputs.find((device) => device.is_default);
  const defaultOutput = outputs.find((device) => device.is_default);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 200ms ease" }}>
      <div>
        <h2 style={{ margin: 0, color: "var(--text-normal)", fontSize: 22 }}>Voz e vídeo</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.5 }}>
          Selecione dispositivos usados nas chamadas de voz DAVE. A câmera abaixo é somente uma prévia;
          transmissão de vídeo ainda não faz parte desta versão.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5, margin: "6px 0 0" }}>
          A saída pode ser trocada durante a ligação sem reconectar ao servidor de voz. A entrada é aplicada na próxima ligação.
        </p>
      </div>

      <section style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={headingStyle}>Dispositivos de áudio</h3>
          <button onClick={() => void refreshDevices()} disabled={loading} style={secondaryButtonStyle}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <label style={fieldStyle}>
            <span>Entrada</span>
            <select value={inputDeviceId ?? ""} onChange={(event) => setInputDevice(event.target.value || null)} style={selectStyle}>
              <option value="">Padrão do Windows{defaultInput ? `: ${defaultInput.name}` : ""}</option>
              {inputs.map((device) => <option key={device.id} value={device.id}>{device.name}{device.is_default ? " (padrão)" : ""}</option>)}
            </select>
          </label>
          <label style={fieldStyle}>
            <span>Saída</span>
            <select value={outputDeviceId ?? ""} onChange={(event) => setOutputDevice(event.target.value || null)} style={selectStyle}>
              <option value="">Padrão de comunicações do Windows{defaultOutput ? `: ${defaultOutput.name}` : ""}</option>
              {outputs.map((device) => <option key={device.id} value={device.id}>{device.name}{device.is_default ? " (padrão)" : ""}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <h3 style={headingStyle}>Teste de microfone</h3>
            <p style={descriptionStyle}>Mede a entrada local. Nenhum áudio é enviado.</p>
          </div>
          <button onClick={micTesting ? stopMicTest : startMicTest} style={micTesting ? dangerButtonStyle : primaryButtonStyle}>
            {micTesting ? <Square size={15} /> : <Mic size={15} />}
            {micTesting ? "Parar" : "Testar"}
          </button>
        </div>
        <div style={{ height: 12, borderRadius: 999, overflow: "hidden", background: "var(--bg-tertiary)" }}>
          <div style={{ width: `${micLevel}%`, height: "100%", background: micLevel > 80 ? "var(--status-dnd)" : "var(--status-online)", transition: "width 60ms linear" }} />
        </div>
      </section>

      <section style={{ ...sectionStyle, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Waves size={24} color="var(--brand-500)" />
          <div>
            <h3 style={headingStyle}>Supressão de ruído RNNoise</h3>
            <p style={descriptionStyle}>Filtro local aplicado ao microfone antes da codificação Opus.</p>
          </div>
        </div>
        <input aria-label="Ativar RNNoise" type="checkbox" checked={krispEnabled} onChange={(event) => setKrispEnabled(event.target.checked)} style={{ width: 22, height: 22, accentColor: "var(--brand-500)" }} />
      </section>

      <section style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <h3 style={headingStyle}>Prévia da câmera</h3>
            <p style={descriptionStyle}>Teste local; não habilita vídeo na chamada.</p>
          </div>
          <button onClick={cameraTesting ? stopCameraTest : startCameraTest} style={cameraTesting ? dangerButtonStyle : secondaryButtonStyle}>
            <Camera size={15} /> {cameraTesting ? "Encerrar" : "Abrir prévia"}
          </button>
        </div>
        <div style={{ height: 220, borderRadius: 10, overflow: "hidden", background: "#090b0f", display: "grid", placeItems: "center" }}>
          <video ref={video} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraTesting ? "block" : "none" }} />
          {!cameraTesting && <div style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}><Camera size={20} /> Prévia desligada</div>}
        </div>
      </section>

      <div style={{ display: "flex", gap: 10, color: "var(--text-muted)", fontSize: 13, lineHeight: 1.45 }}>
        <ShieldCheck size={18} color="var(--status-online)" style={{ flexShrink: 0 }} />
        Chamadas só são marcadas como conectadas depois que o transporte e a sessão DAVE estão prontos.
      </div>
    </div>
  );
}

const sectionStyle = { background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: 18, display: "flex", flexDirection: "column" as const, gap: 16 };
const headingStyle = { color: "var(--text-normal)", fontSize: 15, fontWeight: 700, margin: 0 };
const descriptionStyle = { color: "var(--text-muted)", fontSize: 13, lineHeight: 1.45, margin: "4px 0 0" };
const fieldStyle = { display: "flex", flexDirection: "column" as const, gap: 7, color: "var(--text-muted)", fontSize: 12, fontWeight: 700 };
const selectStyle = { background: "var(--bg-tertiary)", color: "var(--text-normal)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "10px 11px", fontSize: 14 };
const buttonBase = { border: 0, borderRadius: 6, padding: "9px 13px", color: "white", fontWeight: 650, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 };
const primaryButtonStyle = { ...buttonBase, background: "var(--brand-500)" };
const secondaryButtonStyle = { ...buttonBase, background: "var(--bg-tertiary)", color: "var(--text-normal)" };
const dangerButtonStyle = { ...buttonBase, background: "var(--status-dnd)" };
