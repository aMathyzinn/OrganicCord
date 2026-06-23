import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100000,
        animation: "fadeIn 150ms ease-out",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-lg)",
          padding: 24,
          width: 400,
          maxWidth: "90vw",
          boxShadow: "var(--shadow-lg)",
          animation: visible ? "fadeIn 200ms ease-out" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: danger ? "rgba(237,66,69,0.15)" : "rgba(88,101,242,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={20} style={{ color: danger ? "var(--text-danger)" : "var(--brand-500)" }} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-normal)", margin: 0 }}>
            {title}
          </h3>
        </div>

        <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
          {message}
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            className="hover-border-muted"
            style={{
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 18px",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              transition: "border-color 150ms",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: danger ? "var(--text-danger)" : "var(--brand-500)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "8px 18px",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              transition: "opacity 150ms",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
