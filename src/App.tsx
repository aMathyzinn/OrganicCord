import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useAccountStore } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { MainLayout } from "@/components/layout/MainLayout";
import { AddAccountModal } from "@/components/auth/AddAccountModal";
import { TitleBar } from "@/components/layout/TitleBar";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { OrganicMark } from "@/components/ui/OrganicMark";
import { ToastContainer, toast } from "@/components/ui/Toast";
import { UserProfileModal } from "@/components/profile/UserProfileModal";
import * as Tooltip from "@radix-ui/react-tooltip";

export default function App() {
  const { accounts, loadAccounts, connectAll, loading, toggleStealth } = useAccountStore();
  const { setActiveAccount, focusedImage, setFocusedImage } = useNavigationStore();
  const { prependMessage } = useDiscordStore();
  const [initializing, setInitializing] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Gateway message listener
  useEffect(() => {
    const unlistenMessagePromise = listen<{ account_id: string; message: any }>("gateway-message", (event) => {
      const { account_id, message } = event.payload;
      if (message && message.channel_id) {
        useDiscordStore.getState().prependMessage(message.channel_id, message);
        
        // Check if we need to increment unread count
        const activeChannelId = useNavigationStore.getState().activeChannelId;
        const activeAccountId = useNavigationStore.getState().activeAccountId;
        
        const account = useAccountStore.getState().accounts.find(a => a.id === account_id);
        const hasMention = account && message.mentions?.some((m: any) => m.id === account.user_id);
        const isFromMe = account && message.author?.id === account.user_id;
        
        if (activeChannelId !== message.channel_id || activeAccountId !== account_id) {
          useDiscordStore.getState().incrementUnread(account_id, message.channel_id, !!hasMention, message.guild_id);
        }

        // Notification logic
        if (!isFromMe && (hasMention || !message.guild_id)) {
          if (!document.hasFocus() || activeChannelId !== message.channel_id || activeAccountId !== account_id) {
            (async () => {
              try {
                let permissionGranted = await isPermissionGranted();
                if (!permissionGranted) {
                  const permission = await requestPermission();
                  permissionGranted = permission === "granted";
                }
                if (permissionGranted) {
                  const authorName = message.author?.global_name || message.author?.username || "Alguém";
                  const title = hasMention ? `Nova menção de ${authorName}` : `Nova mensagem de ${authorName}`;
                  sendNotification({
                    title,
                    body: message.content || "Enviou um anexo",
                    icon: message.author?.avatar ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png` : undefined
                  });
                }
              } catch (err) {
                console.error("Failed to send notification:", err);
              }
            })();
          }
        }
      }
    });

    const unlistenSessionPromise = listen<{ account_id: string; session_id: string }>("gateway-session", (event) => {
      const { account_id, session_id } = event.payload;
      console.log("gateway-session received for", account_id, session_id);
      useDiscordStore.getState().setSessionId(account_id, session_id);
    });

    const unlistenGuildPromise = listen<{ account_id: string; guild: any }>("gateway-guild-create", (event) => {
      const { account_id, guild } = event.payload;
      console.log("gateway-guild-create received for", guild?.id, "emojis:", guild?.emojis?.length, "roles:", guild?.roles?.length);
      if (guild && guild.emojis && guild.emojis.length > 0) {
        useDiscordStore.getState().addGuildEmojis(account_id, guild.id, guild.emojis);
      }
      if (guild && guild.roles && guild.roles.length > 0) {
        useDiscordStore.getState().addGuildRoles(account_id, guild.id, guild.roles);
      }
    });

    const unlistenPresencePromise = listen<{ account_id: string; presence: any }>("gateway-presence", (event) => {
      const { account_id, presence } = event.payload;
      console.log("gateway-presence received", presence);
      if (presence && presence.user && presence.user.id) {
        useDiscordStore.getState().updatePresence(account_id, presence);
      }
    });

    const unlistenPresencesPromise = listen<{ account_id: string; presences: any[] }>("gateway-presences", (event) => {
      const { account_id, presences } = event.payload;
      console.log("gateway-presences received", presences?.length);
      if (presences && Array.isArray(presences)) {
        useDiscordStore.getState().updatePresences(account_id, presences);
      }
    });

    const unlistenTypingPromise = listen<{ account_id: string; typing: any }>("gateway-typing-start", (event) => {
      const { typing } = event.payload;
      if (typing && typing.channel_id && typing.user_id) {
        useDiscordStore.getState().addTypingUser(typing.channel_id, typing.user_id, typing.timestamp * 1000, typing.member);
      }
    });

    return () => {
      Promise.all([
        unlistenMessagePromise.then((f) => f()),
        unlistenSessionPromise.then((f) => f()),
        unlistenGuildPromise.then((f) => f()),
        unlistenPresencePromise.then((f) => f()),
        unlistenPresencesPromise.then((f) => f()),
        unlistenTypingPromise.then((f) => f()),
      ]);
    };
  }, []);

  useEffect(() => {
    (async () => {
      await loadAccounts();
      setInitializing(false);
    })();
  }, []);

  // Quando as contas são carregadas, conecta todas automaticamente
  useEffect(() => {
    if (!initializing && accounts.length > 0) {
      connectAll();
      setActiveAccount(accounts[0].id);
    }
  }, [initializing]);

  // Se não há contas, exibe tela de adição obrigatória
  useEffect(() => {
    if (!initializing && accounts.length === 0) {
      setShowAddAccount(true);
    }
  }, [initializing, accounts.length]);

  // Ctrl+Shift+. toggles stealth mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // e.code is layout-independent; Period key is "Period" regardless of shift state
      if (e.ctrlKey && e.shiftKey && (e.code === "Period" || e.key === "." || e.key === ">")) {
        e.preventDefault();
        e.stopPropagation();
        toggleStealth();
        const isStealth = useAccountStore.getState().stealthMode;
        toast.info(isStealth ? "Modo furtivo ativado" : "Modo furtivo desativado");
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [toggleStealth]);

  if (initializing) {
    return (
      <div style={{ height: "100vh", background: "var(--bg-tertiary)" }}>
        <TitleBar />
        <LoadingScreen message="Iniciando OrganicCord..." />
      </div>
    );
  }

  return (
    <Tooltip.Provider delayDuration={300}>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <TitleBar />
      <div style={{ flex: 1, overflow: "hidden" }}>
        {accounts.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-primary)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <WelcomeScreen onAddAccount={() => setShowAddAccount(true)} />
          </div>
        ) : (
          <MainLayout onAddAccount={() => setShowAddAccount(true)} />
        )}
      </div>

      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onSuccess={(account) => {
            setShowAddAccount(false);
            setActiveAccount(account.id);
          }}
        />
      )}

      {/* Image Lightbox */}
      {focusedImage && (
        <div
          onClick={() => setFocusedImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={focusedImage}
            alt="Foco"
            style={{
              maxWidth: "90%",
              maxHeight: "90%",
              objectFit: "contain",
              borderRadius: "4px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
              animation: "zoomIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setFocusedImage(null)}
            style={{
              position: "absolute",
              top: 24,
              right: 24,
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            className="hover-color-normal"
          >
            &times;
          </button>
        </div>
      )}

      {/* Global Modals */}
      <UserProfileModal />
      <ToastContainer />
      </div>
    </Tooltip.Provider>
  );
}

function WelcomeScreen({ onAddAccount }: { onAddAccount: () => void }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
      }}
    >
      {/* Background Glow Blobs */}
      <div 
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          background: "var(--brand-500)",
          borderRadius: "50%",
          filter: "blur(140px)",
          opacity: 0.15,
          top: "10%",
          left: "25%",
          pointerEvents: "none",
          animation: "pulse 6s infinite alternate ease-in-out",
        }}
      />
      <div 
        style={{
          position: "absolute",
          width: 350,
          height: 350,
          background: "var(--status-online)",
          borderRadius: "50%",
          filter: "blur(140px)",
          opacity: 0.12,
          bottom: "10%",
          right: "25%",
          pointerEvents: "none",
          animation: "pulse 8s infinite alternate-reverse ease-in-out",
        }}
      />

      {/* Glass Card */}
      <div
        style={{
          textAlign: "center",
          animation: "fadeIn 600ms cubic-bezier(0.16, 1, 0.3, 1)",
          maxWidth: 540,
          width: "100%",
          padding: "56px 48px",
          background: "rgba(17, 18, 20, 0.65)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "32px",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Brand mark */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "28px",
            background: "linear-gradient(135deg, rgba(35,165,90,0.15) 0%, rgba(88,101,242,0.15) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.3), inset 0 2px 0 rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 32px",
            position: "relative",
          }}
        >
          {/* Inner glow */}
          <div style={{
            position: "absolute",
            inset: 0,
            borderRadius: "28px",
            boxShadow: "inset 0 0 20px rgba(35,165,90,0.1)",
            pointerEvents: "none"
          }} />
          <OrganicMark size={48} color="var(--status-online)" />
        </div>

        <h1
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: "var(--text-normal)",
            marginBottom: 16,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          Bem-vindo ao{" "}
          <span style={{ color: "var(--brand-500)" }}>
            OrganicCord
          </span>
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            marginBottom: 40,
            lineHeight: 1.6,
            fontSize: 16,
            padding: "0 16px",
          }}
        >
          O cliente Discord alternativo projetado para máxima produtividade.
          Múltiplas contas simultâneas, inteligência artificial integrada e privacidade por padrão.
        </p>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 44,
          }}
        >
          {[
            { label: "Multi-conta", color: "var(--brand-500)", bg: "rgba(88,101,242,0.12)" },
            { label: "IA integrada", color: "var(--status-online)", bg: "rgba(35,165,90,0.12)" },
            { label: "Privacidade", color: "var(--text-warning)", bg: "rgba(240,178,50,0.12)" },
          ].map((f) => (
            <span
              key={f.label}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: f.color,
                background: f.bg,
                border: "1px solid rgba(255,255,255,0.06)",
                padding: "6px 16px",
                borderRadius: "var(--radius-full)",
                letterSpacing: "0.01em",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
            >
              {f.label}
            </span>
          ))}
        </div>

        <button
          onClick={onAddAccount}
          style={{
            background: "linear-gradient(135deg, var(--brand-500) 0%, var(--brand-600) 100%)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "16px",
            padding: "16px 40px",
            fontSize: 17,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 200ms cubic-bezier(0.16, 1, 0.3, 1)",
            letterSpacing: "0.01em",
            boxShadow: "0 8px 24px rgba(88,101,242,0.25), inset 0 1px 0 rgba(255,255,255,0.2)",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 12px 28px rgba(88,101,242,0.35), inset 0 1px 0 rgba(255,255,255,0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 8px 24px rgba(88,101,242,0.25), inset 0 1px 0 rgba(255,255,255,0.2)";
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "translateY(1px)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(88,101,242,0.2), inset 0 1px 0 rgba(255,255,255,0.1)";
          }}
        >
          <span>Adicionar Conta</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>

        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            marginTop: 24,
            opacity: 0.6,
          }}
        >
          Adicione sua primeira conta Discord para começar a usar
        </p>
      </div>
    </div>
  );
}
