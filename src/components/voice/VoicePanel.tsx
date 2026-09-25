import { useVoiceStore } from "@/stores/voiceStore";
import { useDiscordStore } from "@/stores/discordStore";
import {
  PhoneOff, Mic, MicOff, Headphones, Video,
  MonitorUp, Sparkles, Radio
} from "lucide-react";
import { useState, useEffect } from "react";
import { VoiceConnectionPopover } from "./VoiceConnectionPopover";
import { toast } from "@/components/ui/Toast";

export function VoicePanel() {
  const { 
    isConnected, 
    isConnecting, 
    connectionStage,
    channelId, 
    guildId, 
    accountId, 
    leaveCall, 
    isMuted, 
    isDeafened, 
    toggleMute, 
    toggleDeafen,
    activeOutputDeviceName,
    outputStatus,
    outputFallback,
    outputError,
    screenShareStatus,
    screenShareStage,
    screenShareError,
    stopScreenShare,
    screenShareViewOpen,
    setScreenShareViewOpen,
    speakingUsers,
    voiceParticipants,
  } = useVoiceStore();
  
  const { cache } = useDiscordStore();
  const [channelName, setChannelName] = useState("Voz Conectada");
  const [showPopover, setShowPopover] = useState(false);

  const shareInProgress = screenShareStatus !== "idle" && screenShareStatus !== "error";
  const isDmCalling = !guildId && isConnected && voiceParticipants.size <= 1;
  const isWaiting = isConnecting || isDmCalling;

  useEffect(() => {
    if (channelId && accountId) {
      if (guildId) {
        const channels = cache.channels[accountId]?.[guildId];
        const ch = channels?.find((c) => c.id === channelId);
        if (ch && ch.name) setChannelName(ch.name);
        
      } else {
        setChannelName("Chamada Direta");
      }
    }
  }, [channelId, guildId, accountId, cache.channels]);

  if (!isConnected && !isConnecting) return null;

  return (
    <div
      style={{
        position: "relative",
        background: "var(--bg-secondary-alt)",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 10px",
        flexShrink: 0,
        zIndex: 40,
        userSelect: "none",
      }}
    >
      {/* FLOATING VOICE CONNECTION POPOVER */}
      {showPopover && (
        <VoiceConnectionPopover onClose={() => setShowPopover(false)} />
      )}

      {/* TOP ROW: RTC Status Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {/* Clickable Signal & Status Title */}
        <div
          onClick={() => setShowPopover((prev) => !prev)}
          className="hover-bg-modifier"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
            cursor: "pointer",
            padding: "3px 5px",
            borderRadius: 6,
            transition: "background 100ms",
          }}
          title="Clique para abrir detalhes da conexão RTC"
        >
          {/* Signal Wifi / Radio Icon */}
          <div
            style={{
              color: isWaiting ? "#f0b232" : "#23a55a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Radio size={18} className={isWaiting ? "animate-pulse" : ""} />
          </div>

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: isWaiting ? "#f0b232" : speakingUsers.size > 0 ? "#57f287" : "#23a55a",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: 1.2,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{isConnecting ? (connectionStage || "Conectando RTC...") : isDmCalling ? "Chamando..." : "Voz conectada"}</span>
              {speakingUsers.size > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    background: "rgba(35, 165, 90, 0.2)",
                    color: "#57f287",
                    border: "1px solid rgba(35, 165, 90, 0.5)",
                    padding: "0 5px",
                    borderRadius: 4,
                  }}
                >
                  Voz ativa
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: 1.2,
                marginTop: 1,
              }}
            >
              {activeOutputDeviceName
                ? `${channelName} · ${outputFallback ? "Saída alternativa" : "Saída"}: ${activeOutputDeviceName}`
                : channelName}
            </div>
          </div>
        </div>

        {/* Audio Waveform & Disconnect */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {/* Estado real do stream de saída */}
          {isConnected && (
            <div
              role="status"
              aria-live="polite"
              title={outputError ?? (activeOutputDeviceName ? `Saída ativa: ${activeOutputDeviceName}` : "Preparando saída de áudio")}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 4px",
                color: outputStatus === "error"
                  ? "var(--status-danger)"
                  : outputStatus === "switching" || outputFallback
                    ? "var(--status-idle)"
                    : "var(--status-online)",
              }}
            >
              <Headphones size={16} />
            </div>
          )}

          <button
            onClick={() => leaveCall()}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 5,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 150ms",
            }}
            title="Desconectar da chamada"
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--status-dnd)";
              e.currentTarget.style.background = "rgba(242, 63, 67, 0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <PhoneOff size={18} />
          </button>
        </div>
      </div>

      {screenShareStatus !== "idle" && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 8px",
            borderRadius: 6,
            background: screenShareStatus === "error"
              ? "rgba(242, 63, 67, 0.12)"
              : "rgba(35, 165, 90, 0.12)",
            color: screenShareStatus === "error" ? "var(--status-dnd)" : "var(--status-online)",
            fontSize: 11,
            lineHeight: 1.3,
          }}
        >
          <MonitorUp size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, color: "var(--text-normal)" }}>
            {screenShareError ?? screenShareStage ?? "Preparando compartilhamento..."}
          </span>
          {shareInProgress && !screenShareViewOpen && (
            <button
              type="button"
              onClick={() => setScreenShareViewOpen(true)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--brand-360, #949cf7)",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                padding: 3,
              }}
            >
              Ver
            </button>
          )}
          {shareInProgress && (
            <button
              type="button"
              onClick={() => void stopScreenShare()}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--status-dnd)",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                padding: 3,
              }}
            >
              Parar
            </button>
          )}
        </div>
      )}

      {/* BOTTOM ROW: Quick Action Buttons Grid (Video, Screen Share, Activities, Mic, Deafen) */}
      <div style={{ display: "flex", gap: 4, justifyContent: "space-between", paddingTop: 4 }}>
        {/* Camera */}
        <button
          disabled
          title="Vídeo ainda não está disponível nesta versão"
          style={{
            flex: 1,
            height: 32,
            background: "var(--bg-tertiary)",
            color: "var(--text-normal)",
            border: "none",
            borderRadius: 6,
            cursor: "not-allowed",
            opacity: 0.45,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 150ms",
          }}
          className="hover-bg-modifier"
        >
          <Video size={16} />
        </button>

        {/* Screen Share */}
        <button
          type="button"
          aria-disabled="true"
          aria-label="Compartilhamento de tela em desenvolvimento"
          onClick={() => toast.info("O compartilhamento de tela ainda está em desenvolvimento e chegará na próxima versão do OrganicCord.")}
          title="Compartilhamento de tela em desenvolvimento — disponível na próxima versão"
          style={{
            flex: 1,
            height: 32,
            background: "var(--bg-tertiary)",
            color: "var(--text-normal)",
            border: "none",
            borderRadius: 6,
            cursor: "not-allowed",
            opacity: 0.45,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 150ms",
          }}
          className="hover-bg-modifier"
        >
          <MonitorUp size={16} />
        </button>

        {/* Activities */}
        <button
          disabled
          title="Atividades ainda não estão disponíveis nesta versão"
          style={{
            flex: 1,
            height: 32,
            background: "var(--bg-tertiary)",
            color: "var(--text-normal)",
            border: "none",
            borderRadius: 6,
            cursor: "not-allowed",
            opacity: 0.45,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 150ms",
          }}
          className="hover-bg-modifier"
        >
          <Sparkles size={16} />
        </button>

        {/* Mute Mic */}
        <button
          onClick={toggleMute}
          title={isMuted ? "Desmutar microfone" : "Mutar microfone"}
          style={{
            flex: 1,
            height: 32,
            background: isMuted ? "var(--status-dnd)" : "var(--bg-tertiary)",
            color: isMuted ? "white" : "var(--text-normal)",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 150ms",
          }}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        {/* Deafen */}
        <button
          onClick={toggleDeafen}
          title={isDeafened ? "Ativar áudio" : "Ensurdecer áudio"}
          style={{
            flex: 1,
            height: 32,
            background: isDeafened ? "var(--status-dnd)" : "var(--bg-tertiary)",
            color: isDeafened ? "white" : "var(--text-normal)",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 150ms",
          }}
        >
          <Headphones size={16} />
        </button>
      </div>
    </div>
  );
}
