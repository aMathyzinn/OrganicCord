import { useState, useEffect } from "react";
import { Mic, MicOff, Headphones, PhoneOff, Video, ChevronUp, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useVoiceStore } from "@/stores/voiceStore";
import { useAccountStore } from "@/stores/accountStore";
import { invoke } from "@tauri-apps/api/core";
import * as Popover from "@radix-ui/react-popover";

import { DiscordUser } from "@/types";

interface Props {
  recipient: DiscordUser;
}

interface AudioDevice {
  id: string;
  name: string;
  is_input: boolean;
}

export function ActiveCallArea({ recipient }: Props) {
  const { leaveCall, isMuted, isDeafened, toggleMute, toggleDeafen, inputDeviceId, setInputDevice, isConnecting, isConnected, accountId } = useVoiceStore();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const currentAccount = useAccountStore(state => state.accounts.find(a => a.id === accountId));

  useEffect(() => {
    invoke<AudioDevice[]>("get_audio_devices")
      .then(setDevices)
      .catch((e) => console.error("Falha ao buscar dispositivos:", e));
  }, []);

  const inputs = devices.filter((d) => d.is_input);

  const outputs = devices.filter((d) => !d.is_input);

  return (
    <div style={{
      width: "100%",
      background: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      position: "relative",
      borderBottom: "1px solid var(--border-subtle)",
      minHeight: 220
    }}>
      {/* Top Status */}
      <div style={{ position: "absolute", top: 16, left: 24, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: isConnected ? "var(--status-online)" : "var(--status-idle)",
          boxShadow: isConnected ? "0 0 8px var(--status-online)" : "none"
        }} />
        <span style={{ fontSize: 13, color: isConnected ? "var(--status-online)" : "var(--status-idle)", fontWeight: 600, textTransform: "uppercase" }}>
          {isConnected ? "Voz Conectada" : isConnecting ? "Conectando..." : "Desconectado"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 32, marginBottom: 24, marginTop: 16 }}>
        {/* Local User */}
        {currentAccount && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ 
              padding: 4, 
              borderRadius: "50%", 
              border: isMuted ? "2px solid var(--status-danger)" : "2px solid transparent",
              transition: "border-color 0.2s"
            }}>
              <Avatar
                userId={currentAccount.id}
                avatarHash={currentAccount.avatar}
                username={currentAccount.username}
                size={96}
              />
            </div>
            <span style={{ fontSize: 15, color: "#fff", fontWeight: 600 }}>{currentAccount.global_name ?? currentAccount.username}</span>
          </div>
        )}

        {/* Recipient User */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ padding: 4, borderRadius: "50%", border: "2px solid transparent" }}>
            <Avatar
              userId={recipient.id}
              avatarHash={recipient.avatar ?? null}
              avatarDecoration={recipient.avatar_decoration_data}
              username={recipient.username}
              size={96}
            />
          </div>
          <span style={{ fontSize: 15, color: "#fff", fontWeight: 600 }}>{recipient.global_name ?? recipient.username}</span>
        </div>
      </div>

      {/* Control Bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px",
        background: "var(--bg-secondary-alt)",
        borderRadius: "24px",
        backdropFilter: "blur(12px)",
        boxShadow: "var(--elevation-high)"
      }}>
        {/* Video */}
        <button
          className="header-icon-button"
          style={{ ...controlBtnStyle, background: "transparent", opacity: 0.5, cursor: "not-allowed" }}
          title="Ligar Câmera (Em breve)"
        >
          <Video size={20} />
        </button>

        <div style={{ width: 1, height: 24, background: "var(--border-subtle)", margin: "0 4px" }} />

        {/* Mic Toggle + Input Device Select */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          background: isMuted ? "var(--status-danger)" : "transparent", 
          color: isMuted ? "#fff" : "inherit",
          borderRadius: "16px", 
          transition: "all 0.2s" 
        }}>
          <button
            onClick={toggleMute}
            className="header-icon-button"
            style={{
              ...controlBtnStyle,
              background: "transparent",
              color: isMuted ? "#fff" : "var(--interactive-normal)",
            }}
            title={isMuted ? "Desmutar" : "Mutar"}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          
          <DeviceSelector popoverContent={
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", padding: "4px 8px" }}>
                Microfones
              </div>
              {inputs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setInputDevice(d.id)}
                  style={{
                    background: inputDeviceId === d.id ? "var(--brand-500)" : "transparent",
                    color: inputDeviceId === d.id ? "#fff" : "var(--interactive-normal)",
                    border: "none",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 14
                  }}
                >
                  {d.name}
                </button>
              ))}
            </div>
          } />
        </div>

        {/* Deafen + Output Device Select */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          background: isDeafened ? "var(--status-danger)" : "transparent", 
          color: isDeafened ? "#fff" : "inherit",
          borderRadius: "16px", 
          transition: "all 0.2s" 
        }}>
          <button
            onClick={toggleDeafen}
            className="header-icon-button"
            style={{
              ...controlBtnStyle,
              background: "transparent",
              color: isDeafened ? "#fff" : "var(--interactive-normal)",
            }}
            title={isDeafened ? "Desensurdecer" : "Ensurdecer"}
          >
            <Headphones size={20} />
          </button>

          <DeviceSelector popoverContent={
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", padding: "4px 8px" }}>
                Saída de Áudio
              </div>
              {outputs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => useVoiceStore.getState().setOutputDevice(d.id)}
                  style={{
                    background: useVoiceStore.getState().outputDeviceId === d.id ? "var(--brand-500)" : "transparent",
                    color: useVoiceStore.getState().outputDeviceId === d.id ? "#fff" : "var(--interactive-normal)",
                    border: "none",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 14
                  }}
                >
                  {d.name}
                </button>
              ))}
            </div>
          } />
        </div>

        <div style={{ width: 1, height: 24, background: "var(--border-subtle)", margin: "0 4px" }} />

        {/* Disconnect */}
        <button
          onClick={leaveCall}
          className="header-icon-button"
          style={{
            ...controlBtnStyle,
            background: "var(--status-danger)",
            color: "#fff",
            padding: "0 24px",
            width: "auto",
            borderRadius: "16px"
          }}
          title="Desligar"
        >
          <PhoneOff size={20} />
        </button>
      </div>
    </div>
  );
}

function DeviceSelector({ popoverContent }: { popoverContent: React.ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="header-icon-button"
          style={{
            background: "transparent",
            border: "none",
            borderLeft: "1px solid var(--bg-modifier-accent)",
            padding: "0 8px",
            height: 32,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--interactive-normal)"
          }}
        >
          <ChevronUp size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          side="top"
          align="center"
          style={{
            background: "var(--bg-floating)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: 8,
            boxShadow: "var(--elevation-high)",
            width: 280,
            zIndex: 100,
            maxHeight: 400,
            overflowY: "auto"
          }}
        >
          {popoverContent}
          <Popover.Arrow fill="var(--bg-floating)" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const controlBtnStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  border: "none",
  borderRadius: "var(--radius-round)",
  width: 56,
  height: 56,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: "var(--interactive-normal)",
  transition: "all 0.2s ease"
};
