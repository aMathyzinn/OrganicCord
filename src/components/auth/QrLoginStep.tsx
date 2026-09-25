import { useEffect, useState, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { startQrLogin, cancelQrLogin } from "@/lib/tauri";
import type { StoredAccount } from "@/types";
import { useAccountStore } from "@/stores/accountStore";
import { Smartphone, AlertTriangle, RefreshCw } from "lucide-react";

type QrPhase =
  | { kind: "loading" }
  | { kind: "ready"; pngB64: string; fingerprint: string }
  | { kind: "scanned"; username: string }
  | { kind: "confirmed" }
  | { kind: "error"; message: string };

interface QrEvent {
  type: "qr_ready" | "scanned" | "confirmed" | "error" | "cancelled";
  png_b64?: string;
  fingerprint?: string;
  username?: string;
  account?: StoredAccount;
  message?: string;
}

interface Props {
  onBack: () => void;
  onSuccess: (account: StoredAccount) => void;
  /** When true, renders without back-button (embedded in WelcomeHub panel) */
  compact?: boolean;
}

export function QrLoginStep({ onBack, onSuccess, compact = false }: Props) {
  const [phase, setPhase] = useState<QrPhase>({ kind: "loading" });
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const { acceptAccount } = useAccountStore();

  useEffect(() => {
    let active = true;

    async function setup() {
      unlistenRef.current = await listen<QrEvent>("qr_login_event", async (event) => {
        if (!active) return;
        const payload = event.payload;

        switch (payload.type) {
          case "qr_ready":
            setPhase({
              kind: "ready",
              pngB64: payload.png_b64!,
              fingerprint: payload.fingerprint!,
            });
            break;
          case "scanned":
            setPhase({ kind: "scanned", username: payload.username! });
            break;
          case "confirmed":
            setPhase({ kind: "confirmed" });
            try {
              if (!payload.account) throw new Error("O backend não retornou a conta autenticada.");
              const account = await acceptAccount(payload.account);
              setTimeout(() => {
                if (active) onSuccess(account);
              }, 700);
            } catch (e) {
              setPhase({ kind: "error", message: String(e) });
            }
            break;
          case "error":
            setPhase({ kind: "error", message: payload.message || "Erro desconhecido" });
            break;
          case "cancelled":
            setPhase({ kind: "error", message: "Login cancelado no dispositivo." });
            break;
        }
      });

      await startQrLogin();
    }

    setup().catch((e) => {
      if (active) setPhase({ kind: "error", message: String(e) });
    });

    return () => {
      active = false;
      unlistenRef.current?.();
      cancelQrLogin().catch(() => {});
    };
  }, [acceptAccount, onSuccess]);

  const handleRetry = () => {
    setPhase({ kind: "loading" });
    startQrLogin().catch((e) =>
      setPhase({ kind: "error", message: String(e) })
    );
  };

  // Derive step states
  const stepAberto = phase.kind !== "loading";
  const stepEscaneado = phase.kind === "scanned" || phase.kind === "confirmed";
  const stepConfirmado = phase.kind === "confirmed";

  return (
    <div style={qrStyles.wrapper}>
      {/* QR Container */}
      <div style={qrStyles.qrContainer}>
        {/* Scanner corner brackets */}
        <div style={{ ...qrStyles.bracket, top: 6, left: 6, borderRight: "none", borderBottom: "none" }} />
        <div style={{ ...qrStyles.bracket, top: 6, right: 6, borderLeft: "none", borderBottom: "none" }} />
        <div style={{ ...qrStyles.bracket, bottom: 6, left: 6, borderRight: "none", borderTop: "none" }} />
        <div style={{ ...qrStyles.bracket, bottom: 6, right: 6, borderLeft: "none", borderTop: "none" }} />

        {phase.kind === "loading" && (
          <div style={qrStyles.loadingInner}>
            <QrSpinner />
          </div>
        )}

        {phase.kind === "ready" && (
          <img
            src={`data:image/png;base64,${phase.pngB64}`}
            alt="QR Code Discord"
            style={qrStyles.qrImage}
          />
        )}

        {phase.kind === "scanned" && (
          <div style={qrStyles.phaseOverlay}>
            <Smartphone size={36} style={{ color: "var(--brand-500)" }} />
            <span style={qrStyles.overlayLabel}>Aguardando confirmação...</span>
          </div>
        )}

        {phase.kind === "confirmed" && (
          <div style={qrStyles.phaseOverlay}>
            <div style={qrStyles.successCircle}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#23a55a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
        )}

        {phase.kind === "error" && (
          <div style={qrStyles.phaseOverlay}>
            <AlertTriangle size={32} style={{ color: "var(--text-warning)" }} />
            <button onClick={handleRetry} style={qrStyles.retryButton}>
              <RefreshCw size={13} />
              Tentar novamente
            </button>
          </div>
        )}
      </div>

      {/* Status text */}
      <div style={qrStyles.statusArea}>
        {phase.kind === "loading" && (
          <p style={qrStyles.statusMuted}>Gerando QR Code...</p>
        )}
        {phase.kind === "ready" && (
          <>
            <p style={qrStyles.statusNormal}>Escaneie com o app Discord no celular</p>
            <p style={qrStyles.statusMuted}>Perfil → Escanear QR Code</p>
          </>
        )}
        {phase.kind === "scanned" && (
          <>
            <p style={{ ...qrStyles.statusNormal, color: "var(--status-online)" }}>
              QR escaneado por <strong>{(phase as { kind: "scanned"; username: string }).username}</strong>
            </p>
            <p style={qrStyles.statusMuted}>Confirme o login no seu celular</p>
          </>
        )}
        {phase.kind === "confirmed" && (
          <p style={{ ...qrStyles.statusNormal, color: "var(--status-online)" }}>
            Conectado! Adicionando conta...
          </p>
        )}
        {phase.kind === "error" && (
          <p style={{ ...qrStyles.statusNormal, color: "var(--text-danger)", fontSize: 13 }}>
            {(phase as { kind: "error"; message: string }).message}
          </p>
        )}
      </div>

      {/* Progress steps */}
      {(phase.kind === "ready" || phase.kind === "scanned" || phase.kind === "confirmed") && (
        <div style={qrStyles.steps}>
          <Step label="Abra o Discord no celular" done={stepAberto} active={!stepAberto} />
          <StepConnector done={stepEscaneado} />
          <Step label="Escaneie o código" done={stepEscaneado} active={phase.kind === "ready"} />
          <StepConnector done={stepConfirmado} />
          <Step label="Confirme no celular" done={stepConfirmado} active={phase.kind === "scanned"} />
        </div>
      )}

      {/* Back button — hidden in compact mode */}
      {!compact && phase.kind !== "confirmed" && (
        <button
          onClick={() => {
            cancelQrLogin().catch(() => {});
            onBack();
          }}
          style={qrStyles.backButton}
        >
          ← Voltar
        </button>
      )}
    </div>
  );
}

// ─── Step indicator ─────────────────────────────────────────────────────────

function Step({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div style={qrStyles.step}>
      <div
        style={{
          ...qrStyles.stepDot,
          background: done
            ? "var(--status-online)"
            : active
            ? "var(--brand-500)"
            : "rgba(255,255,255,0.1)",
          boxShadow: active ? "0 0 0 4px rgba(88,101,242,0.2)" : "none",
          transition: "all 250ms ease",
        }}
      >
        {done && (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <span
        style={{
          fontSize: 12,
          color: done || active ? "var(--text-normal)" : "var(--text-muted)",
          fontWeight: done || active ? 500 : 400,
          transition: "color 250ms ease",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function StepConnector({ done }: { done: boolean }) {
  return (
    <div
      style={{
        height: 1,
        flex: 1,
        background: done
          ? "var(--status-online)"
          : "rgba(255,255,255,0.08)",
        transition: "background 300ms ease",
        marginTop: -12,
        alignSelf: "flex-start",
        marginLeft: 0,
        marginRight: 0,
      }}
    />
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function QrSpinner() {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        border: "3px solid rgba(255,255,255,0.08)",
        borderTopColor: "var(--brand-500)",
        borderRadius: "50%",
        animation: "hubSpin 700ms linear infinite",
      }}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const qrStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  qrContainer: {
    width: 200,
    height: 200,
    background: "#fff",
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    boxShadow: "0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  bracket: {
    position: "absolute",
    width: 18,
    height: 18,
    border: "2.5px solid rgba(35,165,90,0.8)",
    borderRadius: 3,
    zIndex: 2,
    transition: "opacity 300ms ease",
  },
  qrImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    borderRadius: 10,
  },
  loadingInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.05)",
    width: "100%",
    height: "100%",
  },
  phaseOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(4px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
  },
  overlayLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#fff",
    textAlign: "center",
  },
  successCircle: {
    width: 52,
    height: 52,
    background: "rgba(35,165,90,0.15)",
    border: "2px solid rgba(35,165,90,0.5)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  retryButton: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(255,255,255,0.1)",
    border: "none",
    borderRadius: 8,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 600,
    color: "#fff",
    cursor: "pointer",
  },
  statusArea: {
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  statusNormal: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-normal)",
  },
  statusMuted: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  steps: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 320,
  },
  step: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    flex: "0 0 auto",
    maxWidth: 80,
    textAlign: "center",
  },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 13,
    padding: "4px 0",
    marginTop: 4,
    transition: "color 150ms ease",
  },
};
