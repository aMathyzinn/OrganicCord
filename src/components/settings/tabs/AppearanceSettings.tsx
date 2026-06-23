import React from "react";

export function AppearanceSettings() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, animation: "fadeIn 200ms ease" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)", margin: 0 }}>Aparência</h2>
      
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: 0 }}>Tema</h3>
        
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{
            background: "var(--bg-secondary)",
            border: "2px solid var(--brand-500)",
            borderRadius: "var(--radius-md)",
            padding: 16,
            flex: 1,
            cursor: "pointer",
            position: "relative"
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)" }}>Escuro (Padrão)</div>
            <div style={{ position: "absolute", top: 16, right: 16, background: "var(--brand-500)", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
              ✓
            </div>
          </div>

          <div style={{
            background: "var(--bg-secondary)",
            border: "2px solid transparent",
            borderRadius: "var(--radius-md)",
            padding: 16,
            flex: 1,
            cursor: "not-allowed",
            opacity: 0.5
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)" }}>Claro (Em breve)</div>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: 0 }}>Tamanho da Fonte do Bate-papo</h3>
        <div style={{ padding: "0 8px" }}>
          <input type="range" min="12" max="24" defaultValue="15" disabled style={{ width: "100%", cursor: "not-allowed", opacity: 0.5 }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, color: "var(--text-muted)", fontSize: 12 }}>
            <span>12px</span>
            <span>15px</span>
            <span>24px</span>
          </div>
        </div>
      </div>
    </div>
  );
}
