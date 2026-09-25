import { useEffect } from "react";
import { useExternalLinkStore } from "@/stores/externalLinkStore";
import { ExternalLink, ShieldAlert, X } from "lucide-react";

export function ExternalLinkModal() {
  const { isOpen, targetUrl, error, confirmOpen, closeModal } = useExternalLinkStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeModal]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeIn 150ms ease",
      }}
      onClick={closeModal}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-link-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 16px 32px rgba(0,0,0,0.5)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          animation: "popIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          position: "relative",
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          aria-label="Fechar aviso de link externo"
          onClick={closeModal}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 4,
          }}
          className="hover-color-normal"
        >
          <X size={18} />
        </button>

        {/* Header Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              background: "rgba(88, 101, 242, 0.15)",
              color: "var(--brand-500)",
              width: 36,
              height: 36,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ExternalLink size={20} />
          </div>
          <h3 id="external-link-title" style={{ fontSize: 18, fontWeight: 700, color: "var(--text-normal)", margin: 0 }}>
            Você está saindo do OrganicCord
          </h3>
        </div>

        <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.5 }}>
          Você está prestes a acessar um site externo. Certifique-se de que confia no destino antes de prosseguir.
        </div>

        {/* Target URL Box */}
        <div
          style={{
            background: "var(--bg-tertiary)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
            border: "1px solid var(--border-subtle)",
            fontSize: 13,
            fontFamily: "monospace",
            color: "var(--brand-500)",
            wordBreak: "break-all",
            maxHeight: 90,
            overflowY: "auto",
            userSelect: "text",
          }}
        >
          {targetUrl}
        </div>

        {/* Warning Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
          <ShieldAlert size={14} color="#f0b232" />
          <span>Nunca insira sua senha ou chave de acesso em sites desconhecidos.</span>
        </div>

        {error && <div role="alert" style={{ color: "var(--status-danger)", fontSize: 13, lineHeight: 1.4 }}>{error}</div>}

        {/* Actions Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={closeModal}
            style={{
              background: "transparent",
              color: "var(--text-normal)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
            className="hover-underline"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmOpen()}
            disabled={Boolean(error?.includes("bloqueou"))}
            style={{
              background: "var(--brand-500)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: error?.includes("bloqueou") ? "not-allowed" : "pointer",
              opacity: error?.includes("bloqueou") ? 0.55 : 1,
              boxShadow: "0 2px 6px rgba(88, 101, 242, 0.4)",
              transition: "transform 100ms",
            }}
          >
            Visitar site
          </button>
        </div>
      </div>
    </div>
  );
}
