import { useState, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Pin } from "lucide-react";
import { useDiscordStore } from "@/stores/discordStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { MessageContent } from "./MessageContent";
import { Avatar } from "@/components/ui/Avatar";
import { formatTimestamp, getDisplayName } from "@/lib/utils";
import type { DiscordChannel } from "@/types";

export function PinnedMessagesPopover({ channels }: { channels?: DiscordChannel[] }) {
  const [open, setOpen] = useState(false);
  const { activeAccountId, activeChannelId } = useNavigationStore();
  const { cache, fetchPinnedMessages, unpinMessage } = useDiscordStore();

  useEffect(() => {
    if (open && activeAccountId && activeChannelId) {
      fetchPinnedMessages(activeAccountId, activeChannelId);
    }
  }, [open, activeAccountId, activeChannelId, fetchPinnedMessages]);

  const pins = activeChannelId ? cache.pinnedMessages[activeChannelId] || [] : [];

  const handleUnpin = (messageId: string) => {
    if (activeAccountId && activeChannelId) {
      unpinMessage(activeAccountId, activeChannelId, messageId);
      // Opcional: remover da UI instantaneamente para melhor UX
      useDiscordStore.setState((s) => {
        if (s.cache.pinnedMessages[activeChannelId]) {
          s.cache.pinnedMessages[activeChannelId] = s.cache.pinnedMessages[activeChannelId].filter(m => m.id !== messageId);
        }
      });
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="hover-bg-accent"
          style={{
            background: "transparent",
            border: "none",
            color: open ? "var(--text-normal)" : "var(--interactive-normal)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: "var(--radius-sm)",
            transition: "color 0.2s, background 0.2s",
          }}
          title="Mensagens Fixadas"
        >
          <Pin size={20} />
        </button>
      </Popover.Trigger>
      
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="end"
          style={{
            width: 420,
            maxHeight: 500,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 100,
            animation: "fadeIn 150ms ease-out",
          }}
        >
          <div style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600, color: "var(--text-normal)" }}>
            Mensagens Fixadas
          </div>
          
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {pins.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px 0" }}>
                Nenhuma mensagem fixada neste canal.
              </div>
            ) : (
              pins.map((msg) => (
                <div key={msg.id} style={{ background: "var(--bg-primary)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Avatar
                        userId={msg.author.id}
                        avatarHash={msg.author.avatar}
                        username={msg.author.username}
                        size={32}
                      />
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14, color: "var(--text-normal)" }}>
                          {getDisplayName(msg.author)}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {formatTimestamp(msg.timestamp)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnpin(msg.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      className="hover-color-normal"
                      title="Desfixar"
                    >
                      <Pin size={14} style={{ transform: "rotate(45deg)" }} />
                    </button>
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-normal)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    <MessageContent content={msg.content} channels={channels || []} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
