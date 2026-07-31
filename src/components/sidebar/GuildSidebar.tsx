import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { useAccountStore } from "@/stores/accountStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { APP_ICONS } from "@/lib/themeManager";
import { OrganicMark } from "@/components/ui/OrganicMark";
import { getGuildIconUrl, getInitials } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { Settings, Folder as FolderIcon, BellOff, Plus } from "lucide-react";
import { GuildContextMenu } from "@/components/ui/GuildContextMenu";

interface GuildSidebarProps {
  onAddAccount?: () => void;
}

export function GuildSidebar({ onAddAccount }: GuildSidebarProps) {
  const { 
    activeAccountId, activeGuildId, setActiveGuild, setView, view, 
    navigateToDMs, guildFolders, toggleFolder, loadFolders,
    guildOrder, reorderGuilds, combineGuildsIntoFolder, setGuildOrder
  } = useNavigationStore();
  const { cache, loading, fetchGuilds } = useDiscordStore();
  const { sessions } = useAccountStore();

  const guilds = activeAccountId ? (cache.guilds[activeAccountId] ?? []) : [];
  const folders = activeAccountId ? (guildFolders[activeAccountId] ?? []) : [];
  const order = activeAccountId ? (guildOrder[activeAccountId] ?? []) : [];
  const isLoading = activeAccountId ? loading.guilds[activeAccountId] : false;

  // Reconcile order array with actual guilds
  const orderedGuildIds = new Set<string>();
  order.forEach(id => {
    if (id.startsWith("folder-")) {
       const f = folders.find(f => f.id === id);
       f?.guildIds.forEach(gid => orderedGuildIds.add(gid));
    } else {
       orderedGuildIds.add(id);
    }
  });

  // Any guild not in `orderedGuildIds` is a new/untracked guild. We append them to `fullOrder`.
  const untrackedGuilds = guilds.filter(g => !orderedGuildIds.has(g.id)).map(g => g.id);
  const fullOrder = [...order, ...untrackedGuilds];

  useEffect(() => {
    if (activeAccountId && untrackedGuilds.length > 0) {
      setGuildOrder(activeAccountId, fullOrder);
    }
  }, [activeAccountId, untrackedGuilds.length]);

  useEffect(() => {
    if (activeAccountId) {
      loadFolders(activeAccountId);
    }
    if (
      activeAccountId &&
      sessions[activeAccountId]?.status === "Connected" &&
      (!cache.guilds[activeAccountId] || cache.guilds[activeAccountId].length === 0)
    ) {
      fetchGuilds(activeAccountId);
    }
  }, [activeAccountId, sessions, loadFolders]);

  const handleDragEnd = (result: DropResult) => {
    if (!activeAccountId) return;
    const { source, destination, combine } = result;

    if (combine) {
      combineGuildsIntoFolder(activeAccountId, result.draggableId, combine.draggableId);
      return;
    }

    if (!destination) return;
    if (source.index === destination.index) return;

    reorderGuilds(activeAccountId, source.index, destination.index);
  };

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 0",
        gap: 4,
        flexShrink: 0,
      }}
    >
      {/* Home / DMs */}
      <Tooltip content="Mensagens Diretas" position="right">
        <GuildIcon
          label="DMs"
          active={view === "dms"}
          onClick={() => navigateToDMs()}
          isHome
        />
      </Tooltip>

      <Divider />

      {/* Pastas e Servidores */}
      {isLoading ? (
        <LoadingDots />
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="guilds" isCombineEnabled>
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", alignItems: "center" }}
              >
                {fullOrder.map((id, index) => {
                  const isFolder = id.startsWith("folder-");

                  if (isFolder) {
                    const folder = folders.find(f => f.id === id);
                    if (!folder) return null;
                    const folderGuilds = folder.guildIds.map(gid => guilds.find(g => g.id === gid)).filter(Boolean) as typeof guilds;
                    if (folderGuilds.length === 0) return null;

                    const hasUnreadFolder = folderGuilds.some(g => {
                      const guildUnreads = Object.values(cache.unreads[activeAccountId!] || {}).filter(u => u.guildId === g.id);
                      return guildUnreads.some(u => u.count > 0);
                    });
                    const folderMentionCount = folderGuilds.reduce((sum, g) => {
                      const guildUnreads = Object.values(cache.unreads[activeAccountId!] || {}).filter(u => u.guildId === g.id);
                      return sum + guildUnreads.reduce((s, u) => s + u.mentions, 0);
                    }, 0);

                    return (
                      <Draggable key={id} draggableId={id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                              alignItems: "center",
                              width: "100%",
                              opacity: snapshot.isDragging ? 0.5 : 1,
                              ...provided.draggableProps.style
                            }}
                          >
                            <Tooltip content={folder.name || "Pasta"} position="right">
                              <div style={{ position: "relative" }}>
                                <button
                                  onClick={() => toggleFolder(activeAccountId!, folder.id)}
                                  style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: folder.isExpanded ? "var(--radius-md)" : "16px",
                                    background: "var(--bg-secondary)",
                                    border: "none",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "var(--text-muted)",
                                    transition: "all 0.2s"
                                  }}
                                  className="hover-bg-brand hover-color-white"
                                >
                                  <FolderIcon size={24} />
                                </button>
                                {hasUnreadFolder && !folder.isExpanded && (
                                  <div style={{ position: "absolute", left: -4, width: 8, height: 8, borderRadius: "50%", background: "var(--text-normal)", top: "50%", transform: "translateY(-50%)" }} />
                                )}
                                {folderMentionCount > 0 && !folder.isExpanded && (
                                  <div style={{ position: "absolute", bottom: -2, right: -2, background: "var(--status-dnd)", color: "white", fontSize: 12, fontWeight: 700, padding: "2px 6px", borderRadius: "12px", border: "4px solid var(--bg-tertiary)", zIndex: 10 }}>
                                    {folderMentionCount > 99 ? "99+" : folderMentionCount}
                                  </div>
                                )}
                              </div>
                            </Tooltip>

                            {folder.isExpanded && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", width: "100%", paddingLeft: 4 }}>
                                {folderGuilds.map(guild => {
                                  const guildUnreads = Object.values(cache.unreads[activeAccountId!] || {}).filter(u => u.guildId === guild.id);
                                  const hasUnread = guildUnreads.some(u => u.count > 0);
                                  const mentionCount = guildUnreads.reduce((sum, u) => sum + u.mentions, 0);
                                  const isMuted = useNotificationStore.getState().isGuildMuted(guild.id);

                                  return (
                                    <GuildContextMenu key={guild.id} guildId={guild.id}>
                                      <div style={{ width: "100%" }}>
                                        <Tooltip content={<GuildTooltipContent name={guild.name} isMuted={isMuted} />} position="right">
                                          <GuildIcon
                                            label={guild.name}
                                            guildId={guild.id}
                                            iconHash={guild.icon}
                                            active={activeGuildId === guild.id}
                                            hasUnread={hasUnread}
                                            mentionCount={mentionCount}
                                            isMuted={isMuted}
                                            onClick={() => {
                                              setView("guilds");
                                              setActiveGuild(guild.id);
                                            }}
                                          />
                                        </Tooltip>
                                      </div>
                                    </GuildContextMenu>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  }

                  // It's a single guild
                  const guild = guilds.find(g => g.id === id);
                  if (!guild) return null;

                  const guildUnreads = Object.values(cache.unreads[activeAccountId!] || {}).filter(u => u.guildId === guild.id);
                  const hasUnread = guildUnreads.some(u => u.count > 0);
                  const mentionCount = guildUnreads.reduce((sum, u) => sum + u.mentions, 0);
                  const isMuted = useNotificationStore.getState().isGuildMuted(guild.id);

                  return (
                    <Draggable key={guild.id} draggableId={guild.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          style={{
                            width: "100%",
                            opacity: snapshot.isDragging ? 0.5 : 1,
                            ...provided.draggableProps.style
                          }}
                        >
                          <GuildContextMenu guildId={guild.id}>
                            <div style={{ width: "100%" }}>
                              <Tooltip content={<GuildTooltipContent name={guild.name} isMuted={isMuted} />} position="right">
                                <GuildIcon
                                  label={guild.name}
                                  guildId={guild.id}
                                  iconHash={guild.icon}
                                  active={activeGuildId === guild.id}
                                  hasUnread={hasUnread}
                                  mentionCount={mentionCount}
                                  isMuted={isMuted}
                                  onClick={() => {
                                    setView("guilds");
                                    setActiveGuild(guild.id);
                                  }}
                                />
                              </Tooltip>
                            </div>
                          </GuildContextMenu>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Botão Adicionar Servidor / Conta (Abaixo do último servidor) */}
      <Tooltip content="Adicionar Servidor" position="right">
        <button
          onClick={onAddAccount}
          className="add-server-btn hover-bg-brand hover-color-white"
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "var(--bg-secondary)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--status-online)",
            transition: "all 0.2s",
            marginTop: 4,
            flexShrink: 0,
          }}
        >
          <Plus size={24} />
        </button>
      </Tooltip>

      {/* Settings Button */}
      <div style={{ flex: 1 }} />
      <Tooltip content="Configurações de Usuário" position="right">
        <button
          onClick={() => useNavigationStore.getState().openSettings()}
          className="hover-bg-accent hover-color-normal"
          style={{
            width: 48,
            height: 48,
            border: "none",
            borderRadius: "50%",
            background: "transparent",
            color: "var(--interactive-normal)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            marginTop: "auto",
            marginBottom: 8,
            transition: "all 0.2s"
          }}
        >
          <Settings size={24} />
        </button>
      </Tooltip>
    </div>
  );
}

function GuildTooltipContent({ name, isMuted }: { name: string; isMuted?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#ffffff", lineHeight: "18px" }}>
          {name}
        </span>
      </div>
      {isMuted && (
        <span style={{ fontSize: 12, color: "#949ba4", fontWeight: 400, lineHeight: "14px" }}>
          Silenciado(a)
        </span>
      )}
    </div>
  );
}

function GuildIcon({
  label,
  guildId,
  iconHash,
  iconUrl: initialIconUrl,
  active,
  onClick,
  isHome,
  hasUnread,
  mentionCount,
  isMuted,
}: {
  label: string;
  guildId?: string;
  iconHash?: string | null;
  iconUrl?: string | null;
  active: boolean;
  onClick: () => void;
  isHome?: boolean;
  hasUnread?: boolean;
  mentionCount?: number;
  isMuted?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const show = active || hovered;

  const appIconId = useSettingsStore((s) => s.settings.appIcon) || "dark_mono";
  const iconPreset = APP_ICONS.find((i) => i.id === appIconId) || APP_ICONS[1] || APP_ICONS[0];

  const homeBg = show ? iconPreset.bgGradient : "var(--bg-secondary)";

  const currentIconUrl = isHome
    ? null
    : guildId && iconHash !== undefined
    ? getGuildIconUrl(guildId, iconHash, 96, hovered)
    : initialIconUrl;

  return (
    <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center", alignItems: "center", opacity: isMuted && !active ? 0.75 : 1 }}>
      {/* Unread dot (White) */}
      {hasUnread && !active && !isMuted && (
        <div
          style={{
            position: "absolute",
            left: -4,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--text-normal)",
            transform: "translateY(-50%)",
            top: "50%",
          }}
        />
      )}

      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 48,
          height: 48,
          border: "none",
          borderRadius: show ? "var(--radius-md)" : "50%",
          cursor: "pointer",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isHome ? homeBg : show ? "var(--bg-secondary)" : "var(--bg-secondary)",
          transition: "border-radius 200ms, background 150ms, transform 150ms",
          padding: 0,
          flexShrink: 0,
          boxShadow: isHome && show ? "0 4px 12px rgba(0,0,0,0.3)" : "none",
        }}
      >
        {isHome ? (
          <OrganicMark size={34} />
        ) : currentIconUrl ? (
          <img
            src={currentIconUrl}
            alt={label}
            width={48}
            height={48}
            style={{ objectFit: "cover", display: "block" }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-normal)",
              textAlign: "center",
              lineHeight: 1.2,
              padding: "0 4px",
            }}
          >
            {getInitials(label) || label.slice(0, 2).toUpperCase()}
          </span>
        )}
      </button>

      {/* Mention badge (Red) */}
      {mentionCount !== undefined && mentionCount > 0 ? (
        <div
          style={{
            position: "absolute",
            bottom: -2,
            right: 0,
            background: "var(--status-dnd)",
            color: "white",
            fontSize: 12,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: "12px",
            border: "4px solid var(--bg-tertiary)",
            pointerEvents: "none",
            minWidth: 16,
            textAlign: "center",
            lineHeight: "12px",
            zIndex: 10,
          }}
        >
          {mentionCount > 99 ? "99+" : mentionCount}
        </div>
      ) : isMuted ? (
        <div
          style={{
            position: "absolute",
            bottom: -2,
            right: 0,
            background: "var(--bg-secondary)",
            color: "var(--text-muted)",
            fontSize: 10,
            padding: "3px",
            borderRadius: "50%",
            border: "2px solid var(--bg-tertiary)",
            pointerEvents: "none",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <BellOff size={12} />
        </div>
      ) : null}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 32,
        height: 2,
        background: "var(--bg-accent)",
        borderRadius: 1,
        margin: "2px 0",
      }}
    />
  );
}

function LoadingDots() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        paddingTop: 8,
      }}
    >
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "var(--bg-accent)",
            animation: `pulse 1.5s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
