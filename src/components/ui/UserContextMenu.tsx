import React, { useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useProfileStore } from "@/stores/profileStore";
import { useNotificationStore, MUTE_DURATIONS } from "@/stores/notificationStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import * as api from "@/lib/tauri";
import { toast } from "@/components/ui/Toast";
import { AppConfirmDialog, AppTextDialog } from "@/components/ui/AppDialog";
import { ChannelType } from "@/types";
import {
  User,
  Phone,
  FileText,
  UserCheck,
  XCircle,
  UserPlus,
  UserMinus,
  Ban,
  BellOff,
  Bell,
  ShieldOff,
  ShieldAlert,
  ChevronRight,
  Copy,
  Hash,
} from "lucide-react";

interface Props {
  children: React.ReactNode;
  userId: string;
  guildId?: string | null;
  channelId?: string | null;
}

export function UserContextMenu({ children, userId, guildId, channelId }: Props) {
  const { openProfile } = useProfileStore();
  const { activeAccountId, setActiveChannel } = useNavigationStore();
  const { cache, closeDM, sendMessage, blockUser, unblockUser } = useDiscordStore();
  const { isUserMuted, muteUser, unmuteUser, isUserMutedInGuild, muteUserInGuild, unmuteUserInGuild } = useNotificationStore();
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<"remove" | "block" | null>(null);

  const userMuted = isUserMuted(userId);
  const userMutedInGuild = guildId ? isUserMutedInGuild(guildId, userId) : false;
  const isBlocked = activeAccountId
    ? cache.relationships[activeAccountId]?.some((r) => r.user.id === userId && r.relationship_type === 2)
    : false;

  // Busca corporações/servidores da conta ativa para o submenu "Convidar para o servidor"
  const userGuilds = activeAccountId ? cache.guilds[activeAccountId] || [] : [];
  const userDMs = activeAccountId ? cache.dms[activeAccountId] || [] : [];

  // Tenta encontrar a DM do usuário se channelId não for explicitamente fornecido
  const targetDM = channelId
    ? userDMs.find((dm) => dm.id === channelId)
    : userDMs.find((dm) => dm.recipients?.some((r) => r.id === userId));

  const targetChannelId = channelId || targetDM?.id;

  const handleStartCall = async () => {
    if (!activeAccountId) return;
    try {
      let dmId = targetChannelId;
      if (!dmId) {
        const dm = await api.createDM(activeAccountId, userId);
        dmId = dm.id;
      }
      setActiveChannel(dmId);
      toast.info("Iniciando conversa direta...");
    } catch (err) {
      toast.error("Erro ao iniciar chamada.");
    }
  };

  const saveNote = async () => {
    if (activeAccountId) {
      try {
        await api.setUserNote(activeAccountId, userId, noteValue);
        toast.success("Nota atualizada!");
        setNoteValue("");
      } catch (err) {
        toast.error("Erro ao salvar nota.");
      }
    }
  };

  const handleAddNickname = () => {
    openProfile(userId);
  };

  const handleCloseDM = async () => {
    if (activeAccountId && targetChannelId) {
      await closeDM(activeAccountId, targetChannelId);
      toast.info("Mensagem direta fechada.");
    }
  };

  const handleInviteToGuild = async (targetGuildId: string, guildName: string) => {
    if (!activeAccountId) return;
    try {
      let dmId = targetChannelId;
      if (!dmId) {
        const dm = await api.createDM(activeAccountId, userId);
        dmId = dm.id;
      }
      const channels = await api.getChannels(activeAccountId, targetGuildId);
      const textChan = channels.find((channel) => channel.channel_type === ChannelType.GUILD_TEXT) || channels[0];
      if (textChan) {
        const invite = await api.createChannelInvite(activeAccountId, textChan.id);
        if (invite?.code) {
          await sendMessage(activeAccountId, dmId, `https://discord.gg/${invite.code}`);
          toast.success(`Convite para "${guildName}" enviado na DM!`);
        } else {
          toast.error("Não foi possível gerar um convite válido.");
        }
      }
    } catch (err) {
      toast.error("Erro ao gerar/enviar convite do servidor.");
    }
  };

  const handleRemoveFriend = async () => {
    if (!activeAccountId) return;
    try {
      await unblockUser(activeAccountId, userId);
      toast.success("Amigo removido.");
    } catch (err) {
      toast.error("Erro ao remover amigo.");
    }
  };

  const handleBlockUser = async () => {
    if (!activeAccountId) return;
    try {
      await blockUser(activeAccountId, userId);
      toast.success("Usuário bloqueado.");
    } catch (err) {
      toast.error("Erro ao bloquear usuário.");
    }
  };

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(userId);
    toast.success("ID do usuário copiado!");
  };

  const handleCopyChannelId = () => {
    if (targetChannelId) {
      navigator.clipboard.writeText(targetChannelId);
      toast.success("ID do canal copiado!");
    }
  };

  return (
    <>
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          style={{
            minWidth: 220,
            background: "var(--bg-floating)",
            borderRadius: "var(--radius-md)",
            padding: "6px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {/* 1. Perfil */}
          <ContextMenu.Item
            onSelect={() => openProfile(userId)}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 14,
              color: "var(--text-normal)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              outline: "none",
            }}
            className="hover-bg-modifier-selected"
          >
            <User size={16} />
            Perfil
          </ContextMenu.Item>

          {/* 2. Iniciar chamada */}
          <ContextMenu.Item
            onSelect={handleStartCall}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 14,
              color: "var(--text-normal)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              outline: "none",
            }}
            className="hover-bg-modifier-selected"
          >
            <Phone size={16} />
            Iniciar chamada
          </ContextMenu.Item>

          {/* 3. Adicionar nota */}
          <ContextMenu.Item
            onSelect={() => setNoteDialogOpen(true)}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 14,
              color: "var(--text-normal)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              outline: "none",
            }}
            className="hover-bg-modifier-selected"
          >
            <FileText size={16} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span>Adicionar nota</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Visível apenas para você</span>
            </div>
          </ContextMenu.Item>

          {/* 4. Adicionar apelido de amigo */}
          <ContextMenu.Item
            onSelect={handleAddNickname}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 14,
              color: "var(--text-normal)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              outline: "none",
            }}
            className="hover-bg-modifier-selected"
          >
            <UserCheck size={16} />
            Adicionar apelido de amigo
          </ContextMenu.Item>

          {/* 5. Fechar mensagem direta (se houver DM) */}
          {targetChannelId && (
            <ContextMenu.Item
              onSelect={handleCloseDM}
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: 14,
                color: "var(--text-normal)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                outline: "none",
              }}
              className="hover-bg-modifier-selected"
            >
              <XCircle size={16} />
              Fechar mensagem direta
            </ContextMenu.Item>
          )}

          <ContextMenu.Separator style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />

          {/* 6. Convidar para o servidor > (desativado se usuário bloqueado) */}
          {userGuilds.length > 0 && !isBlocked && (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 14,
                  color: "var(--text-normal)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  outline: "none",
                }}
                className="hover-bg-modifier-selected"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <UserPlus size={16} />
                  Convidar para o servidor
                </div>
                <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent
                  style={{
                    minWidth: 190,
                    backgroundColor: "var(--bg-floating)",
                    borderRadius: "var(--radius-sm)",
                    padding: 6,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    border: "1px solid var(--border-subtle)",
                    zIndex: 1001,
                    maxHeight: 250,
                    overflowY: "auto",
                  }}
                >
                  {userGuilds.map((g) => (
                    <ContextMenu.Item
                      key={g.id}
                      className="hover-bg-brand"
                      style={{
                        padding: "8px 12px",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        fontSize: 14,
                        outline: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                      onClick={() => handleInviteToGuild(g.id, g.name)}
                    >
                      {g.icon ? (
                        <img
                          src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.webp?size=32`}
                          alt=""
                          style={{ width: 18, height: 18, borderRadius: "50%" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: "var(--bg-tertiary)",
                            fontSize: 10,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {g.name[0]}
                        </div>
                      )}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.name}
                      </span>
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}

          {/* 7. Desfazer amizade */}
          <ContextMenu.Item
            onSelect={() => setPendingConfirmation("remove")}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 14,
              color: "var(--text-normal)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              outline: "none",
            }}
            className="hover-bg-modifier-selected"
          >
            <UserMinus size={16} />
            Desfazer amizade
          </ContextMenu.Item>

          {/* 8. Bloquear */}
          <ContextMenu.Item
            onSelect={() => setPendingConfirmation("block")}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 14,
              color: "var(--status-dnd)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              outline: "none",
            }}
            className="hover-bg-modifier-selected"
          >
            <Ban size={16} color="var(--status-dnd)" />
            Bloquear
          </ContextMenu.Item>

          <ContextMenu.Separator style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />

          {/* 9. Silenciar Usuário Globalmente */}
          {userMuted ? (
            <ContextMenu.Item
              onSelect={() => unmuteUser(userId)}
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: 14,
                color: "var(--text-normal)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                outline: "none",
              }}
              className="hover-bg-modifier-selected"
            >
              <Bell size={16} />
              Dessilenciar Usuário
            </ContextMenu.Item>
          ) : (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 14,
                  color: "var(--text-normal)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  outline: "none",
                }}
                className="hover-bg-modifier-selected"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <BellOff size={16} />
                  Silenciar Usuário
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
                    boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-subtle)",
                    zIndex: 1001,
                  }}
                >
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteUser(userId, MUTE_DURATIONS.FIFTEEN_MINS)}
                  >
                    Por 15 minutos
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteUser(userId, MUTE_DURATIONS.ONE_HOUR)}
                  >
                    Por 1 hora
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteUser(userId, MUTE_DURATIONS.EIGHT_HOURS)}
                  >
                    Por 8 horas
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteUser(userId, MUTE_DURATIONS.TWENTY_FOUR_HOURS)}
                  >
                    Por 24 horas
                  </ContextMenu.Item>
                  <ContextMenu.Separator style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteUser(userId, MUTE_DURATIONS.PERMANENT)}
                  >
                    Até que eu reative
                  </ContextMenu.Item>
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}

          {/* Silenciar Usuário no Servidor Específico */}
          {guildId && (
            userMutedInGuild ? (
              <ContextMenu.Item
                onSelect={() => unmuteUserInGuild(guildId, userId)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 14,
                  color: "var(--text-normal)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  outline: "none",
                }}
                className="hover-bg-modifier-selected"
              >
                <ShieldAlert size={16} />
                Dessilenciar no Servidor
              </ContextMenu.Item>
            ) : (
              <ContextMenu.Sub>
                <ContextMenu.SubTrigger
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 14,
                    color: "var(--text-normal)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    outline: "none",
                  }}
                  className="hover-bg-modifier-selected"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ShieldOff size={16} />
                    Silenciar no Servidor
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
                      boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
                      border: "1px solid var(--border-subtle)",
                      zIndex: 1001,
                    }}
                  >
                    <ContextMenu.Item
                      className="hover-bg-brand"
                      style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                      onClick={() => muteUserInGuild(guildId, userId, MUTE_DURATIONS.FIFTEEN_MINS)}
                    >
                      Por 15 minutos
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="hover-bg-brand"
                      style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                      onClick={() => muteUserInGuild(guildId, userId, MUTE_DURATIONS.ONE_HOUR)}
                    >
                      Por 1 hora
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="hover-bg-brand"
                      style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                      onClick={() => muteUserInGuild(guildId, userId, MUTE_DURATIONS.EIGHT_HOURS)}
                    >
                      Por 8 horas
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="hover-bg-brand"
                      style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                      onClick={() => muteUserInGuild(guildId, userId, MUTE_DURATIONS.TWENTY_FOUR_HOURS)}
                    >
                      Por 24 horas
                    </ContextMenu.Item>
                    <ContextMenu.Separator style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />
                    <ContextMenu.Item
                      className="hover-bg-brand"
                      style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                      onClick={() => muteUserInGuild(guildId, userId, MUTE_DURATIONS.PERMANENT)}
                    >
                      Até que eu reative
                    </ContextMenu.Item>
                  </ContextMenu.SubContent>
                </ContextMenu.Portal>
              </ContextMenu.Sub>
            )
          )}

          <ContextMenu.Separator style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />

          {/* 10. Copiar ID do usuário */}
          <ContextMenu.Item
            onSelect={handleCopyUserId}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 14,
              color: "var(--text-normal)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              outline: "none",
            }}
            className="hover-bg-modifier-selected"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Copy size={16} />
              Copiar ID do usuário
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                background: "var(--bg-tertiary)",
                padding: "2px 5px",
                borderRadius: 4,
                color: "var(--text-muted)",
              }}
            >
              ID
            </span>
          </ContextMenu.Item>

          {/* 11. Copiar ID do canal (se houver canal) */}
          {targetChannelId && (
            <ContextMenu.Item
              onSelect={handleCopyChannelId}
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: 14,
                color: "var(--text-normal)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                outline: "none",
              }}
              className="hover-bg-modifier-selected"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Hash size={16} />
                Copiar ID do canal
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: "var(--bg-tertiary)",
                  padding: "2px 5px",
                  borderRadius: 4,
                  color: "var(--text-muted)",
                }}
              >
                ID
              </span>
            </ContextMenu.Item>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
    <AppTextDialog
      open={noteDialogOpen}
      onOpenChange={setNoteDialogOpen}
      title="Adicionar nota"
      description="Esta nota é visível apenas para você."
      label="Nota"
      value={noteValue}
      onValueChange={setNoteValue}
      submitLabel="Salvar nota"
      onSubmit={saveNote}
    />
    <AppConfirmDialog
      open={pendingConfirmation === "remove"}
      onOpenChange={(open) => !open && setPendingConfirmation(null)}
      title="Remover amigo?"
      description="Você deixará de ser amigo desta pessoa."
      confirmLabel="Remover amigo"
      destructive
      onConfirm={handleRemoveFriend}
    />
    <AppConfirmDialog
      open={pendingConfirmation === "block"}
      onOpenChange={(open) => !open && setPendingConfirmation(null)}
      title="Bloquear usuário?"
      description="Você não receberá novas mensagens desta pessoa."
      confirmLabel="Bloquear usuário"
      destructive
      onConfirm={handleBlockUser}
    />
    </>
  );
}
