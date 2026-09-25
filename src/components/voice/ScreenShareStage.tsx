import { LoaderCircle, MonitorUp, Square, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useAccountStore } from "@/stores/accountStore";
import { useDiscordStore } from "@/stores/discordStore";
import { useVoiceStore } from "@/stores/voiceStore";
import type { DiscordUser } from "@/types";

interface Props {
  recipient?: DiscordUser;
  allowClose?: boolean;
}

interface Participant {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  speaking: boolean;
  local: boolean;
}

export function ScreenShareStage({ recipient, allowClose = false }: Props) {
  const {
    accountId,
    speakingUsers,
    voiceParticipants,
    screenShareStatus,
    screenShareStage,
    screenShareError,
    screenSharePreviewUrl,
    isScreenSharing,
    stopScreenShare,
    setScreenShareViewOpen,
  } = useVoiceStore();
  const account = useAccountStore((state) => state.accounts.find((item) => item.id === accountId));
  const cache = useDiscordStore((state) => state.cache);

  const participants = new Map<string, Participant>();
  if (account) {
    participants.set(account.user_id, {
      id: account.user_id,
      username: account.username,
      displayName: account.global_name ?? account.username,
      avatar: account.avatar,
      speaking: speakingUsers.has(account.user_id),
      local: true,
    });
  }
  if (recipient) {
    participants.set(recipient.id, {
      id: recipient.id,
      username: recipient.username,
      displayName: recipient.global_name ?? recipient.username,
      avatar: recipient.avatar,
      speaking: speakingUsers.has(recipient.id),
      local: false,
    });
  }
  for (const userId of new Set([...voiceParticipants, ...speakingUsers])) {
    if (participants.has(userId)) continue;
    const presence = accountId ? cache.presences[accountId]?.[userId] : undefined;
    const relationship = accountId
      ? cache.relationships[accountId]?.find((item) => item.user?.id === userId)?.user
      : undefined;
    const user = relationship ?? presence?.user;
    participants.set(userId, {
      id: userId,
      username: user?.username || "Participante",
      displayName: relationship?.global_name ?? user?.username ?? "Participante",
      avatar: user?.avatar ?? null,
      speaking: true,
      local: false,
    });
  }

  const stageLabel = screenShareError
    ?? screenShareStage
    ?? (isScreenSharing ? "Transmitindo sua tela" : "Preparando transmissão...");
  const loading = !screenSharePreviewUrl && screenShareStatus !== "error";

  return (
    <section
      aria-label="Prévia do compartilhamento de tela"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "#090a0c",
        color: "var(--text-normal)",
      }}
    >
      <header
        style={{
          minHeight: 52,
          padding: "0 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-primary)",
        }}
      >
        <MonitorUp size={19} color={screenShareStatus === "error" ? "var(--status-danger)" : "var(--status-online)"} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            Sua transmissão
          </div>
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 1,
              color: screenShareStatus === "error" ? "var(--status-danger)" : "var(--text-muted)",
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {stageLabel}
          </div>
        </div>
        {screenShareStatus !== "idle" && screenShareStatus !== "error" && (
          <button
            type="button"
            onClick={() => void stopScreenShare()}
            style={{
              height: 32,
              padding: "0 11px",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              border: "none",
              borderRadius: 6,
              background: "var(--status-danger)",
              color: "white",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <Square size={12} fill="currentColor" />
            Parar
          </button>
        )}
        {allowClose && (
          <button
            type="button"
            aria-label="Voltar ao chat"
            title="Voltar ao chat"
            onClick={() => setScreenShareViewOpen(false)}
            className="header-icon-button"
            style={{ width: 32, height: 32 }}
          >
            <X size={18} />
          </button>
        )}
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: "18px clamp(18px, 4vw, 54px) 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "min(100%, 1180px)",
            aspectRatio: "16 / 9",
            maxHeight: "100%",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            background: "#000",
            boxShadow: "0 16px 44px rgba(0, 0, 0, 0.32)",
          }}
        >
          {screenSharePreviewUrl ? (
            <img
              src={screenSharePreviewUrl}
              alt="Prévia ao vivo da tela compartilhada"
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-muted)" }}>
              {loading ? <LoaderCircle size={30} className="animate-spin" /> : <MonitorUp size={30} />}
              <span style={{ fontSize: 13 }}>{stageLabel}</span>
            </div>
          )}
          <div
            style={{
              position: "absolute",
              left: 10,
              bottom: 10,
              padding: "5px 8px",
              borderRadius: 5,
              background: "rgba(0, 0, 0, 0.72)",
              color: "rgba(255, 255, 255, 0.82)",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Prévia local · Tela inteira
          </div>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: "10px 18px 14px",
          borderTop: "1px solid var(--border-subtle)",
          background: "var(--bg-secondary)",
        }}
      >
        <div style={{ marginBottom: 8, color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Participantes · {participants.size}
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          {[...participants.values()].map((participant) => (
            <div
              key={participant.id}
              style={{
                minWidth: 132,
                padding: "7px 9px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 7,
                border: participant.speaking ? "1px solid var(--status-online)" : "1px solid var(--border-subtle)",
                background: "var(--bg-primary)",
              }}
            >
              <Avatar
                userId={participant.id}
                avatarHash={participant.avatar}
                username={participant.username}
                size={28}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 700 }}>
                  {participant.displayName}
                </div>
                <div style={{ marginTop: 1, color: participant.speaking ? "var(--status-online)" : "var(--text-muted)", fontSize: 10 }}>
                  {participant.local ? "Você" : participant.speaking ? "Falando" : "Na chamada"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
