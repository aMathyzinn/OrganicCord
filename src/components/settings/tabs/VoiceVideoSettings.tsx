import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVoiceStore } from "@/stores/voiceStore";

interface AudioDevice {
  id: string;
  name: string;
  is_input: boolean;
}

export function VoiceVideoSettings() {
  const { inputDeviceId, outputDeviceId, setInputDevice, setOutputDevice } = useVoiceStore();
  const [devices, setDevices] = useState<AudioDevice[]>([]);

  useEffect(() => {
    invoke<AudioDevice[]>("get_audio_devices")
      .then(setDevices)
      .catch((e) => console.error("Falha ao buscar dispositivos:", e));
  }, []);

  const inputs = devices.filter(d => d.is_input);
  const outputs = devices.filter(d => !d.is_input);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, animation: "fadeIn 200ms ease" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)", margin: 0 }}>Configurações de Voz e Vídeo</h2>
      
      <div style={{ display: "flex", gap: 20 }}>
        {/* Dispositivo de Entrada */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Dispositivo de Entrada</label>
          <select 
            value={inputDeviceId || ""} 
            onChange={(e) => setInputDevice(e.target.value)}
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-normal)",
              padding: "10px",
              borderRadius: "var(--radius-sm)",
              fontSize: 15,
              outline: "none",
              cursor: "pointer"
            }}
          >
            {inputs.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
            {inputs.length === 0 && <option value="">Nenhum dispositivo encontrado</option>}
          </select>
        </div>

        {/* Dispositivo de Saída */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Dispositivo de Saída</label>
          <select 
            value={outputDeviceId || ""} 
            onChange={(e) => setOutputDevice(e.target.value)}
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-normal)",
              padding: "10px",
              borderRadius: "var(--radius-sm)",
              fontSize: 15,
              outline: "none",
              cursor: "pointer"
            }}
          >
            {outputs.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
            {outputs.length === 0 && <option value="">Nenhum dispositivo encontrado</option>}
          </select>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-normal)", margin: 0 }}>Modo de Entrada</h3>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-normal)", fontSize: 15, cursor: "pointer" }}>
            <input type="radio" name="input_mode" defaultChecked style={{ width: 18, height: 18, accentColor: "var(--brand-500)" }} />
            Deteccção de Voz
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-normal)", fontSize: 15, cursor: "not-allowed", opacity: 0.5 }}>
            <input type="radio" name="input_mode" disabled style={{ width: 18, height: 18 }} />
            Aperte para Falar (Em breve)
          </label>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-normal)", margin: 0 }}>Configurações de Vídeo</h3>
        <div style={{ background: "var(--bg-secondary)", height: 200, borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
          A visualização da câmera estará disponível em breve.
        </div>
      </div>
    </div>
  );
}
