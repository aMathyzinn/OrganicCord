import { useEffect, useRef, useState, useCallback } from "react";
import { useDiscordStore } from "@/stores/discordStore";
import { useAccountStore } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { MessageList } from "./MessageList";
import { MessageInput, AttachmentData } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";
import { PinnedMessagesPopover } from "./PinnedMessagesPopover";
import { SearchResultsSidebar } from "./SearchResultsSidebar";
import type { DiscordMessage, ChannelType, DiscordChannel } from "@/types";
import { Volume2, Drama, Megaphone, MessagesSquare, Hash, ArrowLeft, Phone, Video, Search, Ban, Lock } from "lucide-react";
import { useVoiceStore } from "@/stores/voiceStore";
import { ChatDropOverlay } from "./ChatDropOverlay";
import { getChannelPermissions } from "@/lib/permissions";
import { toast } from "@/components/ui/Toast";
import { AppConfirmDialog } from "@/components/ui/AppDialog";
import { getMessages } from "@/lib/tauri";

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
  const { cache, loading, fetchMessages, fetchMoreMessages, sendMessage, deleteMessage } =
    useDiscordStore();
  const { accounts } = useAccountStore();
  const { activeGuildId } = useNavigationStore();
  const [replyingTo, setReplyingTo] = useState<DiscordMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<AttachmentData | null>(null);
  const [unblockTarget, setUnblockTarget] = useState<{ id: string; name: string } | null>(null);
  const dragCounterRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevChannelRef = useRef<string | null>(null);

  const messages = cache.messages[channelId] ?? [];
  const isLoading = loading.messages[channelId];
  const account = accounts.find((a) => a.id === accountId);

  const guilds = cache.guilds[accountId] ?? [];
  const channels = activeGuildId ? (cache.channels[accountId]?.[activeGuildId] ?? []) : [];
  const channel = channels.find((c) => c.id === channelId);
  const threads = activeGuildId ? (cache.threads[activeGuildId] ?? []) : [];
  const isThread = Boolean(!channel && activeGuildId && threads.some((t: DiscordChannel) => t.id === channelId));
  const threadObj = isThread ? threads.find((t: DiscordChannel) => t.id === channelId) : null;
  const targetName = channel?.name || threadObj?.name || "canal";
  const permissionChannel = isThread
    ? channels.find((item) => item.id === threadObj?.parent_id)
    : channel;
  const currentMember = activeGuildId
    ? cache.guildMembers[accountId]?.[activeGuildId]
    : undefined;

  const perms = getChannelPermissions(activeGuildId, guilds, isThread, {
    channel: permissionChannel,
    memberRoleIds: currentMember?.roles,
    currentUserId: account?.user_id,
  });
  const canView = perms.canView;
  const canSend = perms.canSend;
  const canUpload = perms.canAttach;

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = canUpload ? "copy" : "none";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    if (!canUpload) {
      toast.error("Você não tem permissão para enviar arquivos neste canal.");
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.size > 25 * 1024 * 1024) {
        toast.error("Arquivo maior que 25MB. Por favor use arquivos menores.");
        return;
      }
      setPendingAttachment({ type: "file", file });
      toast.success(`Arquivo "${file.name}" pronto para envio!`);
    }
  };

  // Carrega mensagens quando o canal muda (sempre busca fresh ao trocar de canal)
  useEffect(() => {
    prevChannelRef.current = channelId;
    setPendingAttachment(null);
    fetchMessages(accountId, channelId).then(() => {
      const msgs = useDiscordStore.getState().cache.messages[channelId];
      const newestReal = msgs?.find(m => !m.id.startsWith("local-"));
      if (newestReal) {
        useDiscordStore.getState().clearUnread(accountId, channelId, newestReal.id);
      } else {
        useDiscordStore.getState().clearUnread(accountId, channelId);
      }
    });
  }, [channelId, accountId]);

  // Polling: busca só mensagens mais novas que a última do cache (via after=<id>)
  useEffect(() => {
    const poll = async () => {
      const existing = useDiscordStore.getState().cache.messages[channelId];
      // Find the newest real (non-local) message to use as `after` cursor
      const newestReal = existing?.find((m) => !m.id.startsWith("local-"));
      if (!newestReal) return;
      try {
        const fresh = await getMessages(accountId, channelId, undefined, newestReal.id);
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
        
        const sortedAdded = fresh.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
        if (sortedAdded.length > 0 && document.hasFocus()) {
          useDiscordStore.getState().clearUnread(accountId, channelId, sortedAdded[0].id);
        }
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
    const finalAttachment = attachment ?? pendingAttachment;
    try {
      if (finalAttachment) {
        if (finalAttachment.type === "file") {
          const buffer = await finalAttachment.file.arrayBuffer();
          const data = new Uint8Array(buffer);
          await useDiscordStore.getState().sendMessageWithAttachment(
            accountId,
            channelId,
            content,
            replyingTo?.id,
            finalAttachment.file.name,
            undefined,
            data
          );
        } else if (finalAttachment.type === "handle") {
          await useDiscordStore.getState().sendMessageWithAttachment(
            accountId,
            channelId,
            content,
            replyingTo?.id,
            finalAttachment.name,
            finalAttachment.handle,
            undefined
          );
        }
      } else {
        await sendMessage(accountId, channelId, content, replyingTo?.id);
      }
      setReplyingTo(null);
      setPendingAttachment(null);
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  }, [accountId, channelId, replyingTo, sendMessage, pendingAttachment]);

  const handleLoadMore = useCallback(() => {
    fetchMoreMessages(accountId, channelId);
  }, [accountId, channelId]);

  if (!canView) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-primary)" }}>
        <ChannelHeader
          channelId={channelId}
          accountId={accountId}
          onSearch={(q) => setSearchQuery(q)}
        />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 16, textAlign: "center" }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 22,
              background: "rgba(242, 63, 67, 0.12)",
              border: "1px solid rgba(242, 63, 67, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(242, 63, 67, 0.15)",
            }}
          >
            <Lock size={34} color="var(--status-dnd)" />
          </div>
          <div style={{ maxWidth: 380 }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)", margin: "0 0 8px" }}>
              Canal Privado
            </h3>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0, lineHeight: 1.55 }}>
              Você não possui a permissão necessária (<strong>VIEW_CHANNEL</strong>) para visualizar as mensagens de <strong style={{ color: "#fff" }}>#{targetName}</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
        position: "relative",
      }}
    >
      <ChatDropOverlay
        isDragging={isDragging}
        canUpload={canUpload}
        targetName={targetName}
      />

      {/* Header do canal */}
      <ChannelHeader
        channelId={channelId}
        accountId={accountId}
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
              onDelete={(messageId) => deleteMessage(accountId, channelId, messageId)}
              channels={activeGuildId ? (cache.channels[accountId]?.[activeGuildId] ?? []) : []}
            />
          </div>

          <TypingIndicator channelId={channelId} />

          {/* Input ou Banners de Bloqueio / Leitura Apenas */}
          {(() => {
            const dms = cache.dms[accountId] ?? [];
            const dmObj = dms.find((d) => d.id === channelId);
            const dmRecipient = dmObj?.recipients?.[0];
            const isRecipientBlocked = dmRecipient
              ? cache.relationships[accountId]?.some((r) => r.user.id === dmRecipient.id && r.relationship_type === 2)
              : false;

            if (isRecipientBlocked) {
              return (
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    margin: "0 16px 24px",
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: "var(--text-muted)" }}>
                    <Ban size={20} color="var(--status-dnd)" />
                    <span>Você não pode enviar mensagens para um usuário que bloqueou.</span>
                  </div>
                  <button
                    onClick={() => dmRecipient && setUnblockTarget({
                      id: dmRecipient.id,
                      name: dmRecipient.global_name || dmRecipient.username,
                    })}
                    style={{
                      background: "var(--brand-500)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Desbloquear
                  </button>
                </div>
              );
            }

            if (!canSend) {
              return (
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    margin: "0 16px 24px",
                    padding: "14px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "rgba(242, 63, 67, 0.12)",
                      border: "1px solid rgba(242, 63, 67, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Lock size={18} color="var(--status-dnd)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-normal)" }}>
                      Você não tem permissão para enviar mensagens neste canal.
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      Este canal é somente para leitura ou você não possui a permissão de envio (SEND_MESSAGES).
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <MessageInput
                channelId={channelId}
                replyingTo={replyingTo}
                onCancelReply={() => setReplyingTo(null)}
                onSend={handleSend}
                accountColor={account?.color}
                externalAttachment={pendingAttachment}
                canAttach={canUpload}
              />
            );
          })()}
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

    </div>
    <AppConfirmDialog
      open={unblockTarget !== null}
      onOpenChange={(open) => !open && setUnblockTarget(null)}
      title="Desbloquear usuário?"
      description={unblockTarget ? `Você voltará a receber mensagens de ${unblockTarget.name}.` : ""}
      confirmLabel="Desbloquear"
      onConfirm={async () => {
        if (!unblockTarget) return;
        await useDiscordStore.getState().unblockUser(accountId, unblockTarget.id);
        toast.success("Usuário desbloqueado!");
      }}
    />
    </>
  );
}

function ChannelHeader({
  channelId,
  accountId,
  onSearch,
}: {
  channelId: string;
  accountId: string;
  onSearch: (q: string) => void;
}) {
  const { cache } = useDiscordStore();
  const { activeGuildId } = useNavigationStore();
  const { joinCall, leaveCall, isConnecting, isConnected } = useVoiceStore();

  const channels = activeGuildId ? (cache.channels[accountId]?.[activeGuildId] ?? []) : [];
  const channel = channels.find((c) => c.id === channelId);
  
  const isThread = !channel && activeGuildId && cache.threads[activeGuildId]?.some(t => t.id === channelId);
  const threadObj = isThread ? cache.threads[activeGuildId]?.find(t => t.id === channelId) : null;

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

      </div>
    </div>
  );
}
