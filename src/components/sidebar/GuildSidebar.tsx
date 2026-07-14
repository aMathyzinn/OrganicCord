import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { useAccountStore } from "@/stores/accountStore";
import { getGuildIconUrl, getInitials } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { Settings, Folder as FolderIcon } from "lucide-react";
import { GuildContextMenu } from "@/components/ui/GuildContextMenu";

export function GuildSidebar() {
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
      !cache.guilds[activeAccountId]
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
                                  const iconUrl = getGuildIconUrl(guild.id, guild.icon);
                                  const guildUnreads = Object.values(cache.unreads[activeAccountId!] || {}).filter(u => u.guildId === guild.id);
                                  const hasUnread = guildUnreads.some(u => u.count > 0);
                                  const mentionCount = guildUnreads.reduce((sum, u) => sum + u.mentions, 0);

                                  return (
                                    <GuildContextMenu key={guild.id} guildId={guild.id}>
                                      <div style={{ width: "100%" }}>
                                        <Tooltip content={guild.name} position="right">
                                          <GuildIcon
                                            label={guild.name}
                                            iconUrl={iconUrl}
                                            active={activeGuildId === guild.id}
                                            hasUnread={hasUnread}
                                            mentionCount={mentionCount}
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

                  const iconUrl = getGuildIconUrl(guild.id, guild.icon);
                  const guildUnreads = Object.values(cache.unreads[activeAccountId!] || {}).filter(u => u.guildId === guild.id);
                  const hasUnread = guildUnreads.some(u => u.count > 0);
                  const mentionCount = guildUnreads.reduce((sum, u) => sum + u.mentions, 0);

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
                              <Tooltip content={guild.name} position="right">
                                <GuildIcon
                                  label={guild.name}
                                  iconUrl={iconUrl}
                                  active={activeGuildId === guild.id}
                                  hasUnread={hasUnread}
                                  mentionCount={mentionCount}
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

function GuildIcon({
  label,
  iconUrl,
  active,
  onClick,
  isHome,
  hasUnread,
  mentionCount,
}: {
  label: string;
  iconUrl?: string | null;
  active: boolean;
  onClick: () => void;
  isHome?: boolean;
  hasUnread?: boolean;
  mentionCount?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const show = active || hovered;

  return (
    <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
      {/* Unread dot (White) */}
      {hasUnread && !active && (
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
          background: show
            ? isHome
              ? "var(--brand-500)"
              : "var(--bg-secondary)"
            : "var(--bg-secondary)",
          transition: "border-radius 200ms, background 150ms",
          padding: 0,
          flexShrink: 0,
        }}
      >
        {isHome ? (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill={show ? "#fff" : "var(--text-muted)"}
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.053a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
          </svg>
        ) : iconUrl ? (
          <img
            src={iconUrl}
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
      {mentionCount !== undefined && mentionCount > 0 && (
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
      )}
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
