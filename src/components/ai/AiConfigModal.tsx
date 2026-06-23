import { useState, useEffect } from "react";
import { useAiStore, makeDefaultConfig, OPENROUTER_MODELS, GOOGLE_MODELS } from "@/stores/aiStore";
import type { AiConfig, AiProvider } from "@/stores/aiStore";
import { useAccountStore } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { Bot, X, Plus } from "lucide-react";


interface Props {
  onClose: () => void;
}

type Tab = "rules" | "global";

export function AiConfigModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("rules");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 720,
          maxHeight: "85vh",
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-md)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bot size={20} />
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-normal)" }}>
              Configuração de IA
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-muted)", fontSize: 20, lineHeight: 1,
            }}
          >{<X size={18} />}</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}>
          {(["rules", "global"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "none",
                border: "none",
                borderBottom: tab === t ? "2px solid var(--brand-500)" : "2px solid transparent",
                padding: "10px 20px",
                cursor: "pointer",
                color: tab === t ? "var(--text-normal)" : "var(--text-muted)",
                fontWeight: tab === t ? 600 : 400,
                fontSize: 14,
                transition: "color 100ms",
              }}
            >
              {t === "rules" ? "Regras de Auto-Resposta" : "Testar Config Global"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {tab === "rules" ? <RulesTab /> : <GlobalTestTab />}
        </div>
      </div>
    </div>
  );
}

// ─── Rules Tab ───────────────────────────────────────────────────────────────

