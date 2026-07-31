import { useVoiceStore } from "@/stores/voiceStore";
import { useAccountStore } from "@/stores/accountStore";
import { useDiscordStore } from "@/stores/discordStore";
import { PhoneOff, Mic, MicOff, Headphones, PhoneCall } from "lucide-react";
import { useState, useEffect } from "react";

export function VoicePanel() {
  const { 
    isConnected, 
    isConnecting, 
    channelId, 
    guildId, 
    accountId, 
    leaveCall, 
    isMuted, 
    isDeafened, 
    toggleMute, 
    toggleDeafen 
  } = useVoiceStore();
  
  const { cache } = useDiscordStore();
  const { accounts } = useAccountStore();

  const [channelName, setChannelName] = useState("Voz Conectada");
  const [guildName, setGuildName] = useState("");

  useEffect(() => {
    if (channelId && accountId) {
      if (guildId) {
        const channels = cache.channels[guildId];
        const ch = channels?.find((c) => c.id === channelId);
        if (ch && ch.name) setChannelName(ch.name);
        
        const guilds = cache.guilds[accountId];
        const g = guilds?.find((g) => g.id === guildId);
        if (g && g.name) setGuildName(g.name);
      } else {
        setChannelName("Chamada Direta");
        setGuildName("Mensagem Direta");
      }
    }
  }, [channelId, guildId, accountId, cache.channels, cache.guilds]);

  if (!isConnected && !isConnecting) return null;

  return (
    <div
      style={{
        padding: "8px",
        background: "var(--bg-secondary-alt)",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flexShrink: 0,
        zIndex: 10
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ color: "var(--status-online)", display: "flex" }}>
          <PhoneCall size={16} className={isConnecting ? "animate-pulse" : ""} />
        </div>
        
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-normal)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.2
            }}
          >
            {isConnecting ? "Conectando..." : "Voz Conectada"}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.2,
              marginTop: 2
            }}
          >
            {channelName} {guildName && `/ ${guildName}`}
          </div>
        </div>

        <button
          onClick={() => leaveCall()}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Desconectar"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--status-dnd)";
            e.currentTarget.style.background = "var(--bg-modifier-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <PhoneOff size={16} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 4, justifyContent: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
        <button
          onClick={toggleMute}
          style={{
            flex: 1,
            background: isMuted ? "var(--status-dnd)" : "var(--bg-tertiary)",
            color: isMuted ? "white" : "var(--text-normal)",
            border: "none",
            borderRadius: 4,
            padding: "4px 0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          onClick={toggleDeafen}
          style={{
            flex: 1,
            background: isDeafened ? "var(--status-dnd)" : "var(--bg-tertiary)",
            color: isDeafened ? "white" : "var(--text-normal)",
            border: "none",
            borderRadius: 4,
            padding: "4px 0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Headphones size={16} style={{ textDecoration: isDeafened ? "line-through" : "none" }} />
        </button>
      </div>
    </div>
  );
}
