import { useEffect, useState, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { startQrLogin, cancelQrLogin } from "@/lib/tauri";
import type { StoredAccount } from "@/types";
import { useAccountStore } from "@/stores/accountStore";
import { Smartphone, AlertTriangle } from "lucide-react";

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
  token?: string;
  message?: string;
}

interface Props {
  onBack: () => void;
  onSuccess: (account: StoredAccount) => void;
}

export function QrLoginStep({ onBack, onSuccess }: Props) {
  const [phase, setPhase] = useState<QrPhase>({ kind: "loading" });
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const { addAccount: storeAddAccount } = useAccountStore();

  useEffect(() => {
    let active = true;

    async function setup() {
      // Subscribe to events before starting
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
            // Add the account using the received token
            try {
              const account = await storeAddAccount(payload.token!);
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
  }, []);

  const handleRetry = () => {
    setPhase({ kind: "loading" });
    startQrLogin().catch((e) =>
      setPhase({ kind: "error", message: String(e) })
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
      }}
    >
      {/* QR display area */}
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 12,
          width: 220,
          height: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
        }}
      >
        {phase.kind === "loading" && (
          <Spinner />
        )}

        {phase.kind === "ready" && (
          <img
            src={`data:image/png;base64,${phase.pngB64}`}
            alt="QR Code Discord"
            style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8 }}
          />
        )}

        {phase.kind === "scanned" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: 12,
              textAlign: "center",
            }}
          >
            <Smartphone size={40} />
            <div style={{ fontSize: 13, color: "#333", fontWeight: 600, lineHeight: 1.4 }}>
              Aguardando confirmação no app...
            </div>
          </div>
        )}

        {phase.kind === "confirmed" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                background: "rgba(35,165,90,0.15)",
                border: "2px solid #23a55a",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
              }}
            >
              ✓
            </div>
          </div>
        )}

        {phase.kind === "error" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              textAlign: "center",
            }}
          >
            <AlertTriangle size={36} style={{ color: "var(--text-warning)" }} />
          </div>
        )}
      </div>

      {/* Status text */}
      <div style={{ textAlign: "center" }}>
        {phase.kind === "loading" && (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Gerando QR Code...
          </p>
        )}

        {phase.kind === "ready" && (
          <>
            <p
              style={{
                color: "var(--text-normal)",
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Escaneie com o app Discord
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
              Abra o Discord no celular → ícone do perfil → escanear QR Code
            </p>
          </>
        )}

        {phase.kind === "scanned" && (
          <>
            <p
              style={{
                color: "var(--text-positive)",
                fontSize: 15,
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              QR escaneado!
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Confirme o login no seu celular como{" "}
              <strong style={{ color: "var(--text-normal)" }}>
                {(phase as { kind: "scanned"; username: string }).username}
              </strong>
            </p>
          </>
        )}

        {phase.kind === "confirmed" && (
          <p
            style={{
              color: "var(--text-positive)",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            Conectado! Adicionando conta...
          </p>
        )}

        {phase.kind === "error" && (
          <>
            <p
              style={{
                color: "var(--text-danger)",
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Falha no login via QR
            </p>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                lineHeight: 1.4,
                marginBottom: 12,
              }}
            >
              {(phase as { kind: "error"; message: string }).message}
            </p>
            <button
              onClick={handleRetry}
              style={{
                background: "var(--brand-500)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "8px 18px",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Tentar novamente
            </button>
          </>
        )}
      </div>

      {/* Back button */}
      {phase.kind !== "confirmed" && (
        <button
          onClick={() => {
            cancelQrLogin().catch(() => {});
            onBack();
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 13,
            padding: "4px 0",
          }}
        >
          ← Voltar
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        border: "3px solid #e0e0e0",
        borderTopColor: "#5865F2",
        borderRadius: "50%",
        animation: "spin 800ms linear infinite",
      }}
    />
  );
}
