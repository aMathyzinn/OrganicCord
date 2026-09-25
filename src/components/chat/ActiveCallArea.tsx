import { useState, useEffect } from "react";
import { Mic, MicOff, Headphones, PhoneOff, Video, ChevronUp, MonitorUp } from "lucide-react";
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
  is_default: boolean;
}

export function ActiveCallArea({ recipient }: Props) {
  const {
    leaveCall,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    inputDeviceId,
    outputDeviceId,
    activeOutputDeviceName,
    outputFallback,
    outputStatus,
    outputError,
    setInputDevice,
    setOutputDevice,
    isConnecting,
    isConnected,
    connectionStage,
    accountId,
    screenShareStatus,
    screenShareStage,
    screenShareError,
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    speakingUsers,
    voiceParticipants,
  } = useVoiceStore();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [showShareConfirm, setShowShareConfirm] = useState(false);
  const currentAccount = useAccountStore(state => state.accounts.find(a => a.id === accountId));
  const isRecipientConnected = voiceParticipants.has(recipient.id);
  const isRinging = !isRecipientConnected;
  const isLocalSpeaking = Boolean(currentAccount && speakingUsers.has(currentAccount.user_id) && !isMuted);
  const isRecipientSpeaking = Boolean(speakingUsers.has(recipient.id) && isRecipientConnected);
  const shareInProgress = screenShareStatus !== "idle" && screenShareStatus !== "error";

  useEffect(() => {
    invoke<AudioDevice[]>("get_audio_devices")
      .then(setDevices)
      .catch((e) => console.error("Falha ao buscar dispositivos:", e));
  }, []);

  const inputs = devices.filter((d) => d.is_input);

  const outputs = devices.filter((d) => !d.is_input);
  const defaultInput = inputs.find((device) => device.is_default);
  const defaultOutput = outputs.find((device) => device.is_default);
  const outputLabel = outputStatus === "switching"
    ? "Trocando saída..."
    : outputStatus === "error"
      ? "Falha na saída de áudio"
      : activeOutputDeviceName
        ? `${outputFallback ? "Saída alternativa" : "Saída"}: ${activeOutputDeviceName}`
        : "Preparando saída de áudio";

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
          background: isConnected && !isRinging ? "var(--status-online)" : "var(--status-idle)",
          boxShadow: isConnected && !isRinging ? "0 0 8px var(--status-online)" : "0 0 8px rgba(240, 178, 50, 0.7)",
          animation: isRinging || isConnecting ? "pulse 1.5s infinite" : "none"
        }} />
        <span style={{ fontSize: 13, color: isConnected && !isRinging ? "var(--status-online)" : "var(--status-idle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" }}>
          {isRinging ? "Chamando..." : isConnected ? "Voz conectada" : isConnecting ? connectionStage : "Desconectado"}
        </span>
      </div>

      <div
        role="status"
        aria-live="polite"
        title={outputError ?? outputLabel}
        style={{
          position: "absolute",
          top: 16,
          right: 24,
          display: "flex",
          alignItems: "center",
          gap: 6,
          maxWidth: "42%",
          color: outputStatus === "error"
            ? "var(--status-danger)"
            : outputFallback
              ? "var(--status-idle)"
              : "var(--text-muted)",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <Headphones size={14} aria-hidden="true" />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {outputLabel}
        </span>
      </div>

      <style>
        {`
          @keyframes callRingingPulse {
            0% {
              box-shadow: 0 0 0 0 rgba(240, 178, 50, 0.55);
              filter: brightness(0.72);
              transform: scale(0.98);
            }
            50% {
              box-shadow: 0 0 0 14px rgba(240, 178, 50, 0.15);
              filter: brightness(0.58);
              transform: scale(1.02);
            }
            100% {
              box-shadow: 0 0 0 22px rgba(240, 178, 50, 0);
              filter: brightness(0.72);
              transform: scale(0.98);
            }
          }
          .ringing-avatar {
            border-radius: 50%;
            animation: callRingingPulse 2.2s infinite ease-in-out;
            opacity: 0.85;
            transition: all 0.3s ease;
          }
          @keyframes speakingGlow {
            0% {
              box-shadow: 0 0 0 3px #23a55a, 0 0 10px rgba(35, 165, 90, 0.5);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 0 4px #23a55a, 0 0 18px rgba(35, 165, 90, 0.85);
              transform: scale(1.02);
            }
            100% {
              box-shadow: 0 0 0 3px #23a55a, 0 0 10px rgba(35, 165, 90, 0.5);
              transform: scale(1);
            }
          }
          .speaking-avatar {
            border-radius: 50%;
            animation: speakingGlow 1.2s infinite ease-in-out;
            border-color: #23a55a !important;
          }
          @media (prefers-reduced-motion: reduce) {
            .ringing-avatar {
              animation: none;
              filter: brightness(0.7);
              opacity: 0.85;
            }
            .speaking-avatar {
              animation: none;
            }
          }
        `}
      </style>

      {screenShareStatus !== "idle" && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            top: 44,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 7,
            maxWidth: "70%",
            padding: "6px 10px",
            borderRadius: 7,
            background: screenShareStatus === "error"
              ? "rgba(242, 63, 67, 0.16)"
              : "rgba(35, 165, 90, 0.16)",
            color: screenShareStatus === "error" ? "var(--status-danger)" : "var(--status-online)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <MonitorUp size={14} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {screenShareError ?? screenShareStage ?? "Preparando compartilhamento..."}
          </span>
        </div>
      )}

      {showShareConfirm && (
        <div
          role="dialog"
          aria-label="Confirmar compartilhamento de tela"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 96,
            transform: "translateX(-50%)",
            width: 320,
            padding: 14,
            borderRadius: 10,
            border: "1px solid var(--border-subtle)",
            background: "var(--bg-floating)",
            boxShadow: "var(--elevation-high)",
            zIndex: 20,
          }}
        >
          <div style={{ color: "var(--text-normal)", fontSize: 14, fontWeight: 700 }}>
            Compartilhar a tela inteira?
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4, marginTop: 5 }}>
            Tudo que aparecer no monitor poderá ser visto por {recipient.global_name ?? recipient.username}.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setShowShareConfirm(false)}
              style={{ border: "none", background: "transparent", color: "var(--text-normal)", padding: "7px 10px", cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                setShowShareConfirm(false);
                void startScreenShare();
              }}
              style={{ border: "none", borderRadius: 5, background: "var(--brand-500)", color: "#fff", padding: "7px 12px", fontWeight: 700, cursor: "pointer" }}
            >
              Compartilhar
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 36, marginBottom: 24, marginTop: 16 }}>
        {/* Local User */}
        {currentAccount && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div
              className={isLocalSpeaking ? "speaking-avatar" : ""}
              style={{
                padding: 4,
                borderRadius: "50%",
                border: isMuted
                  ? "2px solid var(--status-danger)"
                  : isLocalSpeaking
                    ? "2px solid #23a55a"
                    : "2px solid transparent",
                boxShadow: isLocalSpeaking
                  ? "0 0 0 3px #23a55a, 0 0 14px rgba(35, 165, 90, 0.75)"
                  : "none",
                transition: "all 0.15s ease-in-out"
              }}
            >
              <Avatar
                userId={currentAccount.user_id}
                avatarHash={currentAccount.avatar}
                username={currentAccount.username}
                size={96}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ fontSize: 15, color: "#fff", fontWeight: 600 }}>{currentAccount.global_name ?? currentAccount.username}</span>
              <span style={{
                fontSize: 12,
                fontWeight: 500,
                color: isMuted ? "var(--status-danger)" : isLocalSpeaking ? "var(--status-online)" : "var(--text-muted)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                minHeight: 16
              }}>
                {isMuted ? "Mutado" : isLocalSpeaking ? "Falando..." : "Conectado"}
              </span>
            </div>
          </div>
        )}

        {/* Recipient User */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div
            className={`${isRinging ? "ringing-avatar" : ""} ${isRecipientSpeaking ? "speaking-avatar" : ""}`}
            style={{
              padding: 4,
              borderRadius: "50%",
              border: isRecipientSpeaking
                ? "2px solid #23a55a"
                : isRinging
                  ? "2px solid rgba(240, 178, 50, 0.4)"
                  : "2px solid transparent",
              boxShadow: isRecipientSpeaking
                ? "0 0 0 3px #23a55a, 0 0 14px rgba(35, 165, 90, 0.75)"
                : "none",
              transition: "all 0.25s ease-in-out"
            }}
          >
            <Avatar
              userId={recipient.id}
              avatarHash={recipient.avatar ?? null}
              avatarDecoration={recipient.avatar_decoration_data}
              username={recipient.username}
              size={96}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 15, color: isRinging ? "var(--text-muted)" : "#fff", fontWeight: 600, transition: "color 0.3s" }}>
              {recipient.global_name ?? recipient.username}
            </span>
            {isRinging ? (
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--status-idle)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                letterSpacing: "0.01em"
              }}>
                Chamando...
              </span>
            ) : (
              <span style={{
                fontSize: 12,
                fontWeight: 500,
                color: isRecipientSpeaking ? "var(--status-online)" : "var(--text-muted)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                minHeight: 16
              }}>
                {isRecipientSpeaking ? "Falando..." : "Conectado"}
              </span>
            )}
          </div>
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
          type="button"
          disabled
          aria-disabled="true"
          className="header-icon-button"
          style={{ ...controlBtnStyle, background: "transparent", opacity: 0.5, cursor: "not-allowed" }}
          title="Ligar Câmera (Em breve)"
        >
          <Video size={20} />
        </button>

        {/* Screen Share */}
        <button
          type="button"
          disabled={!isConnected}
          aria-pressed={shareInProgress}
          className="header-icon-button"
          onClick={() => {
            if (shareInProgress) {
              void stopScreenShare();
            } else {
              setShowShareConfirm(true);
            }
          }}
          style={{
            ...controlBtnStyle,
            background: isScreenSharing ? "var(--status-online)" : "transparent",
            color: isScreenSharing ? "#fff" : "var(--interactive-normal)",
            opacity: isConnected ? 1 : 0.5,
            cursor: isConnected ? "pointer" : "not-allowed",
          }}
          title={shareInProgress ? "Parar compartilhamento" : "Compartilhar a tela inteira"}
        >
          <MonitorUp size={20} />
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
              <button
                onClick={() => setInputDevice(null)}
                style={{
                  background: inputDeviceId == null ? "var(--brand-500)" : "transparent",
                  color: inputDeviceId == null ? "#fff" : "var(--interactive-normal)",
                  border: "none", padding: "8px 12px", borderRadius: "var(--radius-sm)", textAlign: "left", cursor: "pointer", fontSize: 14,
                }}
              >
                Padrão do Windows{defaultInput ? `: ${defaultInput.name}` : ""}
              </button>
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
              <button
                onClick={() => setOutputDevice(null)}
                style={{
                  background: outputDeviceId == null ? "var(--brand-500)" : "transparent",
                  color: outputDeviceId == null ? "#fff" : "var(--interactive-normal)",
                  border: "none", padding: "8px 12px", borderRadius: "var(--radius-sm)", textAlign: "left", cursor: "pointer", fontSize: 14,
                }}
              >
                Padrão de comunicações do Windows{defaultOutput ? `: ${defaultOutput.name}` : ""}
              </button>
              {outputs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setOutputDevice(d.id)}
                  style={{
                    background: outputDeviceId === d.id ? "var(--brand-500)" : "transparent",
                    color: outputDeviceId === d.id ? "#fff" : "var(--interactive-normal)",
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
