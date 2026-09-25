import { useState, useRef, useEffect } from "react";
import { useAccountStore } from "@/stores/accountStore";
import type { StoredAccount } from "@/types";
import { QrLoginStep } from "./QrLoginStep";
import { toast } from "@/components/ui/Toast";
import { startDiscordLogin, cancelDiscordLogin } from "@/lib/tauri";
import { listen } from "@tauri-apps/api/event";
import { OrganicMark } from "@/components/ui/OrganicMark";
import {
  MonitorSmartphone,
  Smartphone,
  Key,
  ShieldCheck,
  Zap,
  Users,
  Eye,
  EyeOff,
  AlertTriangle,
  ChevronRight,
  Lock,
  Globe,
  Cpu,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type AuthTab = "webview" | "qr" | "token";
type AuthStep = "idle" | "validating" | "success" | "error";
type FeatureTab = "multiaccounts" | "voice" | "privacy";

interface Props {
  onSuccess: (account: StoredAccount) => void;
}

// ─── Main WelcomeHub ─────────────────────────────────────────────────────────

export function WelcomeHub({ onSuccess }: Props) {
  const [authTab, setAuthTab] = useState<AuthTab>("webview");
  const [featureTab, setFeatureTab] = useState<FeatureTab>("multiaccounts");

  return (
    <div style={styles.root}>
      {/* Ambient glow orbs */}
      <div style={styles.glowGreen} />
      <div style={styles.glowBlue} />

      {/* Split layout */}
      <div style={styles.layout}>
        {/* ── Left: Hero Panel ── */}
        <HeroPanel activeFeature={featureTab} onFeatureChange={setFeatureTab} />

        {/* ── Right: Auth Panel ── */}
        <AuthPanel
          activeTab={authTab}
          onTabChange={setAuthTab}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  );
}

// ─── Hero Panel ──────────────────────────────────────────────────────────────

const FEATURES: {
  id: FeatureTab;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  headline: string;
  body: string;
  accent: string;
  glowColor: string;
}[] = [
  {
    id: "multiaccounts",
    icon: <Users size={20} />,
    label: "Multi-Conta Nativo",
    headline: "Gerencie várias contas Discord em simultâneo.",
    body: "Troque entre contas com um clique. Notificações separadas, sessões isoladas e barra lateral unificada — sem abrir um segundo app.",
    accent: "#5865f2",
    glowColor: "rgba(88, 101, 242, 0.15)",
  },
  {
    id: "voice",
    icon: <Zap size={20} />,
    label: "Voz e DAVE em validação",
    badge: "Beta",
    headline: "A negociação criptográfica falha de forma segura.",
    body: "O backend implementa a negociação DAVE sem downgrade para áudio aberto. A compatibilidade entre clientes ainda faz parte da matriz da Beta.",
    accent: "#23a55a",
    glowColor: "rgba(35, 165, 90, 0.15)",
  },
  {
    id: "privacy",
    icon: <ShieldCheck size={20} />,
    label: "Privacidade e Segurança",
    headline: "Sessões isoladas e armazenamento local.",
    body: "Cada conta é mantida em uma sessão separada neste dispositivo. O fluxo de login e compatibilidade do cliente seguem em validação durante a Beta.",
    accent: "#f0b232",
    glowColor: "rgba(240, 178, 50, 0.12)",
  },
];

function HeroPanel({
  activeFeature,
  onFeatureChange,
}: {
  activeFeature: FeatureTab;
  onFeatureChange: (f: FeatureTab) => void;
}) {
  const active = FEATURES.find((f) => f.id === activeFeature)!;

  return (
    <div style={{ ...styles.heroPanel, position: "relative" }}>
      {/* Background Chat Pattern with Fade */}
      <ChatBackgroundPattern />

      {/* Brand header */}
      <div style={{ ...styles.brandHeader, position: "relative", zIndex: 1 }}>
        <div style={styles.logoMark}>
          <OrganicMark size={22} />
        </div>
        <span style={styles.brandName}>OrganicCord</span>
        <span style={styles.versionBadge}>beta</span>
      </div>

      {/* Hero heading */}
      <div style={{ ...styles.heroContent, position: "relative", zIndex: 1 }}>
        <h1 style={styles.heroHeading}>
          Sua experiência Discord,{" "}
          <span style={{ color: active.accent, transition: "color 300ms ease" }}>
            elevada.
          </span>
        </h1>
        <p style={styles.heroSubtitle}>
          Um cliente não oficial, nativo e multi-conta, desenvolvido abertamente para Windows.
        </p>
      </div>

      {/* Feature cards */}
      <div style={{ ...styles.featureList, position: "relative", zIndex: 1 }}>
        {FEATURES.map((feature) => {
          const isActive = feature.id === activeFeature;
          return (
            <button
              key={feature.id}
              onClick={() => onFeatureChange(feature.id)}
              style={{
                ...styles.featureCard,
                background: isActive ? feature.glowColor : "rgba(255,255,255,0.02)",
                borderColor: isActive ? feature.accent + "40" : "rgba(255,255,255,0.06)",
                boxShadow: isActive
                  ? `0 0 0 1px ${feature.accent}28, 0 4px 20px rgba(0,0,0,0.2)`
                  : "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                }
              }}
            >
              <div
                style={{
                  ...styles.featureIcon,
                  color: isActive ? feature.accent : "var(--text-muted)",
                  background: isActive ? feature.accent + "18" : "rgba(255,255,255,0.04)",
                }}
              >
                {feature.icon}
              </div>
              <div style={styles.featureText}>
                <div
                  style={{
                    ...styles.featureLabel,
                    color: isActive ? "#fff" : "var(--text-normal)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>{feature.label}</span>
                  {feature.badge && (
                    <span style={styles.testBadge}>{feature.badge}</span>
                  )}
                </div>
                <div
                  style={{
                    ...styles.featureBody,
                    maxHeight: isActive ? 80 : 0,
                    opacity: isActive ? 1 : 0,
                    marginTop: isActive ? 4 : 0,
                  }}
                >
                  {feature.body}
                </div>
              </div>
              <ChevronRight
                size={16}
                style={{
                  color: isActive ? feature.accent : "var(--interactive-muted)",
                  transform: isActive ? "rotate(90deg)" : "none",
                  transition: "transform 200ms ease",
                  flexShrink: 0,
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Trust badges */}
      <div style={{ ...styles.trustRow, position: "relative", zIndex: 1 }}>
        <TrustBadge icon={<Cpu size={12} />} label="Tauri + Rust" />
        <TrustBadge icon={<Lock size={12} />} label="Sem backend próprio" />
        <TrustBadge icon={<Globe size={12} />} label="Conexão direta" />
      </div>
    </div>
  );
}

function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={styles.trustBadge}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

function ChatBackgroundPattern() {
  return (
    <div
      style={{
        position: "absolute",
        top: "-5%",
        left: "-5%",
        width: "110%",
        height: "110%",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        opacity: 0.07,
        maskImage:
          "radial-gradient(circle at 30% 40%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.25) 60%, transparent 88%)",
        WebkitMaskImage:
          "radial-gradient(circle at 30% 40%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.25) 60%, transparent 88%)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 18,
          padding: 32,
          height: "100%",
          width: "100%",
          transform: "scale(1.04) rotate(-1.5deg)",
          transformOrigin: "top left",
        }}
      >
        {/* Mock Server Bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 44, flexShrink: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: 16, background: "var(--brand-500)" }} />
          <div style={{ width: 44, height: 2, background: "rgba(255,255,255,0.2)", borderRadius: 1 }} />
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--status-online)" }} />
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.12)" }} />
        </div>

        {/* Mock Sidebar Channels */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 140, flexShrink: 0 }}>
          <div style={{ height: 16, width: 80, borderRadius: 4, background: "rgba(255,255,255,0.3)", marginBottom: 8 }} />
          <div style={{ height: 28, width: "100%", borderRadius: 6, background: "rgba(88,101,242,0.35)" }} />
          <div style={{ height: 28, width: "85%", borderRadius: 6, background: "rgba(255,255,255,0.08)" }} />
          <div style={{ height: 28, width: "90%", borderRadius: 6, background: "rgba(255,255,255,0.08)" }} />
          <div style={{ height: 28, width: "75%", borderRadius: 6, background: "rgba(255,255,255,0.08)" }} />
        </div>

        {/* Mock Chat Feed */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, paddingTop: 10 }}>
          {/* Message 1 */}
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--brand-500)", flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ height: 13, width: 80, borderRadius: 3, background: "#ffffff" }} />
                <div style={{ height: 10, width: 45, borderRadius: 3, background: "rgba(255,255,255,0.3)" }} />
              </div>
              <div style={{ height: 13, width: "88%", borderRadius: 3, background: "rgba(255,255,255,0.5)" }} />
              <div style={{ height: 13, width: "65%", borderRadius: 3, background: "rgba(255,255,255,0.35)" }} />
            </div>
          </div>

          {/* Message 2 (IA response preview) */}
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--status-online)", flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ height: 13, width: 110, borderRadius: 3, background: "var(--status-online)" }} />
                <div style={{ height: 10, width: 40, borderRadius: 3, background: "rgba(35,165,90,0.3)" }} />
              </div>
              <div style={{ height: 13, width: "95%", borderRadius: 3, background: "rgba(255,255,255,0.5)" }} />
              <div style={{ height: 13, width: "82%", borderRadius: 3, background: "rgba(255,255,255,0.4)" }} />
              <div style={{ height: 13, width: "50%", borderRadius: 3, background: "rgba(255,255,255,0.25)" }} />
            </div>
          </div>

          {/* Message 3 */}
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--text-warning)", flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ height: 13, width: 90, borderRadius: 3, background: "#ffffff" }} />
              </div>
              <div style={{ height: 13, width: "70%", borderRadius: 3, background: "rgba(255,255,255,0.4)" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Auth Panel ───────────────────────────────────────────────────────────────

function AuthPanel({
  activeTab,
  onTabChange,
  onSuccess,
}: {
  activeTab: AuthTab;
  onTabChange: (t: AuthTab) => void;
  onSuccess: (account: StoredAccount) => void;
}) {
  const [step, setStep] = useState<AuthStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addAccount, acceptAccount } = useAccountStore();

  // The backend persists credentials and only exposes the safe account record.
  useEffect(() => {
    const unlisten = listen<{ account: StoredAccount }>("discord-account-added", async (event) => {
      setStep("validating");
      const account = await acceptAccount(event.payload.account);
      setStep("success");
      toast.success(`${account.username} conectado!`);
      setTimeout(() => onSuccess(account), 900);
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

  // Listen for Discord webview login cancellation
  useEffect(() => {
    const unlisten = listen("discord-login-cancelled", () => {
      setStep("idle");
      setErrorMsg("");
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  // Focus token input when tab changes to token
  useEffect(() => {
    if (activeTab === "token") {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [activeTab]);

  const handleWebviewLogin = async () => {
    setStep("validating");
    setErrorMsg("");
    try {
      await startDiscordLogin();
    } catch (e) {
      setErrorMsg(String(e).replace(/^Error:\s*/, ""));
      setStep("error");
    }
  };

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
      setTimeout(() => onSuccess(account), 900);
    } catch (e) {
      setErrorMsg(String(e).replace(/^Error:\s*/, ""));
      setStep("error");
    }
  };

  const resetState = () => {
    setStep("idle");
    setErrorMsg("");
  };

  // Global states override tab content
  if (step === "validating") {
    return (
      <div style={styles.authPanel}>
        <ValidatingState
          onCancel={() => {
            cancelDiscordLogin().catch(() => {});
            setStep("idle");
          }}
        />
      </div>
    );
  }
  if (step === "success") {
    return (
      <div style={styles.authPanel}>
        <SuccessState />
      </div>
    );
  }

  return (
    <div style={styles.authPanel}>
      {/* Panel header */}
      <div style={styles.authHeader}>
        <h2 style={styles.authTitle}>Conectar Conta</h2>
        <p style={styles.authSubtitle}>Escolha como deseja entrar</p>
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {(
          [
            { id: "webview" as AuthTab, label: "Janela Discord", icon: <MonitorSmartphone size={14} /> },
            { id: "qr" as AuthTab, label: "QR Code", icon: <Smartphone size={14} /> },
            { id: "token" as AuthTab, label: "Token", icon: <Key size={14} /> },
          ] as const
        ).map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => { onTabChange(tab.id); resetState(); }}
              style={{
                ...styles.tabButton,
                color: isActive ? "#fff" : "var(--text-muted)",
                borderBottomColor: isActive ? "var(--brand-500)" : "transparent",
                background: isActive ? "rgba(88,101,242,0.06)" : "transparent",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={styles.tabContent}>
        {/* Error banner (shown in any tab on error) */}
        {step === "error" && errorMsg && (
          <div style={styles.errorBanner}>
            <AlertTriangle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {activeTab === "webview" && (
          <WebviewTab onLogin={handleWebviewLogin} />
        )}

        {activeTab === "qr" && (
          <QrTab onSuccess={onSuccess} />
        )}

        {activeTab === "token" && (
          <TokenTab
            token={token}
            setToken={setToken}
            showToken={showToken}
            setShowToken={setShowToken}
            onSubmit={handleTokenSubmit}
            inputRef={inputRef}
          />
        )}
      </div>
    </div>
  );
}

// ─── Tab: Webview ─────────────────────────────────────────────────────────────

function WebviewTab({ onLogin }: { onLogin: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Primary CTA */}
      <button
        onClick={onLogin}
        style={styles.primaryButton}
        onMouseEnter={(e) => {
          e.currentTarget.style.background =
            "linear-gradient(135deg, #6875f5 0%, #5865f2 100%)";
          e.currentTarget.style.boxShadow =
            "0 8px 28px rgba(88,101,242,0.4), inset 0 1px 0 rgba(255,255,255,0.15)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            "linear-gradient(135deg, #5865f2 0%, #4752c4 100%)";
          e.currentTarget.style.boxShadow =
            "0 4px 20px rgba(88,101,242,0.3), inset 0 1px 0 rgba(255,255,255,0.1)";
          e.currentTarget.style.transform = "translateY(0)";
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = "translateY(1px)";
          e.currentTarget.style.boxShadow =
            "0 2px 10px rgba(88,101,242,0.25)";
        }}
      >
        <MonitorSmartphone size={18} />
        <span>Abrir página de login</span>
      </button>

      {/* Security checklist */}
      <div style={styles.securityList}>
        {["Página carregada de discord.com", "2FA e Captcha tratados pelo Discord", "Sessão importada somente neste dispositivo"].map((item) => (
          <div key={item} style={styles.securityItem}>
            <div style={styles.securityDot} />
            <span>{item}</span>
          </div>
        ))}
      </div>

      {/* Info note */}
      <p style={styles.infoNote}>
        OrganicCord não é um cliente oficial e este fluxo não é uma integração OAuth2 suportada. A página recebe suas credenciais e o aplicativo importa localmente a sessão resultante. Use uma conta de testes nesta Beta.
      </p>
    </div>
  );
}

// ─── Tab: QR Code ─────────────────────────────────────────────────────────────

function QrTab({ onSuccess }: { onSuccess: (account: StoredAccount) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <QrLoginStep
        onBack={() => {}} // no-op: within hub, no modal to dismiss
        onSuccess={onSuccess}
        compact
      />
    </div>
  );
}

// ─── Tab: Token ───────────────────────────────────────────────────────────────

function TokenTab({
  token,
  setToken,
  showToken,
  setShowToken,
  onSubmit,
  inputRef,
}: {
  token: string;
  setToken: (v: string) => void;
  showToken: boolean;
  setShowToken: (v: boolean) => void;
  onSubmit: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Security callout */}
      <div style={styles.warningCallout}>
        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Tokens são sensíveis.</strong> Nunca compartilhe com ninguém.
        </span>
      </div>

      {/* Token field */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={styles.fieldLabel}>Token de Acesso</label>
        <div style={{ position: "relative" }}>
          <input
            ref={inputRef}
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            placeholder="Cole seu token aqui..."
            style={styles.tokenInput}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--brand-500)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(88,101,242,0.15)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <button
            onClick={() => setShowToken(!showToken)}
            style={styles.eyeButton}
            title={showToken ? "Ocultar token" : "Mostrar token"}
          >
            {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={onSubmit}
        disabled={!token.trim()}
        style={{
          ...styles.primaryButton,
          opacity: token.trim() ? 1 : 0.45,
          cursor: token.trim() ? "pointer" : "not-allowed",
        }}
        onMouseEnter={(e) => {
          if (!token.trim()) return;
          e.currentTarget.style.background =
            "linear-gradient(135deg, #6875f5 0%, #5865f2 100%)";
          e.currentTarget.style.boxShadow =
            "0 8px 28px rgba(88,101,242,0.4), inset 0 1px 0 rgba(255,255,255,0.15)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            "linear-gradient(135deg, #5865f2 0%, #4752c4 100%)";
          e.currentTarget.style.boxShadow =
            "0 4px 20px rgba(88,101,242,0.3), inset 0 1px 0 rgba(255,255,255,0.1)";
          e.currentTarget.style.transform = "translateY(0)";
        }}
        onMouseDown={(e) => {
          if (!token.trim()) return;
          e.currentTarget.style.transform = "translateY(1px)";
        }}
      >
        <ShieldCheck size={18} />
        <span>Verificar e Conectar</span>
      </button>

      {/* Storage note */}
      <p style={{ ...styles.infoNote, fontSize: 12 }}>
        O token é criptografado no armazenamento local; a chave fica no Credential Manager. Ele é enviado apenas às APIs do Discord quando uma ação exige autenticação.
      </p>

      {/* Token safety */}
      <details style={styles.details}>
        <summary style={styles.detailsSummary}>Por que este método é avançado?</summary>
        <p style={styles.infoNote}>
          Tokens dão acesso à conta e não devem ser extraídos ou compartilhados. OrganicCord não ensina a coletá-los. Prefira a janela de login ou o QR e teste primeiro com uma conta não crítica.
        </p>
      </details>
    </div>
  );
}

// ─── Global Auth States ───────────────────────────────────────────────────────

function ValidatingState({ onCancel }: { onCancel: () => void }) {
  return (
    <div style={styles.stateCenter}>
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
      <p style={styles.stateLabel}>Conectando sua conta...</p>
      <p style={styles.stateSubLabel}>Validando credenciais com o Discord</p>
      <button
        onClick={onCancel}
        style={{
          marginTop: 12,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          padding: "8px 22px",
          color: "var(--text-muted)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 150ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          e.currentTarget.style.color = "var(--text-normal)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          e.currentTarget.style.color = "var(--text-muted)";
        }}
      >
        Cancelar
      </button>
    </div>
  );
}

function SuccessState() {
  return (
    <div style={{ ...styles.stateCenter, animation: "hubFadeIn 400ms ease-out" }}>
      <div style={styles.successIcon}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#23a55a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <p style={{ ...styles.stateLabel, color: "var(--status-online)" }}>
        Conta conectada!
      </p>
      <p style={styles.stateSubLabel}>Entrando no OrganicCord...</p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "relative",
    width: "100%",
    height: "100%",
    background: "#090B0F",
    overflow: "auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  glowGreen: {
    position: "absolute",
    width: 500,
    height: 500,
    background: "radial-gradient(circle, rgba(35,165,90,0.12) 0%, transparent 70%)",
    top: "-10%",
    left: "-5%",
    pointerEvents: "none",
    animation: "hubPulse 8s ease-in-out infinite alternate",
  },
  glowBlue: {
    position: "absolute",
    width: 600,
    height: 600,
    background: "radial-gradient(circle, rgba(88,101,242,0.1) 0%, transparent 70%)",
    bottom: "-15%",
    right: "-10%",
    pointerEvents: "none",
    animation: "hubPulse 10s ease-in-out infinite alternate-reverse",
  },
  layout: {
    display: "flex",
    width: "100%",
    height: "100%",
    minWidth: 780,
    minHeight: 640,
    maxWidth: 1200,
    position: "relative",
    zIndex: 1,
  },

  // Hero Panel
  heroPanel: {
    flex: "0 0 58%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "48px 52px 48px 56px",
    gap: 32,
  },
  brandHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "rgba(35,165,90,0.12)",
    border: "1px solid rgba(35,165,90,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-normal)",
    letterSpacing: "-0.01em",
  },
  versionBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "2px 8px",
    borderRadius: 100,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  },
  heroContent: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  heroHeading: {
    fontSize: "clamp(24px, 3vw, 36px)",
    fontWeight: 800,
    color: "#ffffff",
    lineHeight: 1.15,
    letterSpacing: "-0.03em",
    textWrap: "balance",
  } as React.CSSProperties,
  heroSubtitle: {
    fontSize: 15,
    color: "var(--text-muted)",
    lineHeight: 1.6,
    maxWidth: 420,
  },
  featureList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  featureCard: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 12,
    border: "1px solid transparent",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    width: "100%",
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all 220ms ease",
  },
  featureText: {
    flex: 1,
    minWidth: 0,
  },
  featureLabel: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
    transition: "color 220ms ease",
  },
  testBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: "#f0b232",
    background: "rgba(240, 178, 50, 0.12)",
    border: "1px solid rgba(240, 178, 50, 0.25)",
    padding: "2px 7px",
    borderRadius: 100,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    lineHeight: 1.2,
  },
  featureBody: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.55,
    overflow: "hidden",
    transition: "max-height 250ms ease, opacity 200ms ease, margin-top 200ms ease",
  },
  trustRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  trustBadge: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-muted)",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    padding: "4px 10px",
    borderRadius: 100,
    letterSpacing: "0.01em",
  },

  // Auth Panel
  authPanel: {
    flex: "0 0 42%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "48px 44px 48px 36px",
    borderLeft: "1px solid rgba(255,255,255,0.05)",
    background: "rgba(255,255,255,0.015)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    animation: "hubFadeIn 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  },
  authHeader: {
    marginBottom: 24,
  },
  authTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: "#fff",
    letterSpacing: "-0.02em",
    marginBottom: 4,
  },
  authSubtitle: {
    fontSize: 14,
    color: "var(--text-muted)",
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    marginBottom: 28,
    gap: 2,
  },
  tabButton: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 600,
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    transition: "all 180ms ease",
    borderRadius: "6px 6px 0 0",
    letterSpacing: "-0.005em",
    marginBottom: -1,
  },
  tabContent: {
    flex: 1,
    animation: "hubTabIn 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  },
  primaryButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "14px 24px",
    background: "linear-gradient(135deg, #5865f2 0%, #4752c4 100%)",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "-0.01em",
    boxShadow: "0 4px 20px rgba(88,101,242,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
    transition: "all 180ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    position: "relative",
  },
  recommendedBadge: {
    position: "absolute",
    top: -9,
    right: 14,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.06em",
    background: "rgba(35,165,90,0.9)",
    color: "#fff",
    padding: "3px 8px",
    borderRadius: 100,
  },
  securityList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  securityItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-muted)",
  },
  securityDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--status-online)",
    flexShrink: 0,
  },
  infoNote: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.55,
  },
  warningCallout: {
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
    textTransform: "uppercase" as const,
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
  eyeButton: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 150ms ease",
  },
  details: {
    fontSize: 13,
    color: "var(--text-muted)",
    cursor: "pointer",
  },
  detailsSummary: {
    fontWeight: 600,
    marginBottom: 10,
    cursor: "pointer",
    color: "var(--text-muted)",
  },
  detailsList: {
    paddingLeft: 18,
    lineHeight: 2.1,
  },
  kbd: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "1px 6px",
    borderRadius: 4,
    fontFamily: "monospace",
    fontSize: 11,
  },
  code: {
    color: "var(--text-link)",
    fontFamily: "monospace",
  },
  errorBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    background: "rgba(242,63,67,0.08)",
    border: "1px solid rgba(242,63,67,0.25)",
    borderRadius: 10,
    padding: "11px 14px",
    fontSize: 13,
    color: "var(--text-danger)",
    marginBottom: 16,
    lineHeight: 1.5,
  },
  stateCenter: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    minHeight: 260,
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
    fontSize: 17,
    fontWeight: 700,
    color: "var(--text-normal)",
    letterSpacing: "-0.01em",
  },
  stateSubLabel: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  successIcon: {
    width: 60,
    height: 60,
    background: "rgba(35,165,90,0.12)",
    border: "2px solid rgba(35,165,90,0.4)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
