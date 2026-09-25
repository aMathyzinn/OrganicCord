import { FileUp, ShieldAlert } from "lucide-react";

interface Props {
  isDragging: boolean;
  canUpload: boolean;
  targetName: string;
}

export function ChatDropOverlay({ isDragging, canUpload, targetName }: Props) {
  if (!isDragging) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 999,
        background: canUpload
          ? "rgba(9, 11, 15, 0.88)"
          : "rgba(18, 10, 12, 0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        pointerEvents: "none",
        animation: "hubFadeIn 180ms ease-out",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 20,
          border: `2px dashed ${canUpload ? "rgba(88, 101, 242, 0.7)" : "rgba(242, 63, 67, 0.7)"}`,
          background: canUpload
            ? "radial-gradient(circle, rgba(88,101,242,0.12) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(242,63,67,0.12) 0%, transparent 70%)",
          boxShadow: canUpload
            ? "inset 0 0 48px rgba(88, 101, 242, 0.15), 0 0 32px rgba(88, 101, 242, 0.2)"
            : "inset 0 0 48px rgba(242, 63, 67, 0.15), 0 0 32px rgba(242, 63, 67, 0.2)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          textAlign: "center",
          transition: "all 200ms ease",
        }}
      >
        {/* Animated Badge Icon */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: canUpload
              ? "rgba(88, 101, 242, 0.15)"
              : "rgba(242, 63, 67, 0.15)",
            border: `2px solid ${canUpload ? "rgba(88, 101, 242, 0.4)" : "rgba(242, 63, 67, 0.4)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: canUpload
              ? "0 8px 24px rgba(88, 101, 242, 0.3)"
              : "0 8px 24px rgba(242, 63, 67, 0.3)",
            animation: "hubPopIn 250ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {canUpload ? (
            <FileUp size={40} color="#5865F2" />
          ) : (
            <ShieldAlert size={40} color="#F23F43" />
          )}
        </div>

        {/* Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 400 }}>
          <h3
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            {canUpload ? "Solte os arquivos para enviar" : "Sem permissão para upload"}
          </h3>
          <p
            style={{
              fontSize: 14,
              color: canUpload ? "var(--text-muted)" : "rgba(242, 63, 67, 0.9)",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {canUpload ? (
              <>
                Enviar diretamente em <strong style={{ color: "#fff" }}>#{targetName}</strong>
              </>
            ) : (
              <>
                Você não possui a permissão de <strong>Anexar Arquivos</strong> neste canal.
              </>
            )}
          </p>
        </div>

        {/* Pill Badge */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: canUpload ? "var(--brand-500)" : "var(--text-danger)",
            background: canUpload ? "rgba(88,101,242,0.12)" : "rgba(242,63,67,0.12)",
            border: `1px solid ${canUpload ? "rgba(88,101,242,0.25)" : "rgba(242,63,67,0.25)"}`,
            padding: "6px 16px",
            borderRadius: 100,
            letterSpacing: "0.01em",
            marginTop: 4,
          }}
        >
          {canUpload
            ? "Qualquer tipo de arquivo • Imagens, vídeos, docs"
            : "Permissão reservada a administradores ou membros com ATTACH_FILES"}
        </div>
      </div>
    </div>
  );
}