function RulesTab() {
  const { rules, addRule, removeRule, toggleRule, updateRule } = useAiStore();
  const { accounts } = useAccountStore();
  const { activeAccountId, activeChannelId, activeGuildId } = useNavigationStore();
  const cache = useDiscordStore((s) => s.cache);

  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = () => {
    const newRule = {
      id: crypto.randomUUID(),
      account_id: activeAccountId ?? accounts[0]?.id ?? "",
      channel_id: activeChannelId ?? "",
      guild_id: activeGuildId ?? null,
      enabled: true,
      config: makeDefaultConfig("openrouter"),
      trigger_prefix: null,
      reply_delay_ms: 1500,
    };
    addRule(newRule);
    setEditingId(newRule.id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          A IA monitora as mensagens dos canais configurados e responde automaticamente.
        </p>
        <button
          onClick={handleAdd}
          style={{
            background: "var(--brand-500)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          + Nova Regra
        </button>
      </div>

      {rules.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "40px 20px",
          color: "var(--text-muted)",
        }}>
          <Bot size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)", marginBottom: 8 }}>
            Nenhuma regra criada
          </div>
          <div style={{ fontSize: 13, marginBottom: 20, maxWidth: 340, margin: "0 auto 20px", lineHeight: 1.5 }}>
            Crie regras de auto-resposta para que a IA monitor e responda automaticamente nos canais configurados.
          </div>
          <button
            onClick={handleAdd}
            style={{
              background: "var(--brand-500)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Plus size={14} /> Criar primeira regra
          </button>
        </div>
      ) : (
        rules.map((rule) => {
          const account = accounts.find((a) => a.id === rule.account_id);
          // Find channel name from cache
          const allChannels = Object.values(cache.channels).flat();
          const channel = allChannels.find((c) => c.id === rule.channel_id);

          return (
            <div
              key={rule.id}
              style={{
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${rule.enabled ? "var(--brand-500)" : "var(--border-subtle)"}`,
                overflow: "hidden",
              }}
            >
              {/* Rule header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
              }}>
                {/* Toggle */}
                <ToggleSwitch
                  on={rule.enabled}
                  onChange={() => toggleRule(rule.id)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-normal)" }}>
                    {account?.username ?? rule.account_id}
                    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                      {" — "}
                      {channel?.name ? `#${channel.name}` : `canal: ${rule.channel_id.slice(0, 8)}...`}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {rule.config.provider === "openrouter" ? "OpenRouter" : "Google AI"} · {rule.config.model}
                    {rule.trigger_prefix && ` · prefixo: "${rule.trigger_prefix}"`}
                    {rule.reply_delay_ms && ` · delay: ${rule.reply_delay_ms}ms`}
                  </div>
                </div>
                <button
                  onClick={() => setEditingId(editingId === rule.id ? null : rule.id)}
                  style={{
                    background: "var(--bg-accent)", border: "none",
                    borderRadius: "var(--radius-sm)", padding: "4px 10px",
                    fontSize: 12, cursor: "pointer", color: "var(--text-normal)",
                  }}
                >
                  {editingId === rule.id ? "Fechar" : "Editar"}
                </button>
                <button
                  onClick={() => removeRule(rule.id)}
                  style={{
                    background: "rgba(237,66,69,0.15)", border: "none",
                    borderRadius: "var(--radius-sm)", padding: "4px 10px",
                    fontSize: 12, cursor: "pointer", color: "var(--text-danger)",
                  }}
                >
                  Remover
                </button>
              </div>

              {/* Expanded editor */}
              {editingId === rule.id && (
                <div style={{
                  borderTop: "1px solid var(--border-subtle)",
                  padding: "14px",
                }}>
                  <RuleEditor
                    rule={rule}
                    accounts={accounts}
                    onChange={(patch) => updateRule(rule.id, patch)}
                  />
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Rule Editor ─────────────────────────────────────────────────────────────

function RuleEditor({
  rule,
  accounts,
  onChange,
}: {
  rule: import("@/stores/aiStore").AiAutoReplyRule;
  accounts: import("@/types").StoredAccount[];
  onChange: (patch: Partial<import("@/stores/aiStore").AiAutoReplyRule>) => void;
}) {
  const [testMsg, setTestMsg] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const { testConfig } = useAiStore();

  const handleTest = async () => {
    if (!testMsg.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const text = await testConfig(rule.config, testMsg);
      setTestResult({ ok: true, text });
    } catch (e) {
      setTestResult({ ok: false, text: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {/* Account */}
        <Field label="Conta">
          <select
            value={rule.account_id}
            onChange={(e) => onChange({ account_id: e.target.value })}
            style={selectStyle}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.username}</option>
            ))}
          </select>
        </Field>

        {/* Channel ID */}
        <Field label="ID do Canal">
          <input
            value={rule.channel_id}
            onChange={(e) => onChange({ channel_id: e.target.value })}
            placeholder="ID do canal Discord"
            style={inputStyle}
          />
        </Field>

        {/* Trigger prefix */}
        <Field label="Prefixo de Trigger (opcional)">
          <input
            value={rule.trigger_prefix ?? ""}
            onChange={(e) => onChange({ trigger_prefix: e.target.value || null })}
            placeholder="Ex: !ia — vazio = toda mensagem"
            style={inputStyle}
          />
        </Field>

        {/* Delay */}
        <Field label="Delay de Resposta (ms)">
          <input
            type="number"
            min={0}
            max={30000}
            step={500}
            value={rule.reply_delay_ms ?? 1500}
            onChange={(e) => onChange({ reply_delay_ms: Number(e.target.value) })}
            style={inputStyle}
          />
        </Field>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)", margin: "4px 0" }} />

      <AiConfigEditor
        config={rule.config}
        onChange={(cfg) => onChange({ config: cfg })}
      />

      {/* Inline test */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={labelStyle}>Testar configuração</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleTest(); }}
            placeholder="Digite uma mensagem de teste..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleTest}
            disabled={testing || !testMsg.trim()}
            style={{
              background: testing ? "var(--bg-accent)" : "var(--brand-500)",
              color: "#fff", border: "none", borderRadius: "var(--radius-sm)",
              padding: "0 14px", fontSize: 13, cursor: testing ? "wait" : "pointer",
              fontWeight: 600, flexShrink: 0,
            }}
          >
            {testing ? "..." : "Testar"}
          </button>
        </div>
        {testResult && (
          <div style={{
            padding: "8px 10px",
            borderRadius: "var(--radius-sm)",
            background: testResult.ok ? "rgba(59,165,93,0.1)" : "rgba(237,66,69,0.1)",
            border: `1px solid ${testResult.ok ? "var(--status-online)" : "var(--text-danger)"}`,
            fontSize: 13,
            color: testResult.ok ? "var(--text-normal)" : "var(--text-danger)",
            wordBreak: "break-word",
          }}>
            {testResult.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI Config Editor (shared) ────────────────────────────────────────────────

export function AiConfigEditor({
  config,
  onChange,
}: {
  config: AiConfig;
  onChange: (cfg: AiConfig) => void;
}) {
  const models = config.provider === "openrouter" ? OPENROUTER_MODELS : GOOGLE_MODELS;

  const set = (patch: Partial<AiConfig>) => onChange({ ...config, ...patch });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {/* Provider */}
        <Field label="Provider">
          <select
            value={config.provider}
            onChange={(e) => {
              const p = e.target.value as AiProvider;
              set({ provider: p, model: makeDefaultConfig(p).model });
            }}
            style={selectStyle}
          >
            <option value="openrouter">OpenRouter</option>
            <option value="google">Google AI Studio</option>
          </select>
        </Field>

        {/* Model */}
        <Field label="Modelo">
          <select
            value={models.find((m) => m.id === config.model) ? config.model : "__custom__"}
            onChange={(e) => {
              if (e.target.value !== "__custom__") set({ model: e.target.value });
            }}
            style={selectStyle}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
            <option value="__custom__">Personalizado...</option>
          </select>
          {!models.find((m) => m.id === config.model) && (
            <input
              value={config.model}
              onChange={(e) => set({ model: e.target.value })}
              placeholder="Ex: gemini-2.5-flash-lite-preview-06-17"
              style={{ ...selectStyle, marginTop: 4 }}
              autoFocus
            />
          )}
        </Field>

        {/* Temperature */}
        <Field label={`Temperatura: ${config.temperature ?? 0.7}`}>
          <input
            type="range"
            min={0} max={2} step={0.05}
            value={config.temperature ?? 0.7}
            onChange={(e) => set({ temperature: parseFloat(e.target.value) })}
            style={{ width: "100%", accentColor: "var(--brand-500)" }}
          />
        </Field>

        {/* Max tokens */}
        <Field label="Max Tokens">
          <input
            type="number"
            min={50} max={4096} step={50}
            value={config.max_tokens ?? 500}
            onChange={(e) => set({ max_tokens: Number(e.target.value) })}
            style={inputStyle}
          />
        </Field>
      </div>

      {/* API Key */}
      <Field label={config.provider === "openrouter" ? "API Key (OpenRouter)" : "API Key (Google AI Studio)"}>
        <input
          type="password"
          value={config.api_key}
          onChange={(e) => set({ api_key: e.target.value })}
          placeholder={config.provider === "openrouter" ? "sk-or-..." : "AIza..."}
          style={inputStyle}
          autoComplete="off"
        />
      </Field>

      {/* System Prompt */}
      <Field label="System Prompt">
        <textarea
          value={config.system_prompt}
          onChange={(e) => set({ system_prompt: e.target.value })}
          rows={4}
          style={{
            ...inputStyle,
            resize: "vertical",
            fontFamily: "inherit",
            lineHeight: 1.4,
          }}
          placeholder="Instruções de comportamento para a IA..."
        />
      </Field>
    </div>
  );
}

// ─── Global test tab ──────────────────────────────────────────────────────────

function GlobalTestTab() {
  const { globalConfig, setGlobalConfig, testConfig, generate } = useAiStore();
  const { activeAccountId, activeChannelId } = useNavigationStore();

  const config = globalConfig ?? makeDefaultConfig("openrouter");

  const [testMsg, setTestMsg] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);

  const handleTest = async () => {
    if (!testMsg.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const text = await testConfig(config, testMsg);
      setTestResult({ ok: true, text });
    } catch (e) {
      setTestResult({ ok: false, text: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSend = async () => {
    if (!testResult?.ok || !activeAccountId || !activeChannelId) return;
    setSending(true);
    try {
      await generate({
        config,
        messages: [{ role: "user", content: testMsg }],
        account_id: activeAccountId,
        channel_id: activeChannelId,
        send: true,
        reply_to: null,
      });
      setTestResult({ ok: true, text: testResult.text + "\n\n✅ Enviado ao canal!" });
    } catch (e) {
      setTestResult({ ok: false, text: String(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
        Configure e teste a IA manualmente. Esta configuração é global e pode ser usada como base para novas regras.
      </p>

      <AiConfigEditor
        config={config}
        onChange={setGlobalConfig}
      />

      <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)" }} />

      <Field label="Mensagem de Teste">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleTest(); }}
            placeholder="Digite a mensagem..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleTest}
            disabled={testing || !testMsg.trim()}
            style={{
              background: testing ? "var(--bg-accent)" : "var(--brand-500)",
              color: "#fff", border: "none", borderRadius: "var(--radius-sm)",
              padding: "0 14px", fontSize: 13, fontWeight: 600,
              cursor: testing ? "wait" : "pointer", flexShrink: 0,
            }}
          >
            {testing ? "Gerando..." : "Gerar"}
          </button>
        </div>
      </Field>

      {testResult && (
        <div style={{
          padding: "10px 12px",
          borderRadius: "var(--radius-sm)",
          background: testResult.ok ? "rgba(59,165,93,0.08)" : "rgba(237,66,69,0.08)",
          border: `1px solid ${testResult.ok ? "var(--status-online)" : "var(--text-danger)"}`,
          fontSize: 14,
          color: "var(--text-normal)",
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          lineHeight: 1.5,
        }}>
          {testResult.text}
        </div>
      )}

      {testResult?.ok && activeAccountId && activeChannelId && (
        <button
          onClick={handleSend}
          disabled={sending}
          style={{
            background: "rgba(59,165,93,0.2)",
            color: "var(--status-online)",
            border: "1px solid var(--status-online)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: sending ? "wait" : "pointer",
            alignSelf: "flex-start",
          }}
        >
          {sending ? "Enviando..." : "📤 Enviar ao canal atual"}
        </button>
      )}
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: on ? "var(--status-online)" : "var(--bg-accent)",
        border: "none",
        cursor: "pointer",
        position: "relative",
        transition: "background 150ms",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 150ms",
        }}
      />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-normal)",
  fontSize: 13,
  padding: "6px 10px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-muted)",
};
