import React, { useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { COLOR_THEMES, APP_ICONS, applyTheme } from "@/lib/themeManager";
import { OrganicMark } from "@/components/ui/OrganicMark";
import { Sparkles, RefreshCw, Check, Palette, Sliders, Eye } from "lucide-react";

export function AppearanceSettings() {
  const { settings, updateSetting } = useSettingsStore();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [previewingTheme, setPreviewingTheme] = useState<string | null>(null);

  const activeThemeId = previewingTheme || settings.theme;

  const handleSelectTheme = (themeId: string) => {
    setPreviewingTheme(null);
    updateSetting("theme", themeId);
  };

  const handlePreviewTheme = (themeId: string) => {
    setPreviewingTheme(themeId);
    applyTheme({ ...settings, theme: themeId });
  };

  const handleCustomColorChange = (key: keyof Required<typeof settings>["customThemeColors"], val: string) => {
    const updatedColors = {
      bgPrimary: settings.customThemeColors?.bgPrimary || "#1e1f22",
      bgSecondary: settings.customThemeColors?.bgSecondary || "#2b2d31",
      bgTertiary: settings.customThemeColors?.bgTertiary || "#111214",
      brandColor: settings.customThemeColors?.brandColor || "#5865f2",
      textColor: settings.customThemeColors?.textColor || "#dbdee1",
      [key]: val,
    };
    updateSetting("customThemeColors", updatedColors);
    updateSetting("theme", "custom");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, animation: "fadeIn 200ms ease" }}>
      {/* Título Principal */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-normal)", margin: 0 }}>Aparência</h2>
        {previewingTheme && (
          <button
            onClick={() => {
              setPreviewingTheme(null);
              applyTheme(settings);
            }}
            style={{
              background: "var(--brand-500)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Eye size={14} /> Restaurar Tema Ativo
          </button>
        )}
      </div>

      {/* ─── 1. Temas Padrão ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Tema
          </h3>
        </div>

        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Temas padrão</div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {/* Claro */}
          <ThemeCard
            label="Claro"
            active={activeThemeId === "light"}
            bg="#ffffff"
            borderColor="#e3e5e8"
            onClick={() => handleSelectTheme("light")}
            onMouseEnter={() => handlePreviewTheme("light")}
            onMouseLeave={() => { setPreviewingTheme(null); applyTheme(settings); }}
          />
          {/* Escuro */}
          <ThemeCard
            label="Escuro"
            active={activeThemeId === "dark"}
            bg="#313338"
            borderColor="#2b2d31"
            onClick={() => handleSelectTheme("dark")}
            onMouseEnter={() => handlePreviewTheme("dark")}
            onMouseLeave={() => { setPreviewingTheme(null); applyTheme(settings); }}
          />
          {/* Meia-noite */}
          <ThemeCard
            label="Meia-noite"
            active={activeThemeId === "midnight"}
            bg="#111214"
            borderColor="#1e1f22"
            onClick={() => handleSelectTheme("midnight")}
            onMouseEnter={() => handlePreviewTheme("midnight")}
            onMouseLeave={() => { setPreviewingTheme(null); applyTheme(settings); }}
          />
          {/* Preto Puro */}
          <ThemeCard
            label="Preto Puro"
            active={activeThemeId === "black"}
            bg="#000000"
            borderColor="#111111"
            onClick={() => handleSelectTheme("midnight")}
            onMouseEnter={() => handlePreviewTheme("midnight")}
            onMouseLeave={() => { setPreviewingTheme(null); applyTheme(settings); }}
          />
          {/* Sincronizar com SO */}
          <div
            onClick={() => handleSelectTheme("system")}
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--radius-md)",
              border: activeThemeId === "system" ? "3px solid var(--brand-500)" : "1px solid var(--border-subtle)",
              background: "var(--bg-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
            }}
            title="Sincronizar com o Sistema"
          >
            <RefreshCw size={20} color="var(--text-normal)" />
            {activeThemeId === "system" && <ActiveBadge />}
          </div>
        </div>
      </div>

      {/* ─── Banner Nitro: Deixe o Discord do seu jeito ───────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(88, 101, 242, 0.15) 0%, rgba(244, 127, 255, 0.15) 100%)",
          border: "1px solid rgba(88, 101, 242, 0.3)",
          borderRadius: "var(--radius-lg)",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ background: "var(--brand-500)", width: 44, height: 44, borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Palette size={24} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-normal)" }}>
              Deixe o OrganicCord do seu jeito
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              Crie seu próprio tema personalizado alterando cores primárias, fundo e destaque.
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowCustomPicker(!showCustomPicker)}
          style={{
            background: "var(--brand-500)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
            transition: "transform 100ms",
          }}
        >
          {showCustomPicker ? "Fechar Construtor" : "Experimentar"}
        </button>
      </div>

      {/* Painel Construtor de Tema Personalizado */}
      {showCustomPicker && (
        <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-normal)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Sliders size={18} /> Construtor de Tema Personalizado
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
            <ColorPickerItem label="Fundo Principal" value={settings.customThemeColors?.bgPrimary || "#1e1f22"} onChange={(v) => handleCustomColorChange("bgPrimary", v)} />
            <ColorPickerItem label="Barra Lateral" value={settings.customThemeColors?.bgSecondary || "#2b2d31"} onChange={(v) => handleCustomColorChange("bgSecondary", v)} />
            <ColorPickerItem label="Cor de Destaque" value={settings.customThemeColors?.brandColor || "#5865f2"} onChange={(v) => handleCustomColorChange("brandColor", v)} />
            <ColorPickerItem label="Texto Principal" value={settings.customThemeColors?.textColor || "#dbdee1"} onChange={(v) => handleCustomColorChange("textColor", v)} />
          </div>
        </div>
      )}

      {/* ─── 2. Temas Coloridos (Gradientes Estilo Nitro) ────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
            Temas Coloridos
          </h3>
          <Sparkles size={16} color="var(--brand-500)" />
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Escolha uma paleta vibrante com gradientes sutis para personalizar toda a interface.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(68px, 1fr))", gap: 12 }}>
          {COLOR_THEMES.map((theme) => {
            const isActive = activeThemeId === theme.id;
            return (
              <div
                key={theme.id}
                onClick={() => handleSelectTheme(theme.id)}
                onMouseEnter={() => handlePreviewTheme(theme.id)}
                onMouseLeave={() => { setPreviewingTheme(null); applyTheme(settings); }}
                title={theme.name}
                style={{
                  height: 56,
                  borderRadius: "var(--radius-md)",
                  background: theme.gradient,
                  border: isActive ? "3px solid var(--brand-500)" : "1px solid var(--border-subtle)",
                  cursor: "pointer",
                  position: "relative",
                  boxShadow: isActive ? "0 0 12px var(--brand-500)" : "none",
                  transition: "transform 150ms, border-color 150ms",
                }}
              >
                {isActive && <ActiveBadge />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Toggles adicionais de sincronização */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ToggleItem
          label="Sincronizar tema em meus dispositivos"
          checked={settings.syncThemeWithOS}
          onChange={(v) => updateSetting("syncThemeWithOS", v)}
        />
        <ToggleItem
          label="Aplicar tema aos perfis de outros usuários"
          checked={settings.applyOtherUsersThemes}
          onChange={(v) => updateSetting("applyOtherUsersThemes", v)}
        />
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)" }} />

      {/* ─── 3. Ícone do Aplicativo ────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-normal)", margin: 0 }}>
              Ícone do aplicativo
            </h3>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              Altere o ícone no app do OrganicCord.
            </div>
          </div>

          <div style={{ background: "var(--bg-secondary)", padding: "6px 14px", borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
            Ícone de prévia
          </div>
        </div>

        {/* Grid de Ícones de Aplicativo */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(68px, 1fr))", gap: 12, marginTop: 8 }}>
          {APP_ICONS.map((icon) => {
            const isActive = (settings.appIcon || "default") === icon.id;
            return (
              <div
                key={icon.id}
                onClick={() => updateSetting("appIcon", icon.id)}
                title={icon.name}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "16px",
                    background: icon.bgGradient,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    border: isActive ? "3px solid var(--brand-500)" : "1px solid var(--border-subtle)",
                    boxShadow: isActive ? "0 0 10px var(--brand-500)" : "0 2px 6px rgba(0,0,0,0.3)",
                    transition: "transform 150ms",
                  }}
                >
                  <OrganicMark size={38} overrideIconId={icon.id} />
                  {isActive && <ActiveBadge />}
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: 60 }}>
                  {icon.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)" }} />

      {/* ─── 4. Mensagens e Exibição de Chat ───────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
          Exibição de Mensagens
        </h3>

        {/* Cozy vs Compact */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div
            onClick={() => updateSetting("displayMode", "cozy")}
            style={{
              background: "var(--bg-secondary)",
              border: settings.displayMode === "cozy" ? "2px solid var(--brand-500)" : "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: 16,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              position: "relative",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)" }}>Achegado (Padrão)</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Moderne com avatares e exibição completa.</div>
            {settings.displayMode === "cozy" && <ActiveBadge />}
          </div>

          <div
            onClick={() => updateSetting("displayMode", "compact")}
            style={{
              background: "var(--bg-secondary)",
              border: settings.displayMode === "compact" ? "2px solid var(--brand-500)" : "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: 16,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              position: "relative",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)" }}>Compacto (Estilo IRC)</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Agrupa mensagens sem repetir avatares.</div>
            {settings.displayMode === "compact" && <ActiveBadge />}
          </div>
        </div>

        {/* Tamanho da Fonte */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--text-normal)", fontWeight: 500 }}>
            <span>Tamanho da Fonte das Mensagens</span>
            <span>{settings.fontSize || 15}px</span>
          </div>
          <input
            type="range"
            min="12"
            max="24"
            value={settings.fontSize || 15}
            onChange={(e) => updateSetting("fontSize", parseInt(e.target.value))}
            style={{ width: "100%", cursor: "pointer", accentColor: "var(--brand-500)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: 12 }}>
            <span>12px</span>
            <span>15px</span>
            <span>24px</span>
          </div>
        </div>

        {/* Espaçamento entre mensagens */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--text-normal)", fontWeight: 500 }}>
            <span>Espaçamento entre Grupos de Mensagens</span>
            <span>{settings.messageSpacing || 16}px</span>
          </div>
          <input
            type="range"
            min="0"
            max="24"
            value={settings.messageSpacing || 16}
            onChange={(e) => updateSetting("messageSpacing", parseInt(e.target.value))}
            style={{ width: "100%", cursor: "pointer", accentColor: "var(--brand-500)" }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Componentes Auxiliares ──────────────────────────────────────────────────

interface ThemeCardProps {
  label: string;
  active: boolean;
  bg: string;
  borderColor: string;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ThemeCard({ label, active, bg, borderColor, onClick, onMouseEnter, onMouseLeave }: ThemeCardProps) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width: 56,
        height: 56,
        borderRadius: "var(--radius-md)",
        background: bg,
        border: active ? "3px solid var(--brand-500)" : `1px solid ${borderColor}`,
        cursor: "pointer",
        position: "relative",
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        transition: "transform 150ms",
      }}
      title={label}
    >
      {active && <ActiveBadge />}
    </div>
  );
}

function ActiveBadge() {
  return (
    <div
      style={{
        position: "absolute",
        top: -4,
        right: -4,
        background: "var(--brand-500)",
        color: "#fff",
        borderRadius: "50%",
        width: 18,
        height: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
      }}
    >
      <Check size={12} strokeWidth={3} />
    </div>
  );
}

function ToggleItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-normal)" }}>{label}</span>
      <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 20, height: 20, cursor: "pointer", accentColor: "var(--brand-500)" }}
        />
      </label>
    </div>
  );
}

function ColorPickerItem({ label, value, onChange }: { label: string; value: string; onChange: (val: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: value, flexShrink: 0 }} />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-normal)",
            padding: "6px 8px",
            fontSize: 13,
            outline: "none",
          }}
        />
      </div>
    </div>
  );
}
