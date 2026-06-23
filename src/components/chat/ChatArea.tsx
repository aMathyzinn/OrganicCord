import { useEffect, useRef, useState, useCallback } from "react";
import { useDiscordStore } from "@/stores/discordStore";
import { useAccountStore } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useAiStore, makeDefaultConfig } from "@/stores/aiStore";
import { useAiConversationStore } from "@/stores/aiConversationStore";
import { MessageList } from "./MessageList";
import { MessageInput, AttachmentData } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";
import { AiConfigModal } from "@/components/ai/AiConfigModal";
import { AiConversationModal } from "@/components/ai/AiConversationModal";
import { PinnedMessagesPopover } from "./PinnedMessagesPopover";
import { SearchResultsSidebar } from "./SearchResultsSidebar";
import type { DiscordMessage, ChannelType, DiscordChannel } from "@/types";
import { Volume2, Drama, Megaphone, MessagesSquare, Bot, MessagesSquare as Conversations, Settings, Hash, ArrowLeft, Phone, Video, Pin, Users, Search } from "lucide-react";
import { useVoiceStore } from "@/stores/voiceStore";

function getHeaderIcon(type: ChannelType): React.ReactNode {
  const n = Number(type);
  const size = 20;
  if (n === 2) return <Volume2 size={size} />;
  if (n === 13) return <Drama size={size} />;
  if (n === 5) return <Megaphone size={size} />;
  if (n === 15) return <MessagesSquare size={size} />;
  return <Hash size={size} />;
}

interface Props {
  channelId: string;
  accountId: string;
}

export function ChatArea({ channelId, accountId }: Props) {
  const { cache, loading, fetchMessages, fetchMoreMessages, sendMessage } =
    useDiscordStore();
  const { accounts } = useAccountStore();
  const { activeGuildId } = useNavigationStore();
  const [replyingTo, setReplyingTo] = useState<DiscordMessage | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showConvModal, setShowConvModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevChannelRef = useRef<string | null>(null);

  const messages = cache.messages[channelId] ?? [];
  const isLoading = loading.messages[channelId];
  const account = accounts.find((a) => a.id === accountId);

  // Carrega mensagens quando o canal muda (sempre busca fresh ao trocar de canal)
  useEffect(() => {
    prevChannelRef.current = channelId;
    fetchMessages(accountId, channelId);
    useDiscordStore.getState().clearUnread(accountId, channelId);
  }, [channelId, accountId]);

  // Polling: busca só mensagens mais novas que a última do cache (via after=<id>)
  useEffect(() => {
    const poll = async () => {
      const existing = useDiscordStore.getState().cache.messages[channelId];
      // Find the newest real (non-local) message to use as `after` cursor
      const newestReal = existing?.find((m) => !m.id.startsWith("local-"));
      if (!newestReal) return;
      try {
        const fresh = await import("@/lib/tauri").then((m) =>
          m.getMessages(accountId, channelId, undefined, newestReal.id)
        );
        if (fresh.length === 0) return;
        useDiscordStore.setState((s) => {
          const cur = s.cache.messages[channelId] ?? [];
          // Build fingerprint set from real messages (not local fakes)
          const realIds = new Set(cur.filter((m) => !m.id.startsWith("local-")).map((m) => m.id));
          const toAdd = fresh.filter((m) => !realIds.has(m.id));
          if (toAdd.length === 0) return s;
          // Remove local fake messages that have been replaced by real ones from Discord
          const freshFingerprints = new Set(fresh.map((m) => `${m.author.id}:${m.content.trim()}`));
          const dedupedCur = cur.filter(
            (m) => !m.id.startsWith("local-") || !freshFingerprints.has(`${m.author.id}:${m.content.trim()}`)
          );
          // Newest-first: newer messages go to the front (BigInt comparison for snowflake IDs)
          const sorted = [...toAdd].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
          return { cache: { ...s.cache, messages: { ...s.cache.messages, [channelId]: [...sorted, ...dedupedCur] } } };
        });
      } catch (e) {
        console.warn("[poll] erro ao buscar mensagens:", e);
      }
    };

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [channelId, accountId]);

  // Scroll para o topo (mais recente) quando muda de canal
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = 0;
    setSearchQuery(null); // Reset search when channel changes
  }, [channelId]);

  const handleSend = useCallback(async (content: string, attachment?: AttachmentData) => {
    if (!accountId || !channelId) return;
    try {
      if (attachment) {
        if (attachment.type === "file") {
          const buffer = await attachment.file.arrayBuffer();
          const data = new Uint8Array(buffer);
          await useDiscordStore.getState().sendMessageWithAttachment(
            accountId,
            channelId,
            content,
            replyingTo?.id,
            attachment.file.name,
            undefined,
            data
          );
        } else if (attachment.type === "path") {
          await useDiscordStore.getState().sendMessageWithAttachment(
            accountId,
            channelId,
            content,
            replyingTo?.id,
            attachment.name,
            attachment.path,
            undefined
          );
        }
      } else {
        await sendMessage(accountId, channelId, content, replyingTo?.id);
      }
      setReplyingTo(null);
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  }, [accountId, channelId, replyingTo, sendMessage]);

  const handleLoadMore = useCallback(() => {
    fetchMoreMessages(accountId, channelId);
  }, [accountId, channelId]);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
      }}
    >
      {/* Header do canal */}
      <ChannelHeader
        channelId={channelId}
        accountId={accountId}
        onOpenAi={() => setShowAiModal(true)}
        onOpenConversations={() => setShowConvModal(true)}
        onSearch={(q) => setSearchQuery(q)}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Lista de mensagens */}
          <div ref={scrollRef} style={{ flex: 1, overflow: "hidden" }}>
            <MessageList
              messages={messages}
              isLoading={isLoading}
              currentUserId={account?.user_id ?? ""}
              onLoadMore={handleLoadMore}
              onReply={setReplyingTo}
              channels={cache.channels[activeGuildId ?? ""] ?? []}
            />
          </div>

          <TypingIndicator channelId={channelId} />

          {/* Input */}
          <MessageInput
            channelId={channelId}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onSend={handleSend}
            accountColor={account?.color}
          />
        </div>

        {searchQuery !== null && (
          <SearchResultsSidebar
            accountId={accountId}
            guildId={activeGuildId ?? undefined}
            channelId={channelId}
            query={searchQuery}
            onClose={() => setSearchQuery(null)}
            onSearch={setSearchQuery}
          />
        )}
      </div>

      {showAiModal && <AiConfigModal onClose={() => setShowAiModal(false)} />}
      {showConvModal && <AiConversationModal onClose={() => setShowConvModal(false)} />}
    </div>
  );
}

