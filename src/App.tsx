import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { initNotificationSystem, triggerDesktopNotification } from "@/lib/notifications";
import { useAccountStore } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useVoiceStore } from "@/stores/voiceStore";
import { useGameActivityStore } from "@/stores/gameActivityStore";
import { shouldShowIncomingDmCall } from "@/lib/callState";
import { MainLayout } from "@/components/layout/MainLayout";
import { AddAccountModal } from "@/components/auth/AddAccountModal";
import { WelcomeHub } from "@/components/auth/WelcomeHub";
import { TitleBar } from "@/components/layout/TitleBar";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ToastContainer, toast } from "@/components/ui/Toast";
import { UserProfileModal } from "@/components/profile/UserProfileModal";
import { ExternalLinkModal } from "@/components/ui/ExternalLinkModal";
import { IncomingCallWidget } from "@/components/voice/IncomingCallWidget";
import * as Tooltip from "@radix-ui/react-tooltip";
import type {
  DiscordGatewayGuild,
  DiscordChannel,
  DiscordMember,
  DiscordMessage,
  DiscordPresence,
  DiscordUser,
  Reaction,
} from "@/types";

interface GatewayTypingEvent {
  channel_id: string;
  user_id: string;
  timestamp: number;
  member?: DiscordMember;
}

interface GatewayDispatchData extends Partial<DiscordMessage>, Partial<DiscordMember> {
  channel_id?: string;
  guild_id?: string;
  message_id?: string;
  user_id?: string;
  ids?: string[];
  emoji?: Reaction["emoji"];
  user?: DiscordUser;
  ringing?: string[];
  region?: string;
  voice_states?: Array<{ user_id: string; session_id?: string; channel_id?: string }>;
}

