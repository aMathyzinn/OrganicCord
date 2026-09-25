import React, { useState, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Inbox, Bell, AtSign, Loader2 } from "lucide-react";
import { useNavigationStore } from "@/stores/navigationStore";
import { getRecentMentions } from "@/lib/tauri";
import { Avatar } from "@/components/ui/Avatar";
import { DiscordText } from "@/components/ui/DiscordText";
import type { DiscordMessage } from "@/types";

export function InboxPopover() {
  const { activeAccountId, setActiveGuild, setActiveChannel, setView } = useNavigationStore();
  
  const [open, setOpen] = useState(false);
  const [mentions, setMentions] = useState<DiscordMessage[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (open && activeAccountId) {
      setLoading(true);
      getRecentMentions(activeAccountId)
        .then((msgs) => setMentions(msgs))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [open, activeAccountId]);

  const hasMentions = mentions.length > 0;
  const totalMentions = mentions.length; // Count of fetched unread mentions

  const handleGoToChannel = (channelId: string, guildId?: string) => {
    if (guildId) {
      setView("guilds");
      setActiveGuild(guildId);
      setActiveChannel(channelId);
    } else {
      setView("dms");
      setActiveChannel(channelId);
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
            color: "var(--interactive-normal)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            position: "relative",
            width: 24,
            height: 24,
            borderRadius: 4,
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
        >
          <Inbox size={20} />
          {totalMentions > 0 && (
            <div
              style={{
                position: "absolute",
                bottom: -4,
                right: -4,
                background: "var(--status-dnd)",
                color: "white",
                fontSize: 10,
                fontWeight: 800,
                padding: "2px 4px",
                borderRadius: "12px",
                border: "2px solid var(--bg-float)",
                lineHeight: 1,
              }}
            >
              {totalMentions > 99 ? "99+" : totalMentions}
            </div>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          style={{
            width: 400,
            maxHeight: 500,
            backgroundColor: "var(--bg-floating)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--elevation-high)",
            border: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 100,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-secondary)",
            }}
          >
            <Inbox size={20} color="var(--text-normal)" />
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-normal)" }}>
              Caixa de Entrada
            </span>
          </div>

          {/* Tabs (Simulated) */}
          <div
            style={{
              display: "flex",
              padding: "0 16px",
              borderBottom: "1px solid var(--border-subtle)",
              background: "var(--bg-secondary)",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "2px solid var(--interactive-active)",
                color: "var(--interactive-active)",
                fontWeight: 600,
                fontSize: 14,
                cursor: "default",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <AtSign size={16} /> Menções
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 8px" }}>
            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                <Loader2 className="spin" size={32} color="var(--brand-500)" />
              </div>
            ) : !hasMentions ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px 16px",
                  color: "var(--text-muted)",
                  textAlign: "center",
                  gap: 16,
                }}
              >
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bell size={40} color="var(--text-muted)" opacity={0.5} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-normal)", marginBottom: 8 }}>
                    Você não tem menções recentes
                  </h3>
                  <p style={{ fontSize: 14, lineHeight: 1.4 }}>
                    Quando alguém mencionar você, a mensagem aparecerá aqui.
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {mentions.map((msg) => {
                  return (
                    <div
                      key={msg.id}
                      className="hover-bg-accent"
                      style={{
                        padding: 12,
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        position: "relative",
                      }}
                      onClick={() => {
                        if (msg.channel_id) handleGoToChannel(msg.channel_id, msg.guild_id);
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar
                           userId={msg.author.id}
                           username={msg.author.username}
                           avatarHash={msg.author.avatar}
                           size={32}
                        />
                        <div style={{ flex: 1 }}>
                           <span style={{ fontWeight: 600, color: "var(--text-normal)", fontSize: 14 }}>
                             {msg.author.global_name || msg.author.username}
                           </span>
                           <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
                             {new Date(msg.timestamp).toLocaleString()}
                           </span>
                        </div>
                      </div>
                      <div style={{ background: "var(--bg-secondary)", padding: 8, borderRadius: "var(--radius-sm)", fontSize: 14, color: "var(--text-normal)", overflowWrap: "break-word" }}>
                         <DiscordText content={msg.content} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