function ChannelHeader({
  channelId,
  accountId,
  onOpenAi,
  onOpenConversations,
  onSearch,
}: {
  channelId: string;
  accountId: string;
  onOpenAi: () => void;
  onOpenConversations: () => void;
  onSearch: (q: string) => void;
}) {
  const { cache } = useDiscordStore();
  const { activeGuildId } = useNavigationStore();
  const { rules, addRule, toggleRule } = useAiStore();
  const { conversations, runtimeStatus } = useAiConversationStore();
  const { stealthMode } = useAccountStore();
  const { joinCall, leaveCall, isConnecting, isConnected } = useVoiceStore();

  const channels = activeGuildId ? (cache.channels[activeGuildId] ?? []) : [];
  const channel = channels.find((c) => c.id === channelId);
  
  const isThread = !channel && activeGuildId && cache.threads[activeGuildId]?.some(t => t.id === channelId);
  const threadObj = isThread ? cache.threads[activeGuildId]?.find(t => t.id === channelId) : null;

  const runningConvsInChannel = conversations.filter(
    (c) => c.channel_id === channelId && runtimeStatus[c.id] === "running"
  ).length;

  const activeRule = rules.find(
    (r) => r.account_id === accountId && r.channel_id === channelId && r.enabled
  );
  const anyRule = rules.find(
    (r) => r.account_id === accountId && r.channel_id === channelId
  );

  const handleQuickToggleAi = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!anyRule) {
      // Create a quick rule with global config or defaults
      const globalConfig = useAiStore.getState().globalConfig;
      addRule({
        id: crypto.randomUUID(),
        account_id: accountId,
        channel_id: channelId,
        guild_id: activeGuildId ?? null,
        enabled: true,
        config: globalConfig ?? makeDefaultConfig("openrouter"),
        trigger_prefix: null,
        reply_delay_ms: 1500,
      });
    } else {
      toggleRule(anyRule.id);
    }
  };

  return (
    <div
      style={{
        height: 48,
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
      }}
    >
      {/* Header do Chat */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isThread && threadObj ? (
          <>
            <button
              onClick={() => useNavigationStore.getState().setActiveChannel(threadObj.parent_id)}
              title="Voltar para o Fórum"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "4px",
                borderRadius: "var(--radius-sm)",
                transition: "background 150ms",
              }}
              className="hover-bg-modifier-selected"
            >
              <ArrowLeft size={18} />
            </button>
            <MessagesSquare size={20} color="var(--channel-icon)" />
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-normal)", margin: 0 }}>
              {threadObj.name}
            </h2>
          </>
        ) : channel ? (
          <>
            <span style={{ color: "var(--channel-icon)", display: "flex", alignItems: "center" }}>
              {getHeaderIcon(channel.channel_type)}
            </span>
            <span style={{ fontWeight: 700, color: "var(--text-normal)", fontSize: 16 }}>
              {channel.name}
            </span>
            {channel.topic && (
              <>
                <div style={{ width: 1, height: 20, background: "var(--interactive-muted)", margin: "0 4px" }} />
                <span style={{ fontSize: 14, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 300 }}>
                  {channel.topic}
                </span>
              </>
            )}
          </>
        ) : (
          <>
            <span style={{ color: "var(--channel-icon)", display: "flex", alignItems: "center" }}>
              <Hash size={20} />
            </span>
            <span style={{ fontWeight: 700, color: "var(--text-normal)", fontSize: 16 }}>
              Carregando...
            </span>
          </>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Ícones da Direita (estilo Discord) */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, color: "var(--interactive-normal)" }}>
        <button
          onClick={() => {
            if (isConnected || isConnecting) {
              leaveCall();
            } else {
              joinCall(accountId, activeGuildId ?? null, channelId);
            }
          }}
          disabled={isConnecting}
          title={isConnected ? "Desligar chamada" : "Iniciar chamada de voz"}
          className="header-icon-button"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isConnected ? "var(--status-online)" : "inherit",
            opacity: isConnecting ? 0.5 : 1,
            padding: 0,
            transition: "color 0.2s",
          }}
        >
          <Phone size={24} strokeWidth={2} fill={isConnected ? "currentColor" : "none"} />
        </button>

        <button
          title="Iniciar chamada de vídeo"
          className="header-icon-button"
          style={{
            background: "transparent",
            border: "none",
            cursor: "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "inherit",
            padding: 0,
            opacity: 0.5,
          }}
        >
          <Video size={24} strokeWidth={2} />
        </button>

        <PinnedMessagesPopover channels={channels} />

        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--bg-tertiary)",
            borderRadius: "var(--radius-sm)",
            padding: "4px 8px",
            width: 160,
            gap: 6,
          }}
        >
          <input
            placeholder="Buscar..."
            onKeyDown={(e) => {
               if (e.key === "Enter" && e.currentTarget.value) {
                 onSearch(e.currentTarget.value);
               }
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-normal)",
              outline: "none",
              width: "100%",
              fontSize: 13,
            }}
          />
          <Search size={14} color="var(--text-muted)" />
        </div>

        {!stealthMode && (<>
          {/* AI quick-toggle button */}
        <button
          onClick={handleQuickToggleAi}
          title={activeRule ? "IA ativa neste canal — clique para pausar" : "Ativar IA neste canal"}
          style={{
            background: activeRule ? "rgba(88,101,242,0.2)" : "transparent",
            border: `1px solid ${activeRule ? "var(--brand-500)" : "var(--border-subtle)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 13,
            color: activeRule ? "var(--brand-500)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontWeight: activeRule ? 600 : 400,
            transition: "all 120ms",
          }}
        >
          <Bot size={14} />
          <span>{activeRule ? "IA ativa" : "IA"}</span>
        </button>

        {/* AI conversations button */}
        <button
          onClick={onOpenConversations}
          title="Conversas entre IAs"
          style={{
            background: runningConvsInChannel > 0 ? "rgba(59,165,93,0.15)" : "transparent",
            border: `1px solid ${runningConvsInChannel > 0 ? "var(--status-online)" : "var(--border-subtle)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 13,
            color: runningConvsInChannel > 0 ? "var(--status-online)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontWeight: runningConvsInChannel > 0 ? 600 : 400,
            transition: "all 120ms",
          }}
        >
          <Conversations size={14} />
          <span>{runningConvsInChannel > 0 ? `${runningConvsInChannel} conversa${runningConvsInChannel > 1 ? "s" : ""}` : "Conversas"}</span>
        </button>

        {/* AI settings button */}
        <button
          onClick={onOpenAi}
          title="Configurações de IA"
          className="hover-border-muted hover-color-normal"
          style={{
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "4px 8px",
            cursor: "pointer",
            fontSize: 14,
            color: "var(--text-muted)",
            transition: "all 120ms",
          }}
        >
          <Settings size={14} />
        </button>
      </>)}
      </div>
    </div>
  );
}
