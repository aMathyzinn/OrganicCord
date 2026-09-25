import React from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useVoiceStore } from "@/stores/voiceStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { Avatar } from "@/components/ui/Avatar";

export function IncomingCallWidget() {
  const { incomingCall, acceptIncomingCall, declineIncomingCall } = useVoiceStore();
  const { setActiveAccount, setActiveGuild, setActiveChannel, navigateToDMs } = useNavigationStore();

  if (!incomingCall) return null;

  const { callerUser, callerId, accountId, channelId } = incomingCall;
  const displayName = callerUser?.global_name || callerUser?.username || "Alguém";

  const handleAccept = async () => {
    // Navega para a DM correspondente e conecta
    if (accountId) {
      setActiveAccount(accountId);
      setActiveGuild(null);
      navigateToDMs();
      setActiveChannel(channelId);
    }
    await acceptIncomingCall();
  };

  const handleDecline = async () => {
    await declineIncomingCall();
  };

  return (
    <div
      role="dialog"
      aria-label="Chamada de voz recebida"
      style={{
        position: "fixed",
        top: 24,
        right: 24,
        zIndex: 9999,
        width: 320,
        background: "rgba(18, 18, 20, 0.94)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 16,
        boxShadow: "0 16px 48px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        padding: "24px 20px 20px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        animation: "incomingSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <style>
        {`
          @keyframes incomingSlideIn {
            from {
              opacity: 0;
              transform: translateY(-20px) scale(0.96);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes incomingRingPulse {
            0% {
              box-shadow: 0 0 0 0 rgba(35, 165, 90, 0.6);
            }
            70% {
              box-shadow: 0 0 0 16px rgba(35, 165, 90, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(35, 165, 90, 0);
            }
          }
          .incoming-avatar-ring {
            animation: incomingRingPulse 1.8s infinite ease-out;
          }
        `}
      </style>

      {/* Avatar exclusivo de quem está ligando (sem a foto do usuário) */}
      <div
        className="incoming-avatar-ring"
        style={{
          borderRadius: "50%",
          padding: 3,
          background: "linear-gradient(135deg, #23a55a, #57f287)",
          marginBottom: 14,
        }}
      >
        <Avatar
          userId={callerUser?.id ?? callerId}
          avatarHash={callerUser?.avatar ?? null}
          avatarDecoration={callerUser?.avatar_decoration_data}
          username={displayName}
          size={84}
        />
      </div>

      {/* Informações do Chamador */}
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: "#fff",
          textAlign: "center",
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginBottom: 4,
        }}
      >
        {displayName}
      </div>

      <div
        style={{
          fontSize: 13,
          color: "var(--status-online)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 20,
        }}
      >
        <Phone size={14} className="animate-pulse" />
        <span>Chamada de voz recebida...</span>
      </div>

      {/* Botões de Ação: Atender e Recusar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          width: "100%",
        }}
      >
        {/* Recusar */}
        <button
          type="button"
          onClick={handleDecline}
          title="Recusar chamada"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "11px 16px",
            background: "#f23f43",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
            boxShadow: "0 4px 12px rgba(242, 63, 67, 0.3)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1.0)")}
        >
          <PhoneOff size={18} />
          <span>Recusar</span>
        </button>

        {/* Atender */}
        <button
          type="button"
          onClick={handleAccept}
          title="Atender chamada"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "11px 16px",
            background: "#23a55a",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
            boxShadow: "0 4px 12px rgba(35, 165, 90, 0.35)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1.0)")}
        >
          <Phone size={18} />
          <span>Atender</span>
        </button>
      </div>
    </div>
  );
}
