import React, { useState, useEffect } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import { X } from "lucide-react";
import { MyAccountSettings } from "./tabs/MyAccountSettings";
import { VoiceVideoSettings } from "./tabs/VoiceVideoSettings";
import { AppearanceSettings } from "./tabs/AppearanceSettings";
import { PrivacySettings } from "./tabs/PrivacySettings";
import { NotificationsSettings } from "./tabs/NotificationsSettings";
import { KeybindsSettings } from "./tabs/KeybindsSettings";

type SettingsTab = "account" | "voice" | "appearance" | "privacy" | "notifications" | "keybinds";

export function SettingsOverlay() {
  const { isSettingsOpen, closeSettings } = useNavigationStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSettingsOpen) {
        closeSettings();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsOpen, closeSettings]);

  if (!isSettingsOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "var(--bg-primary)",
        display: "flex",
        animation: "popIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Left Sidebar */}
      <div
        style={{
          width: "30%",
          minWidth: 180,
          maxWidth: 260,
          background: "var(--bg-secondary)",
          display: "flex",
          justifyContent: "flex-end",
          padding: "clamp(20px, 4vh, 60px) 16px clamp(20px, 4vh, 60px) 0",
          overflowY: "auto",
        }}
      >
        <div style={{ width: "100%", maxWidth: 220, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ padding: "0 10px 6px", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Configurações de Usuário
          </div>
          
          <TabButton 
            active={activeTab === "account"} 
            onClick={() => setActiveTab("account")}
          >
            Minha Conta
          </TabButton>
          <TabButton 
            active={activeTab === "privacy"} 
            onClick={() => setActiveTab("privacy")}
          >
            Privacidade e Segurança
          </TabButton>
          
          <div style={{ height: 1, background: "var(--border-subtle)", margin: "8px 10px" }} />
          
          <div style={{ padding: "0 10px 6px", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginTop: 8 }}>
            Configurações do App
          </div>
          <TabButton 
            active={activeTab === "appearance"} 
            onClick={() => setActiveTab("appearance")}
          >
            Aparência
          </TabButton>
          <TabButton 
            active={activeTab === "voice"} 
            onClick={() => setActiveTab("voice")}
          >
            Voz e Vídeo
          </TabButton>
          <TabButton 
            active={activeTab === "notifications"} 
            onClick={() => setActiveTab("notifications")}
          >
            Notificações
          </TabButton>
          <TabButton 
            active={activeTab === "keybinds"} 
            onClick={() => setActiveTab("keybinds")}
          >
            Atalhos de Teclado
          </TabButton>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          background: "var(--bg-primary)",
          padding: "clamp(20px, 4vh, 60px) clamp(20px, 3vw, 40px)",
          display: "flex",
          justifyContent: "flex-start",
          position: "relative",
          overflowY: "auto",
        }}
      >
        <div style={{ maxWidth: 740, width: "100%", paddingRight: 60 }}>
          {activeTab === "account" && <MyAccountSettings />}
          {activeTab === "privacy" && <PrivacySettings />}
          {activeTab === "voice" && <VoiceVideoSettings />}
          {activeTab === "appearance" && <AppearanceSettings />}
          {activeTab === "notifications" && <NotificationsSettings />}
          {activeTab === "keybinds" && <KeybindsSettings />}
        </div>

        {/* Close Button Area */}
        <div style={{ position: "fixed", top: "clamp(16px, 3vh, 40px)", right: "clamp(16px, 3vw, 40px)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 100000 }}>
          <button
            onClick={closeSettings}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "2px solid var(--text-muted)",
              background: "var(--bg-secondary)",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
            className="hover-color-normal hover-border-normal"
          >
            <X size={18} />
          </button>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginTop: 4 }}>ESC</span>
        </div>
      </div>
    </div>
  );
}

function TabButton({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={!active ? "hover-bg-modifier hover-color-normal" : ""}
      style={{
        background: active ? "var(--bg-modifier-selected)" : "transparent",
        color: active ? "var(--interactive-active)" : "var(--interactive-normal)",
        border: "none",
        borderRadius: "var(--radius-sm)",
        padding: "8px 10px",
        fontSize: 15,
        fontWeight: 500,
        textAlign: "left",
        cursor: "pointer",
        transition: "background 100ms",
      }}
    >
      {children}
    </button>
  );
}
