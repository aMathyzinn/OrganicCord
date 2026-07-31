import * as ContextMenu from "@radix-ui/react-context-menu";
import { FolderPlus, Folder, BellOff, Bell, ChevronRight } from "lucide-react";
import { useNavigationStore } from "@/stores/navigationStore";
import { useNotificationStore, MUTE_DURATIONS } from "@/stores/notificationStore";

interface GuildContextMenuProps {
  children: React.ReactNode;
  guildId: string;
}

export function GuildContextMenu({ children, guildId }: GuildContextMenuProps) {
  const { activeAccountId, guildFolders, createFolder, moveGuildToFolder } = useNavigationStore();
  const { isGuildMuted, muteGuild, unmuteGuild } = useNotificationStore();

  const folders = activeAccountId ? (guildFolders[activeAccountId] || []) : [];
  const isMuted = isGuildMuted(guildId);

  const handleCreateFolder = () => {
    if (activeAccountId) {
      createFolder(activeAccountId, [guildId]);
    }
  };

  const handleMoveToFolder = (folderId: string) => {
    if (activeAccountId) {
      moveGuildToFolder(activeAccountId, guildId, folderId);
    }
  };

  const handleRemoveFromFolder = () => {
    if (activeAccountId) {
      moveGuildToFolder(activeAccountId, guildId, null);
    }
  };

  const isInFolder = folders.some(f => f.guildIds.includes(guildId));

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          style={{
            minWidth: 220,
            backgroundColor: "var(--bg-floating)",
            borderRadius: "var(--radius-sm)",
            padding: 8,
            boxShadow: "var(--elevation-high)",
            border: "1px solid var(--border-subtle)",
            zIndex: 100,
          }}
        >
          {/* Opções de Silenciar Servidor */}
          {isMuted ? (
            <ContextMenu.Item
              className="hover-bg-brand"
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--interactive-normal)",
                fontSize: 14,
                fontWeight: 500,
                outline: "none",
              }}
              onClick={() => unmuteGuild(guildId)}
            >
              <Bell size={16} />
              Dessilenciar Servidor
            </ContextMenu.Item>
          ) : (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger
                className="hover-bg-brand"
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  color: "var(--interactive-normal)",
                  fontSize: 14,
                  fontWeight: 500,
                  outline: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <BellOff size={16} />
                  Silenciar Servidor
                </div>
                <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent
                  style={{
                    minWidth: 170,
                    backgroundColor: "var(--bg-floating)",
                    borderRadius: "var(--radius-sm)",
                    padding: 8,
                    boxShadow: "var(--elevation-high)",
                    border: "1px solid var(--border-subtle)",
                    zIndex: 101,
                  }}
                >
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteGuild(guildId, MUTE_DURATIONS.FIFTEEN_MINS)}
                  >
                    Por 15 minutos
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteGuild(guildId, MUTE_DURATIONS.ONE_HOUR)}
                  >
                    Por 1 hora
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteGuild(guildId, MUTE_DURATIONS.EIGHT_HOURS)}
                  >
                    Por 8 horas
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteGuild(guildId, MUTE_DURATIONS.TWENTY_FOUR_HOURS)}
                  >
                    Por 24 horas
                  </ContextMenu.Item>
                  <ContextMenu.Separator style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteGuild(guildId, MUTE_DURATIONS.PERMANENT)}
                  >
                    Até que eu reative
                  </ContextMenu.Item>
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}

          <ContextMenu.Separator style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />

          <ContextMenu.Item
            className="hover-bg-brand"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--interactive-normal)",
              fontSize: 14,
              fontWeight: 500,
              outline: "none",
            }}
            onClick={handleCreateFolder}
          >
            <FolderPlus size={16} />
            Criar Pasta
          </ContextMenu.Item>

          {folders.length > 0 && (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger
                className="hover-bg-brand"
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  color: "var(--interactive-normal)",
                  fontSize: 14,
                  fontWeight: 500,
                  outline: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Folder size={16} />
                  Mover para Pasta
                </div>
                <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent
                  style={{
                    minWidth: 160,
                    backgroundColor: "var(--bg-floating)",
                    borderRadius: "var(--radius-sm)",
                    padding: 8,
                    boxShadow: "var(--elevation-high)",
                    border: "1px solid var(--border-subtle)",
                    zIndex: 101,
                  }}
                >
                  {folders.map(folder => {
                    const isCurrentFolder = folder.guildIds.includes(guildId);
                    if (isCurrentFolder) return null;
                    return (
                      <ContextMenu.Item
                        key={folder.id}
                        className="hover-bg-brand"
                        style={{
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                          color: "var(--interactive-normal)",
                          fontSize: 14,
                          outline: "none",
                        }}
                        onClick={() => handleMoveToFolder(folder.id)}
                      >
                        {folder.name || "Nova Pasta"}
                      </ContextMenu.Item>
                    );
                  })}
                  {isInFolder && (
                    <>
                      <ContextMenu.Separator style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />
                      <ContextMenu.Item
                        className="hover-bg-danger"
                        style={{
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                          color: "var(--status-danger)",
                          fontSize: 14,
                          outline: "none",
                        }}
                        onClick={handleRemoveFromFolder}
                      >
                        Remover da Pasta
                      </ContextMenu.Item>
                    </>
                  )}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
