import { useState, useRef, useEffect } from "react";
import { useAccountStore } from "@/stores/accountStore";
import type { StoredAccount } from "@/types";
import { QrLoginStep } from "./QrLoginStep";
import {
  Key,
  Smartphone,
  MonitorSmartphone,
  AlertTriangle,
  X,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { startDiscordLogin, cancelDiscordLogin } from "@/lib/tauri";
import { listen } from "@tauri-apps/api/event";

interface Props {
  onClose: () => void;
  onSuccess: (account: StoredAccount) => void;
}

type Step = "method" | "token" | "qrcode" | "validating" | "success" | "error";

export function AddAccountModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("method");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { addAccount, acceptAccount } = useAccountStore();

  useEffect(() => {
    if (step === "token") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [step]);

  useEffect(() => {
    const unlisten = listen<{ account: StoredAccount }>("discord-account-added", async (event) => {
      setStep("validating");
      const account = await acceptAccount(event.payload.account);
      setStep("success");
      toast.success(`${account.username} conectado!`);
      setTimeout(() => onSuccess(account), 800);
    });
    return () => { unlisten.then((f) => f()); };
  }, [acceptAccount, onSuccess]);

  useEffect(() => {
    const unlisten = listen<{ message: string }>("discord-login-error", (event) => {
      setErrorMsg(event.payload.message);
      setStep("error");
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    const unlisten = listen("discord-login-cancelled", () => {
      setStep("method");
      setErrorMsg("");
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleTokenSubmit = async () => {
    const trimmed = token.trim();
    if (!trimmed) { setErrorMsg("Cole seu token para continuar."); return; }
    setToken("");
    setStep("validating");
    setErrorMsg("");
    try {
      const account = await addAccount(trimmed);
      setStep("success");
      toast.success(`${account.username} conectado!`);
      setTimeout(() => onSuccess(account), 800);
    } catch (e) {
      setErrorMsg(String(e).replace(/^Error:\s*/, ""));
      setStep("error");
    }
  };

  return (
    <div
      style={mStyles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={mStyles.modal}>
        {/* Close button */}
        <button onClick={onClose} style={mStyles.closeBtn} title="Fechar">
          <X size={18} />
        </button>

        {/* Header — always visible */}
        <div style={mStyles.header}>
          <h2 style={mStyles.title}>Adicionar Conta</h2>
          <p style={mStyles.subtitle}>
            {step === "method" && "Conecte outra conta Discord à sua sessão."}
            {step === "token" && "Cole o token de acesso da conta."}
            {step === "qrcode" && "Escaneie o QR Code com o app Discord."}
            {step === "validating" && "Verificando credenciais..."}
            {step === "success" && "Conta conectada com sucesso!"}
            {step === "error" && "Ocorreu um erro ao conectar."}
          </p>
        </div>

        {/* Content */}
        <div style={mStyles.content}>
          {step === "method" && (
            <MethodStep
              onWebviewMethod={async () => {
                setStep("validating");
                try {
                  await startDiscordLogin();
                } catch (e) {
                  setErrorMsg(String(e).replace(/^Error:\s*/, ""));
                  setStep("error");
                }
              }}
              onTokenMethod={() => setStep("token")}
              onQrMethod={() => setStep("qrcode")}
              onClose={onClose}
            />
          )}

          {step === "qrcode" && (
            <QrLoginStep
              onBack={() => setStep("method")}
              onSuccess={(account) => {
                setStep("success");
                setTimeout(() => onSuccess(account), 800);
              }}
            />
          )}

          {(step === "token" || step === "error") && (
            <TokenStep
              token={token}
              setToken={setToken}
              showToken={showToken}
              setShowToken={setShowToken}
              onSubmit={handleTokenSubmit}
              onBack={() => { setStep("method"); setErrorMsg(""); }}
              inputRef={inputRef}
              error={errorMsg}
            />
          )}

          {step === "validating" && (
            <ValidatingStep
              onCancel={() => {
                cancelDiscordLogin().catch(() => {});
                setStep("method");
              }}
            />
          )}
          {step === "success" && <SuccessStep />}
        </div>
      </div>
    </div>
  );
}

// ─── Method Step ──────────────────────────────────────────────────────────────

function MethodStep({
  onWebviewMethod,
  onTokenMethod,
  onQrMethod,
  onClose,
}: {
  onWebviewMethod: () => void;
  onTokenMethod: () => void;
  onQrMethod: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <MethodCard
        title="Janela do Discord (Recomendado)"
        description="Abre discord.com e importa a sessão localmente. Fluxo experimental e não oficial."
        icon={<MonitorSmartphone size={22} />}
        onClick={onWebviewMethod}
        highlight
      />
      <MethodCard
        title="Login via QR Code"
        description="Escaneie com o aplicativo Discord. Compatibilidade em validação nesta Beta."
        icon={<Smartphone size={22} />}
        onClick={onQrMethod}
      />
      <MethodCard
        title="Token avançado"
        description="Use somente se você já administra o token com segurança."
        icon={<Key size={22} />}
        onClick={onTokenMethod}
      />

      <div style={mStyles.divider} />

      <button onClick={onClose} style={mStyles.cancelBtn}>
        Cancelar
      </button>
    </div>
  );
}

function MethodCard({
  title,
  description,
  icon,
  onClick,
  highlight = false,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...mStyles.methodCard,
        background: highlight ? "rgba(88,101,242,0.08)" : "rgba(255,255,255,0.02)",
        borderColor: highlight ? "rgba(88,101,242,0.35)" : "rgba(255,255,255,0.07)",
        boxShadow: "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "translateY(1px)";
      }}
    >
      {/* Icon */}
      <div
        style={{
          ...mStyles.methodIcon,
          color: "var(--text-muted)",
          background: "rgba(255,255,255,0.05)",
        }}
      >
        {icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={{ ...mStyles.methodTitle, color: "var(--text-normal)" }}>
          {title}
        </div>
        <div style={mStyles.methodDesc}>{description}</div>
      </div>

    </button>
  );
}

// ─── Token Step ───────────────────────────────────────────────────────────────

function TokenStep({
  token,
  setToken,
  showToken,
  setShowToken,
  onSubmit,
  onBack,
  inputRef,
  error,
}: {
  token: string;
  setToken: (v: string) => void;
  showToken: boolean;
  setShowToken: (v: boolean) => void;
  onSubmit: () => void;
  onBack: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  error: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Warning */}
      <div style={mStyles.warningBox}>
        <AlertTriangle size={14} style={{ flexShrink: 0 }} />
        <span>
          <strong>Tokens são sensíveis.</strong> Nunca compartilhe com ninguém.
          Eles são criptografados localmente e enviados apenas aos serviços do Discord para autenticar suas ações.
        </span>
      </div>

      {/* Field */}
      <div>
        <label style={mStyles.fieldLabel}>Token Discord</label>
        <div style={{ position: "relative", marginTop: 8 }}>
          <input
            ref={inputRef}
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            placeholder="Cole seu token aqui..."
            style={{
              ...mStyles.tokenInput,
              borderColor: error ? "var(--text-danger)" : "rgba(255,255,255,0.08)",
            }}
            onFocus={(e) => {
              if (!error) {
                e.currentTarget.style.borderColor = "var(--brand-500)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(88,101,242,0.15)";
              }
            }}
            onBlur={(e) => {
              if (!error) {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.boxShadow = "none";
              }
            }}
          />
          <button
            onClick={() => setShowToken(!showToken)}
            style={mStyles.eyeBtn}
          >
            {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {error && <p style={mStyles.errorText}>{error}</p>}
      </div>

      {/* Token safety */}
      <details style={{ fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
        <summary style={{ fontWeight: 600, marginBottom: 8, cursor: "pointer" }}>
          Por que este método é avançado?
        </summary>
        <p style={{ lineHeight: 1.6, margin: 0 }}>
          Um token dá acesso à conta. OrganicCord não ensina a extraí-lo. Prefira a janela do Discord ou o QR e use uma conta não crítica durante a Beta.
        </p>
      </details>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} style={mStyles.backBtn}>
          ← Voltar
        </button>
        <button
          onClick={onSubmit}
          disabled={!token.trim()}
          style={{
            ...mStyles.submitBtn,
            opacity: token.trim() ? 1 : 0.45,
            cursor: token.trim() ? "pointer" : "not-allowed",
          }}
        >
          <ShieldCheck size={16} />
          Conectar
        </button>
      </div>
    </div>
  );
}

// ─── State Steps ──────────────────────────────────────────────────────────────

function ValidatingStep({ onCancel }: { onCancel: () => void }) {
  return (
    <div style={mStyles.stateCenter}>
      <svg
        width="44"
        height="44"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--brand-500)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="spin-animation"
        style={{ animation: "spin 800ms linear infinite" }}
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <p style={mStyles.stateLabel}>Conectando conta...</p>
      <p style={mStyles.stateSubLabel}>Validando com o Discord</p>
      <button
        onClick={onCancel}
        style={{
          marginTop: 12,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: "8px 22px",
          color: "var(--text-muted)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 150ms ease",
        }}
      >
        Cancelar
      </button>
    </div>
  );
}

function SuccessStep() {
  return (
    <div style={{ ...mStyles.stateCenter, animation: "hubFadeIn 300ms ease-out" }}>
      <div style={mStyles.successCircle}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#23a55a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <p style={{ ...mStyles.stateLabel, color: "var(--status-online)" }}>
        Conta conectada!
      </p>
      <p style={mStyles.stateSubLabel}>Entrando no OrganicCord...</p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    animation: "hubFadeIn 180ms ease-out",
  },
  modal: {
    background: "#111316",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16,
    padding: "32px 36px",
    width: 460,
    maxWidth: "92vw",
    boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset",
    animation: "hubPopIn 280ms cubic-bezier(0.16, 1, 0.3, 1)",
    position: "relative",
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 8,
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 7,
    transition: "all 150ms ease",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 800,
    color: "#fff",
    letterSpacing: "-0.02em",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  },
  content: {},
  methodCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 12,
    border: "1px solid transparent",
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
    transition: "all 180ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    position: "relative",
  },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  methodTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 3,
    letterSpacing: "-0.01em",
  },
  methodDesc: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.4,
  },
  recBadge: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.06em",
    background: "linear-gradient(135deg, #5865f2 0%, #4752c4 100%)",
    color: "#fff",
    padding: "3px 8px",
    borderRadius: 100,
    flexShrink: 0,
    boxShadow: "0 2px 8px rgba(88,101,242,0.3)",
  },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.06)",
    margin: "4px 0",
  },
  cancelBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 14,
    padding: "8px 0",
    textAlign: "center",
    width: "100%",
    transition: "color 150ms ease",
  },
  warningBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    background: "rgba(240,178,50,0.08)",
    border: "1px solid rgba(240,178,50,0.2)",
    borderRadius: 10,
    padding: "11px 14px",
    fontSize: 13,
    color: "#c4982a",
    lineHeight: 1.5,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
  },
  tokenInput: {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "11px 44px 11px 14px",
    fontSize: 14,
    color: "var(--text-normal)",
    fontFamily: "'Fira Code', 'Courier New', monospace",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
    userSelect: "text",
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    padding: 4,
  },
  errorText: {
    fontSize: 13,
    color: "var(--text-danger)",
    marginTop: 6,
    lineHeight: 1.4,
  },
  kbd: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "1px 6px",
    borderRadius: 4,
    fontFamily: "monospace",
    fontSize: 11,
  },
  backBtn: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "10px 18px",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    transition: "all 150ms ease",
  },
  submitBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "linear-gradient(135deg, #5865f2 0%, #4752c4 100%)",
    border: "none",
    borderRadius: 10,
    padding: "10px 22px",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    transition: "all 150ms ease",
  },
  stateCenter: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: "32px 0",
    textAlign: "center",
  },
  spinner: {
    width: 44,
    height: 44,
    border: "3px solid rgba(255,255,255,0.08)",
    borderTopColor: "var(--brand-500)",
    borderRadius: "50%",
    animation: "hubSpin 700ms linear infinite",
  },
  stateLabel: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-normal)",
  },
  stateSubLabel: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  successCircle: {
    width: 56,
    height: 56,
    background: "rgba(35,165,90,0.12)",
    border: "2px solid rgba(35,165,90,0.4)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
