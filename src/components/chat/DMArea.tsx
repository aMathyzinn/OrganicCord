import { useEffect, useState, useCallback, useRef } from "react";
import { useDiscordStore } from "@/stores/discordStore";
import { useAccountStore } from "@/stores/accountStore";
import { MessageList } from "./MessageList";
import { MessageInput, AttachmentData } from "./MessageInput";
import { Avatar } from "@/components/ui/Avatar";
import type { DiscordMessage } from "@/types";
import { ActiveCallArea } from "./ActiveCallArea";
import { Phone, Video, Search } from "lucide-react";
import { useVoiceStore } from "@/stores/voiceStore";
import { PinnedMessagesPopover } from "./PinnedMessagesPopover";
import { SearchResultsSidebar } from "./SearchResultsSidebar";
import { TypingIndicator } from "./TypingIndicator";
import { ChatDropOverlay } from "./ChatDropOverlay";
import { toast } from "@/components/ui/Toast";
import { getMessages } from "@/lib/tauri";

interface Props {
  channelId: string;
  accountId: string;
}

export function DMArea({ channelId, accountId }: Props) {
  const { cache, loading, fetchMessages, fetchMoreMessages, sendMessage, fetchDMs, deleteMessage } =
    useDiscordStore();
  const { accounts } = useAccountStore();
  const { joinCall, leaveCall, isConnecting, isConnected, channelId: voiceChannelId } = useVoiceStore();
  const [replyingTo, setReplyingTo] = useState<DiscordMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<AttachmentData | null>(null);
  const dragCounterRef = useRef(0);

  const messages = cache.messages[channelId] ?? [];
  const isLoading = loading.messages[channelId];
  const account = accounts.find((a) => a.id === accountId);

  const dms = cache.dms[accountId] ?? [];
  const dm = dms.find((d) => d.id === channelId);
  const recipient = dm?.recipients?.[0];
  const targetName = recipient?.global_name || recipient?.username || "DM";


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
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

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

  // Initial load
  useEffect(() => {
    if (!cache.messages[channelId]) fetchMessages(accountId, channelId);
    if (!cache.dms[accountId]) fetchDMs(accountId);
    useDiscordStore.getState().clearUnread(accountId, channelId);
    setSearchQuery(null);
    setPendingAttachment(null);
  }, [channelId, accountId]);

  // Polling de contingência para recuperar eventos perdidos durante reconexões.
  useEffect(() => {
    const poll = async () => {
      const existing = useDiscordStore.getState().cache.messages[channelId];
      const newestReal = existing?.find((m) => !m.id.startsWith("local-"));
      if (!newestReal) return;
      try {
        const fresh = await getMessages(accountId, channelId, undefined, newestReal.id);
        if (fresh.length === 0) return;

        useDiscordStore.setState((s) => {
          const cur = s.cache.messages[channelId] ?? [];
          const realIds = new Set(cur.filter((m) => !m.id.startsWith("local-")).map((m) => m.id));
          const toAdd = fresh.filter((m) => !realIds.has(m.id));
          if (toAdd.length === 0) return s;

          const freshFingerprints = new Set(fresh.map((m) => `${m.author.id}:${m.content.trim()}`));
          const dedupedCur = cur.filter(
            (m) => !m.id.startsWith("local-") || !freshFingerprints.has(`${m.author.id}:${m.content.trim()}`)
          );
          const sorted = [...toAdd].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
          return { cache: { ...s.cache, messages: { ...s.cache.messages, [channelId]: [...sorted, ...dedupedCur] } } };
        });
      } catch (e) {
        console.warn("[DM poll] erro:", e);
      }
    };

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [channelId, accountId]);

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

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-primary)", position: "relative" }}
    >
      <ChatDropOverlay
        isDragging={isDragging}
        canUpload={true}
        targetName={targetName}
      />
      {/* Header */}
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
        {recipient && (
          <>
            <Avatar userId={recipient.id} avatarHash={recipient.avatar} avatarDecoration={recipient.avatar_decoration_data} username={recipient.username} size={32} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {recipient.global_name ?? recipient.username}
            </span>
            {recipient.bot && (
              <span style={{ fontSize: 10, fontWeight: 700, background: "var(--brand-500)", color: "#fff", padding: "1px 5px", borderRadius: "var(--radius-xs)" }}>
                BOT
              </span>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Ícones da Direita (estilo Discord) */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: "var(--interactive-normal)" }}>
          <button
            onClick={() => {
              if (isConnected || isConnecting) {
                leaveCall();
              } else {
                joinCall(accountId, null, channelId);
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

          <PinnedMessagesPopover channels={[]} />

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
                   setSearchQuery(e.currentTarget.value);
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

      {/* Messages / Call Area */}
      {(isConnected || isConnecting) && channelId === voiceChannelId && recipient && (
        <ActiveCallArea recipient={recipient} />
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <MessageList
              messages={messages}
              isLoading={isLoading}
              currentUserId={account?.user_id ?? ""}
              onLoadMore={() => fetchMoreMessages(accountId, channelId)}
              onReply={setReplyingTo}
              onDelete={(messageId) => deleteMessage(accountId, channelId, messageId)}
            />
          </div>

          <TypingIndicator channelId={channelId} />

          <MessageInput
            channelId={channelId}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onSend={handleSend}
            accountColor={account?.color}
            externalAttachment={pendingAttachment}
          />
        </div>

        {searchQuery !== null && (
          <SearchResultsSidebar
            accountId={accountId}
            channelId={channelId}
            query={searchQuery}
            onClose={() => setSearchQuery(null)}
            onSearch={setSearchQuery}
          />
        )}
      </div>

    </div>
  );
}
