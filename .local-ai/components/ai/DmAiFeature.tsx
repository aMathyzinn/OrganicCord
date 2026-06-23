import { useState, useRef, useEffect } from "react";
import { useAiStore, makeDefaultConfig } from "@/stores/aiStore";
import type { DmAiRule, AiConfig, AiProvider } from "@/stores/aiStore";
import { OPENROUTER_MODELS, GOOGLE_MODELS } from "@/stores/aiStore";
import { Bot, X } from "lucide-react";
import { useDiscordStore } from "@/stores/discordStore";
import type { DiscordMessage } from "@/types";

export function DmAiFeature({ accountId }: { accountId: string }) {
  const [showAiModal, setShowAiModal] = useState(false);
  const { dmRules } = useAiStore();
  const dmRule = dmRules.find((r) => r.account_id === accountId);

  return (
    <>
      <button
        onClick={() => setShowAiModal(true)}
        title={dmRule?.enabled ? "IA de DM ativa — clique para configurar" : "Configurar IA para DMs"}
        style={{
          background: dmRule?.enabled ? "rgba(88,101,242,0.2)" : "transparent",
          border: `1px solid ${dmRule?.enabled ? "var(--brand-500)" : "var(--border-subtle)"}`,
          borderRadius: "var(--radius-sm)",
          padding: "4px 10px",
          cursor: "pointer",
          fontSize: 13,
          color: dmRule?.enabled ? "var(--brand-500)" : "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontWeight: dmRule?.enabled ? 600 : 400,
          transition: "all 120ms",
        }}
      >
        <Bot size={14} />
        <span>{dmRule?.enabled ? "IA ativa" : "IA"}</span>
      </button>

      {showAiModal && (
        <DmAiModal accountId={accountId} onClose={() => setShowAiModal(false)} />
      )}
    </>
  );
}

function DmAiModal({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { dmRules, setDmRule, removeDmRule } = useAiStore();
  const existing = dmRules.find((r) => r.account_id === accountId);

  const [provider, setProvider] = useState<AiProvider>(existing?.config.provider ?? "openrouter");
  const [apiKey, setApiKey] = useState(existing?.config.api_key ?? "");
  const [model, setModel] = useState(existing?.config.model ?? "openai/gpt-4o-mini");
  const [systemPrompt, setSystemPrompt] = useState(
    existing?.config.system_prompt ??
    "Você é um usuário real do Discord respondendo uma DM. Seja informal, curto, natural. Máximo 2 frases. Sem markdown."
  );
  const [temperature, setTemperature] = useState(existing?.config.temperature ?? 0.9);
  const [delayMs, setDelayMs] = useState(existing?.reply_delay_ms ?? 2000);
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);

  const models = provider === "google" ? GOOGLE_MODELS : OPENROUTER_MODELS;

  const handleSave = () => {
    const config: AiConfig = {
      provider,
      api_key: apiKey,
      model,
      system_prompt: systemPrompt,
      temperature,
      max_tokens: 80,
    };
    const rule: DmAiRule = {
      id: existing?.id ?? crypto.randomUUID(),
      account_id: accountId,
      enabled,
      config,
      reply_delay_ms: delayMs,
    };
    setDmRule(rule);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-secondary)", borderRadius: "var(--radius-md)",
          padding: 24, width: 480, maxHeight: "80vh", overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>IA para DMs</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)" }}><X size={18} /></button>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          Quando ativada, esta conta responde automaticamente todas as DMs recebidas usando IA.
        </p>

        {/* Enable toggle */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Ativar resposta automática em DMs</span>
        </label>

        {/* Provider */}
        <div>
          <label style={labelStyle}>Provedor</label>
          <select value={provider} onChange={(e) => { setProvider(e.target.value as AiProvider); setModel(e.target.value === "google" ? "gemini-2.0-flash" : "openai/gpt-4o-mini"); }} style={inputStyle}>
            <option value="openrouter">OpenRouter</option>
            <option value="google">Google AI Studio</option>
          </select>
        </div>

        {/* API Key */}
        <div>
          <label style={labelStyle}>API Key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={provider === "openrouter" ? "sk-or-..." : "AIza..."} style={inputStyle} />
        </div>

        {/* Model */}
        <div>
          <label style={labelStyle}>Modelo</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle}>
            {models.map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        {/* System prompt */}
        <div>
          <label style={labelStyle}>Personalidade / System Prompt</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        {/* Temperature */}
        <div>
          <label style={labelStyle}>Temperatura: {temperature.toFixed(1)}</label>
          <input type="range" min={0} max={1.5} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} style={{ width: "100%" }} />
        </div>

        {/* Reply delay */}
        <div>
          <label style={labelStyle}>Delay de resposta: {(delayMs / 1000).toFixed(1)}s</label>
          <input type="range" min={500} max={10000} step={500} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} style={{ width: "100%" }} />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          {existing && (
            <button
              onClick={() => { removeDmRule(accountId); onClose(); }}
              style={{ ...btnStyle, background: "rgba(237,66,69,0.15)", color: "var(--status-danger)", border: "1px solid var(--status-danger)" }}
            >
              Remover
            </button>
          )}
          <button onClick={onClose} style={{ ...btnStyle, background: "transparent", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            style={{ ...btnStyle, background: "var(--brand-500)", color: "#fff", border: "none", opacity: apiKey.trim() ? 1 : 0.5 }}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600,
  color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", background: "var(--bg-primary)",
  border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
  color: "var(--text-normal)", fontSize: 14, boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: "var(--radius-sm)",
  cursor: "pointer", fontSize: 14, fontWeight: 600,
};

export function processFreshMessagesForDmAi(
  accountId: string,
  channelId: string,
  myUserId: string | undefined,
  fresh: DiscordMessage[],
  seenDmIds: Set<string>
) {
  if (!myUserId) return;
  const { handleIncomingDm } = useAiStore.getState();
  const allMsgs = useDiscordStore.getState().cache.messages[channelId] ?? [];
  const history = allMsgs
    .slice(0, 20)
    .reverse()
    .map((m) => ({
      role: (m.author.id === myUserId ? "assistant" : "user") as "user" | "assistant",
      content: m.author.id === myUserId ? m.content : `${m.author.username}: ${m.content}`,
    }));

  for (const msg of fresh) {
    if (seenDmIds.has(msg.id)) continue;
    seenDmIds.add(msg.id);
    if (msg.author.id === myUserId) continue;
    handleIncomingDm(
      accountId,
      channelId,
      msg.author.global_name ?? msg.author.username,
      msg.content,
      msg.id,
      history,
    );
  }
}