export default function App() {
  const { accounts, loadAccounts, connectAll, toggleStealth } = useAccountStore();
  const { setActiveAccount, focusedImage, setFocusedImage } = useNavigationStore();
  const [initializing, setInitializing] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Inicializa o sistema de notificações
  useEffect(() => {
    initNotificationSystem();
  }, []);

  // Os menus de contexto do Organic continuam sendo tratados pelos componentes.
  // Este listener roda na janela, depois deles, apenas para impedir o menu nativo
  // do WebView (inspecionar, recarregar e opções do navegador).
  useEffect(() => {
    const preventNativeContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("contextmenu", preventNativeContextMenu);
    return () => window.removeEventListener("contextmenu", preventNativeContextMenu);
  }, []);

  // Gateway message listener
  useEffect(() => {
    const unlistenMessagePromise = listen<{ account_id: string; message: DiscordMessage }>("gateway-message", (event) => {
      const { account_id, message } = event.payload;
      if (message && message.channel_id) {
        useDiscordStore.getState().prependMessage(message.channel_id, message);
        
        const activeChannelId = useNavigationStore.getState().activeChannelId;
        const activeAccountId = useNavigationStore.getState().activeAccountId;
        
        const account = useAccountStore.getState().accounts.find(a => a.id === account_id);
        const hasMention = account && message.mentions?.some((member) => member.id === account.user_id);
        const isFromMe = account && message.author?.id === account.user_id;
        
        const isFocused = document.hasFocus();
        const isCurrentChannel = activeChannelId === message.channel_id && activeAccountId === account_id;

        if (!isCurrentChannel || !isFocused) {
          const isMuted = useNotificationStore.getState().isMuted(message.guild_id, message.channel_id, message.author?.id);
          
          if (!isMuted) {
            const effectiveLevel = useNotificationStore.getState().getEffectiveLevel(message.guild_id, message.channel_id);
            
            let shouldNotify = false;
            if (effectiveLevel === "all") shouldNotify = true;
            if (effectiveLevel === "mentions" && (hasMention || !message.guild_id)) shouldNotify = true;
            if (effectiveLevel === "nothing") shouldNotify = false;
            if (isFromMe) shouldNotify = false;
            
            if (shouldNotify) {
              useDiscordStore.getState().incrementUnread(account_id, message.channel_id, !!hasMention, message.guild_id);
              triggerDesktopNotification(account_id, message, !!hasMention);
            }
          }
        } else {
          useDiscordStore.getState().clearUnread(account_id, message.channel_id, message.id);
        }
      }
    });

    const unlistenSessionPromise = listen<{ account_id: string; session_id: string }>("gateway-session", (event) => {
      const { account_id, session_id } = event.payload;
      useDiscordStore.getState().setSessionId(account_id, session_id);
    });

    const unlistenGuildPromise = listen<{ account_id: string; guild: DiscordGatewayGuild }>("gateway-guild-create", (event) => {
      const { account_id, guild } = event.payload;
      if (guild) {
        useDiscordStore.getState().hydrateGuildFromGateway(account_id, guild);
      }
      if (guild && guild.emojis && guild.emojis.length > 0) {
        useDiscordStore.getState().addGuildEmojis(account_id, guild.id, guild.emojis);
      }
      if (guild && guild.roles && guild.roles.length > 0) {
        useDiscordStore.getState().addGuildRoles(account_id, guild.id, guild.roles);
      }
      if (guild?.members) {
        const currentUserId = useAccountStore
          .getState()
          .accounts.find((account) => account.id === account_id)?.user_id;
        const currentMember = guild.members.find(
          (member) => member?.user?.id === currentUserId
        );
        if (currentMember) {
          useDiscordStore.getState().addGuildMember(account_id, guild.id, currentMember);
        }
      }
    });

    const unlistenPresencePromise = listen<{ account_id: string; presence: DiscordPresence }>("gateway-presence", (event) => {
      const { account_id, presence } = event.payload;
      if (presence) {
        useDiscordStore.getState().updatePresence(account_id, presence);
      }
    });

    const unlistenRelationshipPromise = listen<{ account_id: string }>("gateway-relationship", (event) => {
      const { account_id } = event.payload;
      useDiscordStore.getState().fetchRelationships(account_id);
    });

    const unlistenPresencesPromise = listen<{ account_id: string; presences: DiscordPresence[] }>("gateway-presences", (event) => {
      const { account_id, presences } = event.payload;
      if (presences && Array.isArray(presences)) {
        useDiscordStore.getState().updatePresences(account_id, presences);
      }
    });

    const unlistenTypingPromise = listen<{ account_id: string; typing: GatewayTypingEvent }>("gateway-typing-start", (event) => {
      const { typing } = event.payload;
      if (typing && typing.channel_id && typing.user_id) {
        useDiscordStore.getState().addTypingUser(typing.channel_id, typing.user_id, typing.timestamp * 1000, typing.member);
      }
    });

    const unlistenDispatchPromise = listen<{ account_id: string; event_type: string; data: GatewayDispatchData }>("gateway-dispatch", (event) => {
      const { account_id, event_type: eventType, data } = event.payload;
      const store = useDiscordStore.getState();
      const currentUserId = useAccountStore
        .getState()
        .accounts.find((account) => account.id === account_id)?.user_id;

      switch (eventType) {
        case "MESSAGE_UPDATE":
          if (data.channel_id && data.id) {
            store.updateMessageFromGateway(data.channel_id, { ...data, id: data.id });
          }
          break;
        case "MESSAGE_DELETE":
          if (data?.channel_id && data?.id) store.removeMessageFromGateway(data.channel_id, data.id);
          break;
        case "MESSAGE_DELETE_BULK":
          if (data.channel_id && Array.isArray(data.ids)) {
            const channelId = data.channel_id;
            data.ids.forEach((id) => store.removeMessageFromGateway(channelId, id));
          }
          break;
        case "MESSAGE_REACTION_ADD":
        case "MESSAGE_REACTION_REMOVE":
          if (data?.channel_id && data?.message_id && data?.emoji) {
            store.applyGatewayReaction(
              data.channel_id,
              data.message_id,
              { id: data.emoji.id ?? null, name: data.emoji.name ?? "" },
              eventType === "MESSAGE_REACTION_ADD",
              data.user_id === currentUserId
            );
          }
          break;
        case "MESSAGE_REACTION_REMOVE_ALL": {
          if (!data.channel_id || !data.message_id) break;
          const message = store.cache.messages[data.channel_id]?.find((item) => item.id === data.message_id);
          if (message) {
            store.updateMessageFromGateway(data.channel_id, { id: message.id, reactions: [] });
          }
          break;
        }
        case "CHANNEL_CREATE":
        case "CHANNEL_UPDATE":
        case "THREAD_CREATE":
        case "THREAD_UPDATE": {
          const raw = data as GatewayDispatchData & Partial<DiscordChannel> & { type?: number };
          const channelType = Number(raw.channel_type ?? raw.type);
          if (raw.guild_id && raw.id && Number.isFinite(channelType)) {
            store.applyGuildChannelEvent(account_id, raw.guild_id, {
              id: raw.id,
              name: typeof raw.name === "string" ? raw.name : null,
              channel_type: channelType,
              position: typeof raw.position === "number" ? raw.position : null,
              parent_id: typeof raw.parent_id === "string" ? raw.parent_id : null,
              topic: typeof raw.topic === "string" ? raw.topic : null,
              nsfw: typeof raw.nsfw === "boolean" ? raw.nsfw : null,
              available_tags: raw.available_tags,
              last_message_id: raw.last_message_id,
              permission_overwrites: raw.permission_overwrites,
            } as DiscordChannel, false);
          }
          break;
        }
        case "CHANNEL_DELETE":
        case "THREAD_DELETE": {
          if (data.guild_id && data.id) {
            store.applyGuildChannelEvent(account_id, data.guild_id, {
              id: data.id,
              name: null,
              channel_type: 0,
              position: null,
              parent_id: null,
              topic: null,
              nsfw: null,
            } as DiscordChannel, true);
          }
          break;
        }
        case "GUILD_UPDATE":
        case "GUILD_DELETE":
          void store.fetchGuilds(account_id);
          break;
        case "GUILD_MEMBER_UPDATE":
          if (data.guild_id && data.user?.id === currentUserId) {
            const previous = store.cache.guildMembers[account_id]?.[data.guild_id];
            store.addGuildMember(account_id, data.guild_id, {
              ...previous,
              ...data,
              roles: data.roles ?? previous?.roles ?? [],
              joined_at: data.joined_at ?? previous?.joined_at ?? "",
              deaf: data.deaf ?? previous?.deaf ?? false,
              mute: data.mute ?? previous?.mute ?? false,
            });
          }
          break;
        case "CALL_CREATE": {
          if (data.channel_id) {
            const ringing = Array.isArray(data.ringing) ? (data.ringing as string[]) : [];
            const dm = store.cache.dms[account_id]?.find((d) => d.id === data.channel_id);
            const callerUser = dm?.recipients?.find((u) => u.id !== currentUserId) ?? dm?.recipients?.[0];
            const voiceStates = Array.isArray(data.voice_states) ? data.voice_states : [];
            const callerId = callerUser?.id ?? voiceStates.find((vs) => vs.user_id !== currentUserId)?.user_id ?? "";
            const activeCall = useVoiceStore.getState();

            if (shouldShowIncomingDmCall({
              currentUserId,
              ringingUserIds: ringing,
              activeCallChannelId: activeCall.channelId,
              channelId: data.channel_id,
            }) && callerId !== currentUserId) {
              useVoiceStore.getState().setIncomingCall({
                accountId: account_id,
                channelId: data.channel_id,
                callerId,
                callerUser,
                region: typeof data.region === "string" ? data.region : undefined,
                timestamp: Date.now(),
              });
            }

            // Sincroniza estado da chamada ativa caso seja o canal atual
            if (activeCall.channelId === data.channel_id) {
              activeCall.handleCallUpdate(data.channel_id, voiceStates, ringing);
            }
          }
          break;
        }
        case "CALL_UPDATE": {
          if (data.channel_id) {
            const incoming = useVoiceStore.getState().incomingCall;
            const ringing = Array.isArray(data.ringing) ? (data.ringing as string[]) : [];
            if (incoming && incoming.channelId === data.channel_id) {
              if (currentUserId && !ringing.includes(currentUserId)) {
                useVoiceStore.getState().setIncomingCall(null);
              }
            }

            // Sincroniza participantes e toque da chamada ativa
            const activeCall = useVoiceStore.getState();
            if (activeCall.channelId === data.channel_id) {
              const voiceStates = Array.isArray(data.voice_states) ? data.voice_states : [];
              activeCall.handleCallUpdate(data.channel_id, voiceStates, ringing);
            }
          }
          break;
        }
        case "CALL_DELETE": {
          if (data.channel_id) {
            const incoming = useVoiceStore.getState().incomingCall;
            if (incoming && incoming.channelId === data.channel_id) {
              useVoiceStore.getState().setIncomingCall(null);
            }

            // Encerra chamada ativa caso o outro lado tenha recusado ou desligado
            const activeCall = useVoiceStore.getState();
            if (activeCall.channelId === data.channel_id) {
              activeCall.handleCallDelete(data.channel_id);
            }
          }
          break;
        }
      }
    });

    const unlistenGatewayStatusPromise = listen<{
      account_id: string;
      status: "connected" | "reconnecting" | "error" | "disconnected";
      message?: string;
    }>("gateway-status", (event) => {
      const { account_id, status, message } = event.payload;
      if (status === "connected") {
        useAccountStore.getState().setSessionStatus(account_id, "Connected");
      } else if (status === "reconnecting") {
        useAccountStore.getState().setSessionStatus(account_id, "Connecting");
      } else if (status === "error") {
        useAccountStore.getState().setSessionStatus(account_id, { Error: message ?? "Gateway indisponível" });
      } else {
        useAccountStore.getState().setSessionStatus(account_id, "Disconnected");
      }
    });

    return () => {
      Promise.all([
        unlistenMessagePromise.then((f) => f()),
        unlistenSessionPromise.then((f) => f()),
        unlistenGuildPromise.then((f) => f()),
        unlistenPresencePromise.then((f) => f()),
        unlistenRelationshipPromise.then((f) => f()),
        unlistenPresencesPromise.then((f) => f()),
        unlistenTypingPromise.then((f) => f()),
        unlistenDispatchPromise.then((f) => f()),
        unlistenGatewayStatusPromise.then((f) => f()),
      ]);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await useSettingsStore.getState().loadSettings();
        await loadAccounts();
      } catch (error) {
        console.error("[startup] Falha ao carregar o estado local:", error);
        toast.error("Não foi possível carregar todas as configurações. Os padrões foram restaurados.");
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  // Quando as contas são carregadas, conecta todas automaticamente
  useEffect(() => {
    if (!initializing && accounts.length > 0) {
      connectAll();
      setActiveAccount(accounts[0].id);
    }
  }, [initializing]);

  // The detector itself runs in Rust. Polling keeps the browser layer small;
  // Rich Presence is published to whichever account is open in Discord Desktop.
  useEffect(() => {
    if (initializing) return;
    let disposed = false;
    const refreshGameActivity = async () => {
      if (!disposed) {
        await useGameActivityStore.getState().refreshAndSync();
      }
    };
    void refreshGameActivity();
    const timer = window.setInterval(() => void refreshGameActivity(), 3_500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      void useGameActivityStore.getState().clearPublishedActivity();
    };
  }, [initializing]);

  // Keybinds Globais
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+. toggles stealth mode
      if (e.ctrlKey && e.shiftKey && (e.code === "Period" || e.key === "." || e.key === ">")) {
        e.preventDefault();
        e.stopPropagation();
        toggleStealth();
        const isStealth = useAccountStore.getState().stealthMode;
        toast.info(isStealth ? "Modo furtivo ativado" : "Modo furtivo desativado");
      }
      
      // Ctrl+Shift+M toggles Mute
      if (e.ctrlKey && e.shiftKey && (e.code === "KeyM" || e.key === "m" || e.key === "M")) {
        e.preventDefault();
        e.stopPropagation();
        useVoiceStore.getState().toggleMute();
        const isMuted = useVoiceStore.getState().isMuted;
        toast.info(isMuted ? "Microfone mutado" : "Microfone desmutado");
      }
      
      // Ctrl+Shift+D toggles Deafen
      if (e.ctrlKey && e.shiftKey && (e.code === "KeyD" || e.key === "d" || e.key === "D")) {
        e.preventDefault();
        e.stopPropagation();
        useVoiceStore.getState().toggleDeafen();
        const isDeafened = useVoiceStore.getState().isDeafened;
        toast.info(isDeafened ? "Áudio ensurdecido" : "Áudio desensurdecido");
      }
    };
    document.addEventListener("keydown", handler, true);
    
    // Clear unreads on focus if we have an active channel
    const focusHandler = () => {
      const activeChannelId = useNavigationStore.getState().activeChannelId;
      const activeAccountId = useNavigationStore.getState().activeAccountId;
      if (activeChannelId && activeAccountId) {
        const msgs = useDiscordStore.getState().cache.messages[activeChannelId];
        const newestReal = msgs?.find(m => !m.id.startsWith("local-"));
        if (newestReal) {
          useDiscordStore.getState().clearUnread(activeAccountId, activeChannelId, newestReal.id);
        } else {
          useDiscordStore.getState().clearUnread(activeAccountId, activeChannelId);
        }
      }
    };
    window.addEventListener("focus", focusHandler);
    
    return () => {
      document.removeEventListener("keydown", handler, true);
      window.removeEventListener("focus", focusHandler);
    };
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
          <div style={{ height: "100%", overflow: "hidden" }}>
            <WelcomeHub
              onSuccess={(account) => {
                setShowAddAccount(false);
                setActiveAccount(account.id);
              }}
            />
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
      <ExternalLinkModal />
      <IncomingCallWidget />
      </div>
    </Tooltip.Provider>
  );
}

// WelcomeScreen removido — substituído por WelcomeHub (src/components/auth/WelcomeHub.tsx)
