import React from "react";
import { Monitor } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";

export function NotificationsSettings() {
  const { settings, updateSetting } = useSettingsStore();
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
