import { useState, useEffect } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { useAiConversationStore } from "@/stores/aiConversationStore";
import { useAccountStore } from "@/stores/accountStore";
import { useArchiveStore } from "@/stores/archiveStore";
import { AccountSwitcher } from "@/components/sidebar/AccountSwitcher";
import { GuildSidebar } from "@/components/sidebar/GuildSidebar";
import { ChannelSidebar } from "@/components/sidebar/ChannelSidebar";
import { ChatArea } from "@/components/chat/ChatArea";
import { DMArea } from "@/components/chat/DMArea";
import { WelcomePlaceholder } from "@/components/chat/WelcomePlaceholder";
import { FriendsArea } from "@/components/friends/FriendsArea";
import { ForumArea } from "@/components/chat/ForumArea";
import { AiConversationPanel } from "@/components/ai/AiConversationPanel";
import { SettingsOverlay } from "@/components/settings/SettingsOverlay";
import { Avatar } from "@/components/ui/Avatar";
import { UserContextMenu } from "@/components/ui/UserContextMenu";
import { Search, X, Gamepad2, Archive } from "lucide-react";
import type { DiscordDM } from "@/types";

interface Props {
  onAddAccount: () => void;
}

export function MainLayout({ onAddAccount }: Props) {
  const { view, activeGuildId, activeChannelId, activeAccountId } = useNavigationStore();
  const { conversations, runtimeStatus } = useAiConversationStore();
  const { stealthMode } = useAccountStore();
  const { fetchDMs, cache } = useDiscordStore();

  const hasConvsInChannel = activeChannelId
    ? conversations.some((c: any) => c.channel_id === activeChannelId)
    : false;

  const activeChannel = activeGuildId && activeChannelId 
    ? cache.channels[activeGuildId]?.find(c => c.id === activeChannelId) 
    : null;
  const isForum = activeChannel?.channel_type === 15;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Coluna 1: Barra Lateral Única (72px) - Contas + Servidores */}
      <div
        style={{
          width: 72,
          background: "var(--bg-tertiary)",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--border-subtle)",
          flexShrink: 0,
          overflowY: "auto",
        }}
        className="unified-sidebar"
      >
        <AccountSwitcher onAddAccount={onAddAccount} />
        <GuildSidebar />
      </div>

      {/* Coluna 2: DM list ou Canais do Servidor (240px) */}
      {view === "dms" ? (
        <DMList accountId={activeAccountId} fetchDMs={fetchDMs} />
      ) : (
        activeGuildId && <ChannelSidebar guildId={activeGuildId} />
      )}

      {/* Coluna 3: Área principal de conteúdo */}
      <div style={{ flex: 1, overflow: "hidden", background: "var(--bg-primary)", display: "flex" }}>
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeChannelId && activeAccountId ? (
            view === "dms" ? (
              <DMArea channelId={activeChannelId} accountId={activeAccountId} />
            ) : isForum && activeGuildId ? (
              <ForumArea channelId={activeChannelId} guildId={activeGuildId} accountId={activeAccountId} />
            ) : (
              <ChatArea channelId={activeChannelId} accountId={activeAccountId} />
            )
          ) : view === "dms" ? (
            <FriendsArea />
          ) : (
            <WelcomePlaceholder />
          )}
        </div>

        {/* Coluna 4: Painel de IA */}
        {hasConvsInChannel && activeChannelId && !stealthMode && (
          <AiConversationPanel channelId={activeChannelId} />
        )}
      </div>

      <SettingsOverlay />
    </div>
  );
}

// Placeholder inline para DM list (simplificado)
function DMList({ accountId, fetchDMs }: { accountId: string | null; fetchDMs: (id: string) => void }) {
  const [search, setSearch] = useState("");
  
  // Buscar DMs sempre que o accountId mudar
  useEffect(() => {
    if (accountId) fetchDMs(accountId);
  }, [accountId, fetchDMs]);

  if (!accountId) return null;

  return (
    <div
      style={{
        width: 240,
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "16px 16px 8px",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Mensagens Diretas
      </div>

      {/* Search/filter bar */}
      <div style={{ padding: "0 8px 6px", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--bg-tertiary)",
            borderRadius: "var(--radius-sm)",
            padding: "4px 8px",
            border: "1px solid transparent",
            transition: "border-color 150ms",
          }}
          onFocusCapture={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--brand-500)";
          }}
          onBlurCapture={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "transparent";
          }}
        >
          <Search size={14} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversa"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 13,
              color: "var(--text-normal)",
              padding: "2px 0",
              minWidth: 0,
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: 0,
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <DMSidebarList accountId={accountId} searchQuery={search.trim().toLowerCase()} />
    </div>
  );
}

