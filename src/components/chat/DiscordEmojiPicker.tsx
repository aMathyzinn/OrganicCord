import React, { useState, useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useDiscordStore } from '@/stores/discordStore';
import { OrganicMark } from '@/components/ui/OrganicMark';
import { getGuildIconUrl } from '@/lib/utils';
import { Search } from 'lucide-react';

interface Props {
  accountId: string;
  onSelect: (emojiStr: string) => void;
  children?: React.ReactNode;
}

export function DiscordEmojiPicker({ accountId, onSelect, children }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  const guildEmojisRaw = useDiscordStore((s) => s.cache.guildEmojis[accountId] || {});
  const guilds = useDiscordStore((s) => s.cache.guilds[accountId] || []);

  const guildList = useMemo(() => {
    console.log("[DiscordEmojiPicker] guildEmojisRaw keys:", Object.keys(guildEmojisRaw));
    return Object.keys(guildEmojisRaw).map(guildId => {
      const guild = guilds.find(g => g.id === guildId);
      const emojis = guildEmojisRaw[guildId] || [];
      const filtered = emojis.filter(e => {
        if (!e.names || !e.names[0]) return false;
        return e.names[0].toLowerCase().includes(search.toLowerCase());
      });
      return {
        id: guildId,
        name: guild ? guild.name : "Desconhecido",
        icon: guild ? getGuildIconUrl(guild.id, guild.icon, 32) : null,
        emojis: filtered
      };
    }).filter(g => g.emojis.length > 0);
  }, [guildEmojisRaw, guilds, search]);

  console.log("[DiscordEmojiPicker] render:", { 
    accountId, 
    guildsCount: guilds.length, 
    emojisCount: Object.keys(guildEmojisRaw).length,
    guildListCount: guildList.length 
  });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {children || (
          <button
            title="Emojis do Servidor"
            style={{
              background: "transparent",
              border: "none",
              borderRadius: "50%",
              width: 32,
              height: 32,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
              flexShrink: 0,
              color: "var(--text-muted)",
              transition: "color 150ms",
            }}
            className="hover-color-normal"
          >
            <OrganicMark size={20} />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="end" sideOffset={10} style={{ zIndex: 100 }}>
          <div style={{
            width: 320,
            height: 400,
            background: "var(--bg-floating)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 8px 16px rgba(0,0,0,0.24)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}>
            {/* Search Header */}
            <div style={{ padding: "12px 12px 8px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                background: "var(--bg-tertiary)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 8px",
                gap: 8
              }}>
                <Search size={14} color="var(--text-muted)" />
                <input 
                  type="text" 
                  placeholder="Pesquisar emoji do servidor..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text-normal)",
                    fontSize: 14,
                    width: "100%"
                  }}
                />
              </div>
            </div>

            {/* Emoji Grid */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
              {guildList.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, marginTop: 40 }}>
                  Nenhum emoji encontrado.<br/><br/>
                  <span style={{ fontSize: 10, opacity: 0.5 }}>
                    Debug: {Object.keys(guildEmojisRaw).length} guilds in cache<br/>
                    {guilds.length} guilds total
                  </span>
                </div>
              ) : (
                guildList.map(g => (
                  <div key={g.id} style={{ marginBottom: 16 }}>
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 8, 
                      marginBottom: 8, 
                      color: "var(--text-muted)", 
                      fontSize: 12, 
                      fontWeight: 700, 
                      textTransform: "uppercase" 
                    }}>
                      {g.icon && <img src={g.icon} alt="" style={{ width: 16, height: 16, borderRadius: "50%" }} />}
                      {g.name}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                      {g.emojis.map((e: any) => (
                        <button 
                          key={e.id} 
                          onClick={() => {
                            const isAnimated = e.imgUrl.includes(".gif");
                            onSelect(`<${isAnimated ? "a" : ""}:${e.names[0]}:${e.id}>`);
                            setOpen(false);
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 4,
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          className="hover-bg-modifier"
                          title={`:${e.names[0]}:`}
                        >
                          <img src={e.imgUrl} alt={e.names[0]} style={{ width: 32, height: 32, objectFit: "contain" }} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
