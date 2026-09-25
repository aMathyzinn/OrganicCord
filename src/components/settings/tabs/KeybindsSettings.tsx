import React from "react";
import { Info, Keyboard } from "lucide-react";

export function KeybindsSettings() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 200ms ease" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)", marginBottom: 8 }}>
        Atalhos de Teclado
      </h2>

      <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
        <Keyboard size={48} color="var(--brand-500)" />
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-normal)", marginBottom: 4 }}>
            Controle o OrganicCord rapidamente
          </h3>
          <p style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 400 }}>
            Estes atalhos funcionam enquanto a janela do OrganicCord está ativa.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 13 }}>
          <Info size={15} /> Atalhos globais personalizáveis ainda não estão disponíveis.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
          Atalhos Padrão do Sistema
        </h3>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { action: "Alternar Mudo (Mute)", bind: "Ctrl + Shift + M" },
            { action: "Alternar Fone (Deafen)", bind: "Ctrl + Shift + D" },
            { action: "Alternar modo furtivo", bind: "Ctrl + Shift + ." },
          ].map(shortcut => (
            <div key={shortcut.action} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-secondary)", padding: "12px 16px", borderRadius: "var(--radius-sm)" }}>
              <span style={{ fontSize: 14, color: "var(--text-normal)", fontWeight: 500 }}>{shortcut.action}</span>
              <kbd style={{ background: "var(--bg-tertiary)", padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>
                {shortcut.bind}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
