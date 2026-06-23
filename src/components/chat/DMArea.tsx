import { useEffect, useState, useCallback, useRef } from "react";
import { useDiscordStore } from "@/stores/discordStore";
import { useAccountStore } from "@/stores/accountStore";
import { useAiStore, makeDefaultConfig } from "@/stores/aiStore";
import type { DmAiRule } from "@/stores/aiStore";
import { MessageList } from "./MessageList";
import { MessageInput, AttachmentData } from "./MessageInput";
import { Avatar } from "@/components/ui/Avatar";
import type { DiscordMessage } from "@/types";
import type { AiConfig, AiProvider } from "@/stores/aiStore";
import { DmAiFeature, processFreshMessagesForDmAi } from "@/components/ai/DmAiFeature";
import * as api from "@/lib/tauri";
import { ActiveCallArea } from "./ActiveCallArea";
import { Bot, X, Phone, Video, Pin, Search } from "lucide-react";
import { useVoiceStore } from "@/stores/voiceStore";
import { PinnedMessagesPopover } from "./PinnedMessagesPopover";
import { SearchResultsSidebar } from "./SearchResultsSidebar";
import { TypingIndicator } from "./TypingIndicator";

interface Props {
  channelId: string;
  accountId: string;
}

export function DMArea({ channelId, accountId }: Props) {
  const { cache, loading, fetchMessages, fetchMoreMessages, sendMessage, fetchDMs } =
    useDiscordStore();
  const { accounts } = useAccountStore();
  const { dmRules } = useAiStore();
  const { joinCall, leaveCall, isConnecting, isConnected, channelId: voiceChannelId } = useVoiceStore();
  const [replyingTo, setReplyingTo] = useState<DiscordMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const seenDmIds = useRef<Set<string>>(new Set());

  const messages = cache.messages[channelId] ?? [];
  const isLoading = loading.messages[channelId];
  const account = accounts.find((a) => a.id === accountId);

  const dms = cache.dms[accountId] ?? [];
  const dm = dms.find((d) => d.id === channelId);
  const recipient = dm?.recipients[0];

  const dmRule = dmRules.find((r: any) => r.account_id === accountId);

  // Initial load
  useEffect(() => {
    if (!cache.messages[channelId]) fetchMessages(accountId, channelId);
    if (!cache.dms[accountId]) fetchDMs(accountId);
    useDiscordStore.getState().clearUnread(accountId, channelId);
    setSearchQuery(null);
  }, [channelId, accountId]);

  // Seed seenDmIds with already loaded messages so we don't reply to old ones
  useEffect(() => {
    const msgs = cache.messages[channelId] ?? [];
    for (const m of msgs) seenDmIds.current.add(m.id);
  }, [channelId]);

  // Polling: fetch new messages via `after` cursor, trigger DM AI reply on new ones
  useEffect(() => {
    const poll = async () => {
      const existing = useDiscordStore.getState().cache.messages[channelId];
      const newestReal = existing?.find((m) => !m.id.startsWith("local-"));
      if (!newestReal) return;

      let fresh: DiscordMessage[];
      try {
        fresh = await api.getMessages(accountId, channelId, undefined, newestReal.id);
      } catch {
        return;
      }
      if (fresh.length === 0) return;

      useDiscordStore.setState((s) => {
        const cur = s.cache.messages[channelId] ?? [];
        const realIds = new Set(cur.filter((m) => !m.id.startsWith("local-")).map((m) => m.id));
        const toAdd = fresh.filter((m) => !realIds.has(m.id));
        if (toAdd.length === 0) return s;
        const freshFps = new Set(fresh.map((m) => `${m.author.id}:${m.content.trim()}`));
        const deduped = cur.filter(
          (m) => !m.id.startsWith("local-") || !freshFps.has(`${m.author.id}:${m.content.trim()}`)
        );
        const sorted = [...toAdd].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
        return { cache: { ...s.cache, messages: { ...s.cache.messages, [channelId]: [...sorted, ...deduped] } } };
      });

      // Trigger DM AI reply for new messages not from this account
      processFreshMessagesForDmAi(accountId, channelId, account?.user_id, fresh, seenDmIds.current);
    };

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [channelId, accountId, account?.user_id]);

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

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-primary)" }}>
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

          {/* DM AI toggle */}
          <DmAiFeature accountId={accountId} />
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
            />
          </div>

          <TypingIndicator channelId={channelId} />

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
