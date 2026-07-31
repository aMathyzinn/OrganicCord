import React from "react";
import { Monitor, BellOff, VolumeX } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useNotificationStore } from "@/stores/notificationStore";

function formatRemainingTime(expiresAt: number | null): string {
  if (expiresAt === null) return "Até ser reativado";
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) return "Expirando...";
  const mins = Math.ceil(remainingMs / (60 * 1000));
  if (mins < 60) return `${mins} min restantes`;
  const hours = Math.ceil(mins / 60);
  return `${hours} horas restantes`;
}

export function NotificationsSettings() {
  const { settings, updateSetting } = useSettingsStore();
  const {
    mutedGuilds,
    mutedChannels,
    mutedUsers,
    mutedUserGuilds,
    unmuteGuild,
    unmuteChannel,
    unmuteUser,
    unmuteUserInGuild,
  } = useNotificationStore();

  const activeMutedGuilds = Object.entries(mutedGuilds).filter(([_, exp]) => exp === null || exp > Date.now());
  const activeMutedChannels = Object.entries(mutedChannels).filter(([_, exp]) => exp === null || exp > Date.now());
  const activeMutedUsers = Object.entries(mutedUsers).filter(([_, exp]) => exp === null || exp > Date.now());
  const activeMutedUserGuilds = Object.entries(mutedUserGuilds).filter(([_, exp]) => exp === null || exp > Date.now());

  const totalMuted = activeMutedGuilds.length + activeMutedChannels.length + activeMutedUsers.length + activeMutedUserGuilds.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 200ms ease" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)", marginBottom: 8 }}>
        Notificações
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
          Notificações no Desktop
        </h3>
        
        <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ background: "var(--bg-tertiary)", padding: 8, borderRadius: "50%" }}>
              <Monitor size={20} color="var(--text-normal)" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-normal)" }}>
                Ativar Notificações no Desktop
              </div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
                Receba alertas nativos do sistema operacional quando receber menções ou DMs.
              </div>
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input 
              type="checkbox" 
              checked={settings.desktopNotifications} 
              onChange={(e) => updateSetting("desktopNotifications", e.target.checked)}
              style={{ width: 24, height: 24, cursor: "pointer", accentColor: "var(--brand-500)" }} 
            />
          </label>
        </div>

        <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-normal)" }}>
              Piscar barra de tarefas
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input 
              type="checkbox" 
              checked={settings.flashTaskbar} 
              onChange={(e) => updateSetting("flashTaskbar", e.target.checked)}
              style={{ width: 24, height: 24, cursor: "pointer", accentColor: "var(--brand-500)" }} 
            />
          </label>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)", margin: "8px 0" }} />

      {/* Seção de Silenciados */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
          Itens Silenciados ({totalMuted})
        </h3>

        {totalMuted === 0 ? (
          <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
            Nenhum servidor, canal ou usuário silenciado no momento.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeMutedGuilds.map(([id, exp]) => (
              <div key={`guild-${id}`} style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <BellOff size={18} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)" }}>Servidor ({id})</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{formatRemainingTime(exp)}</div>
                  </div>
                </div>
                <button
                  onClick={() => unmuteGuild(id)}
                  style={{ background: "var(--bg-tertiary)", border: "none", color: "var(--text-normal)", padding: "6px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
                >
                  Dessilenciar
                </button>
              </div>
            ))}

            {activeMutedChannels.map(([id, exp]) => (
              <div key={`channel-${id}`} style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <BellOff size={18} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)" }}>Canal ({id})</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{formatRemainingTime(exp)}</div>
                  </div>
                </div>
                <button
                  onClick={() => unmuteChannel(id)}
                  style={{ background: "var(--bg-tertiary)", border: "none", color: "var(--text-normal)", padding: "6px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
                >
                  Dessilenciar
                </button>
              </div>
            ))}

            {activeMutedUsers.map(([id, exp]) => (
              <div key={`user-${id}`} style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <VolumeX size={18} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)" }}>Usuário ({id})</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{formatRemainingTime(exp)}</div>
                  </div>
                </div>
                <button
                  onClick={() => unmuteUser(id)}
                  style={{ background: "var(--bg-tertiary)", border: "none", color: "var(--text-normal)", padding: "6px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
                >
                  Dessilenciar
                </button>
              </div>
            ))}

            {activeMutedUserGuilds.map(([key, exp]) => {
              const [guildId, userId] = key.split(":");
              return (
                <div key={`user-guild-${key}`} style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <VolumeX size={18} color="var(--text-muted)" />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)" }}>Usuário no Servidor ({userId})</div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{formatRemainingTime(exp)}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => unmuteUserInGuild(guildId, userId)}
                    style={{ background: "var(--bg-tertiary)", border: "none", color: "var(--text-normal)", padding: "6px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
                  >
                    Dessilenciar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)", margin: "8px 0" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
          Sons
        </h3>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Mensagem Direta", key: "soundDms" as const },
            { label: "Menção", key: "soundMentions" as const },
            { label: "Usuário Entrou na Call", key: "soundUserJoin" as const },
            { label: "Usuário Saiu da Call", key: "soundUserLeave" as const },
            { label: "Mudo Ativado", key: "soundMuteToggle" as const },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-normal)" }}>{item.label}</div>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                <input 
                  type="checkbox" 
                  checked={settings[item.key]} 
                  onChange={(e) => updateSetting(item.key, e.target.checked)}
                  style={{ width: 20, height: 20, cursor: "pointer", accentColor: "var(--brand-500)" }} 
                />
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
