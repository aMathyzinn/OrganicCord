import { useState, useRef, useEffect } from "react";
import { useAccountStore } from "@/stores/accountStore";
import type { StoredAccount } from "@/types";
import { QrLoginStep } from "./QrLoginStep";
import { Key, Smartphone, AlertTriangle, MonitorSmartphone } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { startDiscordLogin } from "@/lib/tauri";
import { listen } from "@tauri-apps/api/event";

interface Props {
  onClose: () => void;
  onSuccess: (account: StoredAccount) => void;
}

type Step = "method" | "token" | "qrcode" | "validating" | "success" | "error";

export function AddAccountModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("method");
  const [token, setToken] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { addAccount } = useAccountStore();

  useEffect(() => {
    if (step === "token") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [step]);

  useEffect(() => {
    const unlisten = listen<{ token: string }>("discord-token-extracted", async (event) => {
      const extractedToken = event.payload.token;
      if (extractedToken) {
        setToken(extractedToken);
        setStep("validating");
        try {
          const account = await addAccount(extractedToken);
          setStep("success");
          toast.success(`Conta ${account.username} conectada com sucesso!`);
          setTimeout(() => onSuccess(account), 800);
        } catch (e) {
          setErrorMsg(String(e).replace(/^Error:\s*/, ""));
          setStep("error");
        }
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [addAccount, onSuccess]);

  // Fecha com ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleTokenSubmit = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setErrorMsg("Por favor, cole seu token.");
      return;
    }

    setStep("validating");
    setErrorMsg("");

    try {
      const account = await addAccount(trimmed);
      setStep("success");
      toast.success(`Conta ${account.username} conectada com sucesso!`);
      setTimeout(() => onSuccess(account), 800);
    } catch (e) {
      setErrorMsg(String(e).replace(/^Error:\s*/, ""));
      setStep("error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleTokenSubmit();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        animation: "fadeIn 200ms ease-out",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "rgba(43, 45, 49, 0.95)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "var(--radius-lg)",
          padding: "36px 40px",
          width: 480,
          maxWidth: "90vw",
          boxShadow: "0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02) inset",
          animation: "popIn 300ms cubic-bezier(0.16, 1, 0.3, 1)",
          position: "relative",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--text-normal)",
              marginBottom: 6,
            }}
          >
            Adicionar Conta
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.5 }}>
            Conecte uma conta Discord usando seu token de acesso.
          </p>
        </div>

        {/* Conteúdo por etapa */}
        {step === "method" && (
          <MethodStep
            onWebviewMethod={async () => {
              setStep("validating");
              try {
                await startDiscordLogin();
              } catch(e) {
                console.error(e);
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
            onSubmit={handleTokenSubmit}
            onBack={() => setStep("method")}
            onKeyDown={handleKeyDown}
            inputRef={inputRef}
            error={errorMsg}
          />
        )}

        {step === "validating" && (
          <ValidatingStep />
        )}

        {step === "success" && (
          <SuccessStep />
        )}
      </div>
    </div>
  );
}

// --- Sub-componentes das etapas ---

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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <MethodCard
        title="Login Padrão (Usuário e Senha)"
        description="Abre a página oficial de login do Discord. Suporta 2FA e Captcha."
        icon={<MonitorSmartphone size={28} />}
        onClick={onWebviewMethod}
        recommended
      />
      <MethodCard
        title="Login com Token"
        description="Cole diretamente o token da sua conta Discord."
        icon={<Key size={28} />}
        onClick={onTokenMethod}
      />
      <MethodCard
        title="Login via QR Code"
        description="Escaneie o QR com o app Discord no celular."
        icon={<Smartphone size={28} />}
        onClick={onQrMethod}
      />
      <button
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          marginTop: 8,
          fontSize: 14,
          padding: "8px 0",
        }}
      >
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
  recommended,
  disabled,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  recommended?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "transparent" : (recommended ? "rgba(88, 101, 242, 0.05)" : "rgba(30, 31, 34, 0.6)"),
        border: `1px solid ${disabled ? "var(--border-subtle)" : (recommended ? "rgba(88, 101, 242, 0.5)" : "rgba(255,255,255,0.05)")}`,
        borderRadius: "12px",
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        cursor: disabled ? "not-allowed" : "pointer",
        width: "100%",
        textAlign: "left",
        opacity: disabled ? 0.5 : 1,
        boxShadow: recommended ? "0 4px 20px rgba(88, 101, 242, 0.15)" : "0 2px 10px rgba(0,0,0,0.2)",
        transition: "all 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.background = recommended ? "rgba(88, 101, 242, 0.1)" : "rgba(43, 45, 49, 0.9)";
          e.currentTarget.style.borderColor = recommended ? "rgba(88, 101, 242, 0.8)" : "rgba(255,255,255,0.15)";
          e.currentTarget.style.boxShadow = recommended ? "0 8px 30px rgba(88, 101, 242, 0.25)" : "0 8px 20px rgba(0,0,0,0.3)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.background = recommended ? "rgba(88, 101, 242, 0.05)" : "rgba(30, 31, 34, 0.6)";
          e.currentTarget.style.borderColor = recommended ? "rgba(88, 101, 242, 0.5)" : "rgba(255,255,255,0.05)";
          e.currentTarget.style.boxShadow = recommended ? "0 4px 20px rgba(88, 101, 242, 0.15)" : "0 2px 10px rgba(0,0,0,0.2)";
        }
      }}
    >
      <span style={{ flexShrink: 0, display: "flex", color: recommended ? "#5865F2" : "var(--interactive-normal)" }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: recommended ? "#fff" : "var(--text-normal)",
            marginBottom: 4,
            letterSpacing: "-0.01em"
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.4 }}>{description}</div>
      </div>
      {recommended && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            background: "linear-gradient(135deg, #5865F2 0%, #4752C4 100%)",
            color: "#fff",
            padding: "4px 10px",
            borderRadius: "100px",
            boxShadow: "0 2px 8px rgba(88, 101, 242, 0.4)"
          }}
        >
          Recomendado
        </span>
      )}
    </button>
  );
}

