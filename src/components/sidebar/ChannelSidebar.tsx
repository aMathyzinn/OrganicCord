import { useEffect, useMemo, useState } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import { channelErrorKey, useDiscordStore } from "@/stores/discordStore";
import { useVoiceStore } from "@/stores/voiceStore";
import { useAccountStore } from "@/stores/accountStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { ChannelContextMenu } from "@/components/ui/ChannelContextMenu";
import type { DiscordChannel } from "@/types";
import { Volume2, Drama, Megaphone, MessagesSquare, Search, X, ChevronRight, BellOff, Lock, RefreshCw } from "lucide-react";
import { getGuildIconUrl, getInitials } from "@/lib/utils";
import { getChannelPermissions } from "@/lib/permissions";

// Literal constants — avoids enum import issues at runtime
const CT = {
  TEXT: 0,
  DM: 1,
  VOICE: 2,
  GROUP_DM: 3,
  CATEGORY: 4,
  ANNOUNCEMENT: 5,
  STAGE: 13,
  FORUM: 15,
} as const;

function ctype(c: DiscordChannel): number {
  return Number(c.channel_type);
}

interface Props {
  guildId: string;
}

export function ChannelSidebar({ guildId }: Props) {
  const { activeAccountId, activeChannelId, setActiveChannel } = useNavigationStore();
  const { cache, channelLoads, fetchChannels } = useDiscordStore();
  const { accounts } = useAccountStore();

  const channels = activeAccountId ? (cache.channels[activeAccountId]?.[guildId] ?? []) : [];
  const channelLoad = activeAccountId ? channelLoads[activeAccountId]?.[guildId] : undefined;
  const isLoading = channelLoad?.status === "loading";
  const isInitialLoading = isLoading && channels.length === 0;
  const fetchError = useDiscordStore((s) => activeAccountId
    ? s.errors[channelErrorKey(activeAccountId, guildId)]
    : undefined);
  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  
  const unreads = activeAccountId ? (cache.unreads[activeAccountId] ?? {}) : {};

  // Get guild info for the header
  const guilds = activeAccountId ? (cache.guilds[activeAccountId] ?? []) : [];
  const guild = guilds.find((g) => g.id === guildId);
  const guildIconUrl = guild?.icon ? getGuildIconUrl(guild.id, guild.icon) : null;

  // Search/filter
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  useEffect(() => {
    if (activeAccountId && guildId) {
      const load = useDiscordStore.getState().channelLoads[activeAccountId]?.[guildId];
      const cached = useDiscordStore.getState().cache.channels[activeAccountId]?.[guildId];
      if (!cached || !load || load.status === "idle" || load.status === "empty" || load.status === "error" || load.source === "gateway") {
        void fetchChannels(activeAccountId, guildId);
      }
    }
  }, [activeAccountId, guildId, fetchChannels]);

  const grouped = useMemo(() => {
    const filtered = query
      ? channels.filter((c) => (c.name ?? "").toLowerCase().includes(query))
      : channels;

    const cats = filtered.filter((c) => ctype(c) === CT.CATEGORY);
    const catMap: Record<string, DiscordChannel[]> = {};
    cats.forEach((c) => { catMap[c.id] = []; });

    const uncategorized: DiscordChannel[] = [];
    const threadMap: Record<string, DiscordChannel[]> = {};

    filtered.forEach((c) => {
      const type = ctype(c);
      if (type === CT.CATEGORY) return;

      if (type === 11 || type === 12) {
        if (c.parent_id) {
          if (!threadMap[c.parent_id]) threadMap[c.parent_id] = [];
          threadMap[c.parent_id].push(c);
        }
        return;
      }

      if (c.parent_id && catMap[c.parent_id] !== undefined) {
        catMap[c.parent_id].push(c);
      } else {
        uncategorized.push(c);
      }
    });

    return { cats, catMap, uncategorized, threadMap };
  }, [channels, query]);

  return (
    <div
      style={{
        width: "100%",
        flex: 1,
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Header — server name + account badge */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden", flex: 1, minWidth: 0 }}>
          {guildIconUrl ? (
            <img
              src={guildIconUrl}
              alt={guild?.name}
              style={{ width: 24, height: 24, borderRadius: "var(--radius-sm)", objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 24, height: 24, borderRadius: "var(--radius-sm)",
              background: "var(--bg-accent)", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "var(--text-normal)",
            }}>
              {guild?.name ? getInitials(guild.name) : "?"}
            </div>
          )}
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-normal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {guild?.name ?? "Canais"}
          </span>
        </div>
        {activeAccount && (
          <span
            style={{
              fontSize: 11,
              color: activeAccount.color,
              fontWeight: 600,
              background: `${activeAccount.color}22`,
              padding: "2px 6px",
              borderRadius: 99,
              flexShrink: 0,
            }}
          >
            {activeAccount.username.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Search/filter bar */}
      <div style={{ padding: "6px 8px", flexShrink: 0 }}>
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
            placeholder="Buscar canal"
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

      {/* Lista */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0 8px" }}>
        {isInitialLoading ? (
          <ChannelSkeletons />
        ) : fetchError && channels.length === 0 ? (
          <ErrorState error={fetchError} onRetry={() => activeAccountId && void fetchChannels(activeAccountId, guildId, true)} />
        ) : query && grouped.uncategorized.length === 0 && grouped.cats.length === 0 ? (
          <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Nenhum canal encontrado para "{search.trim()}"
          </div>
        ) : channels.length === 0 ? (
          <EmptyChannelsState
            refreshing={isLoading}
            onRetry={() => activeAccountId && void fetchChannels(activeAccountId, guildId, true)}
          />
        ) : (
          <>
            {(isLoading || fetchError) && (
              <ChannelRefreshNotice
                error={fetchError}
                refreshing={isLoading}
                onRetry={() => activeAccountId && void fetchChannels(activeAccountId, guildId, true)}
              />
            )}
            {/* Canais sem categoria */}
            {grouped.uncategorized.map((ch) => {
              const unread = unreads[ch.id];
              const isUnread = unread && unread.count > 0;
              return (
                <ChannelRow
                  key={ch.id}
                  channel={ch}
                  active={activeChannelId === ch.id}
                  onClick={() => setActiveChannel(ch.id)}
                  indent={false}
                  threads={grouped.threadMap[ch.id] || []}
                  activeChannelId={activeChannelId}
                  onChannelClick={setActiveChannel}
                  isUnread={isUnread}
                  mentionCount={unread?.mentions}
                />
              );
            })}

            {/* Categorias colapsáveis */}
            {grouped.cats.map((cat) => (
              <CategoryGroup
                key={cat.id}
                category={cat}
                channels={grouped.catMap[cat.id] ?? []}
                threadMap={grouped.threadMap}
                activeChannelId={activeChannelId}
                onChannelClick={setActiveChannel}
                unreads={unreads}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Category ─────────────────────────────────────────────────────────────────

function CategoryGroup({
  category,
  channels,
  threadMap,
  activeChannelId,
  onChannelClick,
  unreads,
}: {
  category: DiscordChannel;
  channels: DiscordChannel[];
  threadMap: Record<string, DiscordChannel[]>;
  activeChannelId: string | null;
  onChannelClick: (id: string) => void;
  unreads: Record<string, { count: number; mentions: number }>;
}) {
  const { activeAccountId, activeGuildId } = useNavigationStore();
  const { joinCall } = useVoiceStore();
  const hasActive = channels.some((c) => c.id === activeChannelId || (threadMap[c.id] && threadMap[c.id].some(t => t.id === activeChannelId)));
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <div style={{ marginTop: 16 }}>
      {/* Header clicável */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: "16px 8px 4px 2px",
          display: "flex",
          alignItems: "center",
          gap: 2,
          cursor: "pointer",
          color: "var(--text-muted)",
          textAlign: "left",
          transition: "color 150ms",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--interactive-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        <ChevronRight
          size={12}
          style={{
            flexShrink: 0,
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 150ms ease-out",
            marginLeft: 2,
            marginRight: 2,
            strokeWidth: 2.5,
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: "none",
            letterSpacing: "0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1,
          }}
        >
          {category.name}
        </span>
      </button>

      {/* Canais dentro da categoria com animação suave */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {channels.map((ch) => {
            const unread = unreads[ch.id];
            const isUnread = unread && unread.count > 0;
            return (
              <ChannelRow
                key={ch.id}
                channel={ch}
                active={activeChannelId === ch.id}
                onClick={() => {
                  if (ctype(ch) === CT.VOICE || ctype(ch) === CT.STAGE) {
                    if (activeAccountId) {
                      joinCall(activeAccountId, activeGuildId || "", ch.id);
                    }
                  } else {
                    onChannelClick(ch.id);
                  }
                }}
                indent
                threads={threadMap[ch.id] || []}
                activeChannelId={activeChannelId}
                onChannelClick={onChannelClick}
                isUnread={isUnread}
                mentionCount={unread?.mentions}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Channel row ──────────────────────────────────────────────────────────────

function ChannelRow({
  channel,
  active,
  onClick,
  indent,
  threads,
  activeChannelId,
  onChannelClick,
  isUnread,
  mentionCount,
}: {
  channel: DiscordChannel;
  active: boolean;
  onClick: () => void;
  indent: boolean;
  threads?: DiscordChannel[];
  activeChannelId?: string | null;
  onChannelClick?: (id: string) => void;
  isUnread?: boolean;
  mentionCount?: number;
}) {
  const { activeAccountId, activeGuildId } = useNavigationStore();
  const { cache } = useDiscordStore();
  const type = ctype(channel);
  const isVoice = type === CT.VOICE || type === CT.STAGE;
  const icon = channelIcon(type);
  const isMuted = useNotificationStore((s) => s.isChannelMuted(channel.id));

  const guilds = activeAccountId ? (cache.guilds[activeAccountId] ?? []) : [];
  const currentMember = activeAccountId && activeGuildId
    ? cache.guildMembers[activeAccountId]?.[activeGuildId]
    : undefined;
  const currentUserId = useAccountStore
    .getState()
    .accounts.find((account) => account.id === activeAccountId)?.user_id;
  const perms = getChannelPermissions(activeGuildId, guilds, false, {
    channel,
    memberRoleIds: currentMember?.roles,
    currentUserId,
  });
  const isLocked = !perms.canView;

  return (
    <div>
      <ChannelContextMenu channelId={channel.id}>
        <button
          onClick={onClick}
          className={!active && !isVoice ? "hover-bg-subtle hover-color-normal" : undefined}
          style={{
            width: "100%",
            background: active ? "var(--bg-accent)" : "transparent",
            border: "none",
            borderRadius: 4,
            padding: `4px 8px 4px ${indent ? 16 : 8}px`,
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            textAlign: "left",
            color: active
              ? "var(--interactive-active)"
              : isUnread
              ? "var(--text-normal)"
              : isVoice
              ? "var(--text-muted)"
              : "var(--interactive-normal)",
            transition: "background 80ms, color 80ms",
            position: "relative",
            opacity: isMuted && !active ? 0.6 : 1,
          }}
        >
          {isUnread && !active && !isVoice && !isMuted && (
            <div style={{ position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)", width: 4, height: 8, borderRadius: "0 4px 4px 0", background: "var(--text-normal)" }} />
          )}
          <ChannelIcon type={type} icon={icon} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 15,
              fontWeight: active || (isUnread && !isVoice) ? 600 : 400,
              lineHeight: 1,
              flex: 1,
            }}
          >
            {channel.name ?? "canal"}
          </span>
          {isLocked && (
            <span title="Canal Privado" style={{ display: "inline-flex" }}>
              <Lock size={12} style={{ color: "var(--text-muted)", flexShrink: 0, opacity: 0.6 }} />
            </span>
          )}
          {isMuted && (
            <BellOff size={13} style={{ color: "var(--text-muted)", flexShrink: 0, opacity: 0.7 }} />
          )}
          {mentionCount !== undefined && mentionCount > 0 && (
            <div style={{ background: "var(--status-dnd)", color: "white", fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 12, lineHeight: 1 }}>
              {mentionCount > 99 ? "99+" : mentionCount}
            </div>
          )}
        </button>
      </ChannelContextMenu>

      {/* Render threads */}
      {threads && threads.length > 0 && (
        <div style={{ paddingLeft: indent ? 24 : 16, display: "flex", flexDirection: "column", marginTop: 2, marginBottom: 4 }}>
          {threads.map(th => {
             const thActive = activeChannelId === th.id;
             return (
               <div key={th.id} style={{ display: "flex", alignItems: "center" }}>
                 <svg width="16" height="24" style={{ flexShrink: 0, marginTop: -6 }}>
                    <path d="M 8 0 L 8 12 Q 8 16 12 16 L 16 16" stroke="var(--border-subtle)" strokeWidth="2" fill="none" />
                 </svg>
                 <button
                   onClick={() => onChannelClick?.(th.id)}
                   className={!thActive ? "hover-bg-subtle hover-color-normal" : undefined}
                   style={{
                     flex: 1,
                     background: thActive ? "var(--bg-accent)" : "transparent",
                     border: "none",
                     borderRadius: 4,
                     padding: "4px 8px",
                     display: "flex",
                     alignItems: "center",
                     gap: 6,
                     cursor: "pointer",
                     textAlign: "left",
                     color: thActive ? "var(--interactive-active)" : "var(--interactive-normal)",
                     transition: "background 80ms, color 80ms",
                   }}
                 >
                   <MessagesSquare size={14} style={{ opacity: 0.7 }} />
                   <span style={{
                     overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                     fontSize: 14, fontWeight: thActive ? 600 : 400, lineHeight: 1
                   }}>
                     {th.name ?? "Tópico"}
                   </span>
                 </button>
               </div>
             );
          })}
        </div>
      )}
    </div>
  );
}

function ChannelIcon({ type, icon }: { type: number; icon: React.ReactNode }) {
  const isVoice = type === CT.VOICE || type === CT.STAGE;

  // Text channels use SVG hash for crispness; others use Lucide icons
  if (!isVoice && icon === "#") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, fill: "currentColor", opacity: 0.7 }}>
        <path d="M6.21 1.804a.75.75 0 0 1 .546.912L6.45 4h3.1l.375-1.784a.75.75 0 0 1 1.458.366L11.051 4H13.25a.75.75 0 0 1 0 1.5h-2.504l-.567 2.7H12.5a.75.75 0 0 1 0 1.5h-2.625l-.424 2.016a.75.75 0 0 1-1.458-.366L8.3 9.7H5.2l-.424 2.016a.75.75 0 0 1-1.458-.366L3.63 9.7H1.75a.75.75 0 0 1 0-1.5h2.186l.566-2.7H2.75a.75.75 0 0 1 0-1.5h2.056l.376-1.784a.75.75 0 0 1 .912-.546l.116.134zM5.503 5.5l-.567 2.7h3.1l.567-2.7h-3.1z" />
      </svg>
    );
  }

  return (
    <span style={{ lineHeight: 1, flexShrink: 0, opacity: isVoice ? 0.6 : 1, display: "flex", alignItems: "center" }}>
      {icon}
    </span>
  );
}

function channelIcon(type: number): React.ReactNode {
  const size = 16;
  switch (type) {
    case CT.VOICE:        return <Volume2 size={size} />;
    case CT.STAGE:        return <Drama size={size} />;
    case CT.ANNOUNCEMENT: return <Megaphone size={size} />;
    case CT.FORUM:        return <MessagesSquare size={size} />;
    default:              return "#";
  }
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div style={{ padding: "12px 12px" }}>
      <p style={{ fontSize: 12, color: "var(--text-danger)", marginBottom: 4 }}>
        Erro ao carregar canais:
      </p>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, wordBreak: "break-all" }}>
        {error}
      </p>
      <button
        onClick={onRetry}
        style={{ fontSize: 12, color: "var(--text-link)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        Tentar novamente
      </button>
    </div>
  );
}

function EmptyChannelsState({ refreshing, onRetry }: { refreshing: boolean; onRetry: () => void }) {
  return (
    <div style={{ padding: "24px 16px", textAlign: "center" }}>
      <MessagesSquare size={24} style={{ color: "var(--text-muted)", marginBottom: 10 }} />
      <p style={{ fontSize: 13, fontWeight: 650, color: "var(--text-normal)", marginBottom: 5 }}>
        Nenhum canal disponível
      </p>
      <p style={{ fontSize: 12, lineHeight: 1.45, color: "var(--text-muted)", marginBottom: 12 }}>
        O servidor pode estar temporariamente indisponível ou ainda não ter terminado de carregar.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={refreshing}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 9px",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-tertiary)",
          color: "var(--text-normal)",
          fontSize: 12,
          fontWeight: 650,
        }}
      >
        <RefreshCw size={13} className={refreshing ? "channel-refresh-spin" : undefined} />
        {refreshing ? "Carregando canais" : "Tentar novamente"}
      </button>
    </div>
  );
}

function ChannelRefreshNotice({
  error,
  refreshing,
  onRetry,
}: {
  error?: string;
  refreshing: boolean;
  onRetry: () => void;
}) {
  if (refreshing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px 7px", color: "var(--text-muted)", fontSize: 11 }}>
        <RefreshCw size={12} className="channel-refresh-spin" />
        Atualizando canais
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRetry}
      title={error}
      style={{
        width: "100%",
        padding: "6px 12px 8px",
        border: 0,
        background: "transparent",
        color: "var(--text-warning)",
        textAlign: "left",
        fontSize: 11,
      }}
    >
      Não foi possível atualizar. Tentar novamente
    </button>
  );
}

function ChannelSkeletons() {
  return (
    <div style={{ padding: "8px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          style={{
            height: 32,
            borderRadius: 4,
            background: "var(--bg-accent)",
            opacity: 0.3 + (i % 3) * 0.15,
            marginLeft: i % 3 === 0 ? 0 : 12,
            width: i % 3 === 0 ? "55%" : "80%",
          }}
        />
      ))}
    </div>
  );
}