function DMSidebarList({ accountId, searchQuery }: { accountId: string; searchQuery: string }) {
  const { setActiveChannel, activeChannelId } = useNavigationStore();
  const { cache, closeDM } = useDiscordStore();
  const archivedDMs = useArchiveStore(state => state.archivedDMs[accountId] || []);
  const dms = cache.dms[accountId] ?? [];

  const visibleDMs = dms.filter((dm: DiscordDM) => !archivedDMs.includes(dm.id));

  const filtered = searchQuery
    ? visibleDMs.filter((dm: DiscordDM) => {
        const r = dm.recipients[0];
        if (!r) return false;
        const name = (r.global_name ?? r.username).toLowerCase();
        return name.includes(searchQuery);
      })
    : [...visibleDMs];

  filtered.sort((a, b) => {
    const idA = BigInt(a.last_message_id || "0");
    const idB = BigInt(b.last_message_id || "0");
    return idA < idB ? 1 : idA > idB ? -1 : 0;
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
      {filtered.length === 0 && searchQuery ? (
        <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Nenhuma conversa encontrada
        </div>
      ) : (
        filtered.map((dm: DiscordDM) => {
          const recipient = dm.recipients[0];
          if (!recipient) return null;
          const isActive = activeChannelId === dm.id;
          return (
            <UserContextMenu key={dm.id} userId={recipient.id}>
              <button
                onClick={() => setActiveChannel(dm.id)}
                className={`dm-button ${!isActive ? "hover-bg-accent hover-color-normal" : ""}`}
                style={{
                  width: "100%",
                  background: isActive ? "var(--bg-accent)" : "",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "6px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  color: isActive ? "var(--interactive-active)" : "var(--text-muted)",
                  transition: "background 100ms, color 100ms",
                  textAlign: "left",
                }}
              >
                <Avatar
                  userId={recipient.id}
                  avatarHash={recipient.avatar}
                  avatarDecoration={recipient.avatar_decoration_data}
                  username={recipient.username}
                  size={32}
                  showStatus={true}
                  status={(cache.presences[accountId]?.[recipient.id]?.status as any) || "offline"}
                />
                {(() => {
                  const presence = cache.presences[accountId]?.[recipient.id];
                  const activities = presence?.activities?.filter((a: any) => a.type !== 4) || [];
                  const mainActivity = activities[0];
                  
                  return (
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden" }}>
                      <span className="truncate" style={{ fontSize: 14, fontWeight: isActive ? 600 : 500, width: "100%" }}>
                        {recipient.global_name ?? recipient.username}
                      </span>
                      {mainActivity && (
                        <div className="truncate" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: isActive ? "var(--interactive-active)" : "var(--text-muted)", marginTop: 2, fontWeight: 600, width: "100%" }}>
                          <Gamepad2 size={12} style={{ flexShrink: 0 }} />
                          <span className="truncate">{mainActivity.name}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Unread Badge */}
                {(() => {
                  const unread = cache.unreads[accountId]?.[dm.id];
                  if (!unread || unread.count === 0) return null;
                  return (
                    <div
                      style={{
                        background: "var(--status-dnd)",
                        color: "white",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "12px",
                        minWidth: 16,
                        textAlign: "center",
                        lineHeight: "12px",
                      }}
                    >
                      {unread.count > 99 ? "99+" : unread.count}
                    </div>
                  );
                })()}
                
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    className="close-dm-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      useArchiveStore.getState().archiveDM(accountId, dm.id);
                      if (activeChannelId === dm.id) {
                        setActiveChannel(null);
                      }
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 4,
                      borderRadius: "50%",
                    }}
                    title="Arquivar conversa"
                  >
                    <Archive size={14} />
                  </button>
                  <button
                    className="close-dm-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeDM(accountId, dm.id);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 4,
                      borderRadius: "50%",
                    }}
                    title="Fechar conversa"
                  >
                    <X size={14} />
                  </button>
                </div>
              </button>
            </UserContextMenu>
          );
        })
      )}
    </div>
  );
}