function TokenStep({
  token,
  setToken,
  onSubmit,
  onBack,
  onKeyDown,
  inputRef,
  error,
}: {
  token: string;
  setToken: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  error: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Aviso de segurança */}
      <div
        style={{
          background: "rgba(250, 166, 26, 0.1)",
          border: "1px solid rgba(250, 166, 26, 0.3)",
          borderRadius: "var(--radius-md)",
          padding: "12px 14px",
          fontSize: 13,
          color: "var(--text-warning)",
          lineHeight: 1.5,
        }}
      >
        <AlertTriangle size={14} style={{ flexShrink: 0 }} /> <strong>Nunca compartilhe seu token</strong> — ele dá acesso total à sua conta.
        O OrganicCord armazena tokens criptografados localmente, nunca os envia para servidores externos.
      </div>

      {/* Input do token */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 8,
          }}
        >
          Token Discord
        </label>
        <input
          ref={inputRef}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Cole seu token aqui..."
          style={{
            width: "100%",
            background: "var(--bg-tertiary)",
            border: `1px solid ${error ? "var(--text-danger)" : "var(--bg-accent)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            fontSize: 14,
            color: "var(--text-normal)",
            transition: "border-color 150ms",
            userSelect: "text",
          }}
          onFocus={(e) => {
            if (!error) (e.target as HTMLInputElement).style.borderColor = "var(--brand-500)";
          }}
          onBlur={(e) => {
            if (!error) (e.target as HTMLInputElement).style.borderColor = "var(--bg-accent)";
          }}
        />
        {error && (
          <p
            style={{
              fontSize: 13,
              color: "var(--text-danger)",
              marginTop: 6,
              lineHeight: 1.4,
            }}
          >
            {error}
          </p>
        )}
      </div>

      {/* Como obter o token */}
      <details
        style={{
          fontSize: 13,
          color: "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <summary style={{ fontWeight: 600, marginBottom: 8 }}>
          Como obter meu token?
        </summary>
        <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
          <li>Abra o Discord no navegador (discord.com)</li>
          <li>Pressione <kbd style={{ background: "var(--bg-accent)", padding: "1px 5px", borderRadius: 3 }}>F12</kbd> para abrir o DevTools</li>
          <li>Vá em <strong>Application → Local Storage → discord.com</strong></li>
          <li>Procure por <code style={{ color: "var(--text-link)" }}>token</code></li>
          <li>Copie o valor entre aspas</li>
        </ol>
      </details>

      {/* Botões */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: "1px solid var(--bg-accent)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 18px",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Voltar
        </button>
        <button
          onClick={onSubmit}
          disabled={!token.trim()}
          style={{
            background: token.trim() ? "var(--brand-500)" : "var(--bg-accent)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "10px 22px",
            color: token.trim() ? "#fff" : "var(--text-muted)",
            cursor: token.trim() ? "pointer" : "not-allowed",
            fontSize: 14,
            fontWeight: 600,
            transition: "background 150ms",
          }}
        >
          Conectar
        </button>
      </div>
    </div>
  );
}

function ValidatingStep() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "24px 0",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          border: "3px solid var(--bg-accent)",
          borderTopColor: "var(--brand-500)",
          borderRadius: "50%",
          animation: "spin 800ms linear infinite",
        }}
      />
      <div style={{ color: "var(--text-muted)", fontSize: 14 }}>
        Validando token e conectando...
      </div>
    </div>
  );
}

function SuccessStep() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "24px 0",
        animation: "fadeIn 200ms ease-out",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          background: "rgba(35, 165, 90, 0.15)",
          border: "2px solid var(--status-online)",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
        }}
      >
        ✓
      </div>
      <div
        style={{
          color: "var(--text-positive)",
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        Conta conectada com sucesso!
      </div>
    </div>
  );
}
