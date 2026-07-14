import React from "react";
import { Shield, Lock, EyeOff } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";

export function PrivacySettings() {
  const { settings, updateSetting } = useSettingsStore();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 200ms ease" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)", marginBottom: 8 }}>
        Privacidade e Segurança
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
          Mensagens Diretas
        </h3>
        
        <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-normal)" }}>
              Permitir mensagens diretas de membros do servidor
            </div>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
              Esta configuração é aplicada quando você entra em um novo servidor.
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input 
              type="checkbox" 
              checked={settings.allowServerDMs} 
              onChange={(e) => updateSetting("allowServerDMs", e.target.checked)}
              style={{ width: 24, height: 24, cursor: "pointer", accentColor: "var(--brand-500)" }} 
            />
          </label>
        </div>

        <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-normal)" }}>
              Filtrar conteúdo explícito nas DMs
            </div>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
              Proteja-se de imagens indesejadas em mensagens diretas.
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input 
              type="checkbox" 
              checked={settings.filterExplicitDMs} 
              onChange={(e) => updateSetting("filterExplicitDMs", e.target.checked)}
              style={{ width: 24, height: 24, cursor: "pointer", accentColor: "var(--brand-500)" }} 
            />
          </label>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)", margin: "8px 0" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
          Quem pode te adicionar como amigo
        </h3>
        
        {["Todos", "Amigos de amigos", "Membros do servidor"].map(label => (
          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border-subtle)", paddingBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-normal)" }}>{label}</div>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" defaultChecked style={{ width: 20, height: 20, cursor: "pointer", accentColor: "var(--brand-500)" }} />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
