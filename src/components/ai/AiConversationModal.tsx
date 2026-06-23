import { useState } from "react";
import {
  useAiConversationStore,
  type AiConversation,
  type AiParticipant,
  type OrchestratorConfig,
} from "@/stores/aiConversationStore";
import { makeDefaultConfig, OPENROUTER_MODELS, GOOGLE_MODELS } from "@/stores/aiStore";
import type { AiConfig, AiProvider } from "@/stores/aiStore";
import { useAccountStore } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { MessagesSquare, X, Play, Pause, Square, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  onClose: () => void;
}

// ─── Root modal ───────────────────────────────────────────────────────────────

export function AiConversationModal({ onClose }: Props) {
  const { conversations, addConversation } = useAiConversationStore();
  const { activeChannelId, activeGuildId } = useNavigationStore();
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleNew = () => {
    const id = crypto.randomUUID();
    addConversation({
      id,
      label: "Nova conversa",
      channel_id: activeChannelId ?? "",
      guild_id: activeGuildId ?? null,
      participants: [],
      topic: "",
      enabled: true,
      created_at: new Date().toISOString(),
      context_messages: 20,
      drop_reaction_emoji: "⚡",
      drop_response_template: "eu quero!",
    });
    setEditingId(id);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 10001,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 800,
          maxHeight: "88vh",
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
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <MessagesSquare size={22} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-normal)" }}>
                Conversas entre IAs
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Até 5 contas conversando entre si automaticamente
              </div>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X size={18} /></button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={handleNew} style={primaryBtnStyle}>
              + Nova Conversa
            </button>
          </div>

          {conversations.length === 0 ? (
            <EmptyState onCreate={handleNew} />
          ) : (
            conversations.map((conv) => (
              <ConversationCard
                key={conv.id}
                conv={conv}
                expanded={editingId === conv.id}
                onToggle={() => setEditingId(editingId === conv.id ? null : conv.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Conversation card ────────────────────────────────────────────────────────

function ConversationCard({
  conv,
  expanded,
  onToggle,
}: {
  conv: AiConversation;
  expanded: boolean;
  onToggle: () => void;
}) {
  const {
    updateConversation, removeConversation,
    startConversation, pauseConversation, stopConversation,
    runtimeStatus, runtimeError, runtimeRounds,
  } = useAiConversationStore();
  const { cache } = useDiscordStore();
  const { activeGuildId } = useNavigationStore();

  const status = runtimeStatus[conv.id] ?? "idle";
  const error = runtimeError[conv.id];
  const rounds = runtimeRounds[conv.id] ?? 0;

  const allChannels = Object.values(cache.channels).flat();
  const channel = allChannels.find((c) => c.id === conv.channel_id);

  const isRunning = status === "running";
  const isPaused = status === "paused";
  const hasError = status === "error";
  const canStart = conv.participants.length >= 2 && conv.channel_id;

  const statusColor = isRunning
    ? "var(--status-online)"
    : isPaused
    ? "#faa61a"
    : hasError
    ? "var(--text-danger)"
    : "var(--text-muted)";

  const statusLabel = isRunning
    ? `Rodando · ${rounds} turnos`
    : isPaused
    ? "Pausada"
    : hasError
    ? "Erro"
    : "Parada";

  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${isRunning ? "var(--status-online)" : expanded ? "var(--brand-500)" : "var(--border-subtle)"}`,
        overflow: "hidden",
        transition: "border-color 200ms",
      }}
    >
      {/* Card header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
      }}>
        {/* Status dot */}
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: statusColor, flexShrink: 0,
          boxShadow: isRunning ? `0 0 6px ${statusColor}` : "none",
          transition: "box-shadow 400ms",
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-normal)" }}>
              {conv.label || "Sem nome"}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {channel ? `#${channel.name}` : conv.channel_id ? `canal: ${conv.channel_id.slice(0, 8)}…` : "sem canal"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: statusColor, marginTop: 1 }}>
            {statusLabel}
            {hasError && error && ` — ${error.slice(0, 60)}`}
            {!hasError && ` · ${conv.participants.length} participante${conv.participants.length !== 1 ? "s" : ""}`}
            {conv.topic && ` · "${conv.topic.slice(0, 40)}${conv.topic.length > 40 ? "…" : ""}"`}
          </div>
        </div>

        {/* Participants avatars */}
        <div style={{ display: "flex", gap: -4 }}>
          {conv.participants.slice(0, 5).map((p) => (
            <div
              key={p.id}
              title={p.username}
              style={{
                width: 22, height: 22, borderRadius: "50%",
                background: p.color,
                border: "2px solid var(--bg-secondary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: "#fff",
                marginLeft: -4,
                flexShrink: 0,
              }}
            >
              {p.username.slice(0, 1).toUpperCase()}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {!isRunning && (
            <button
              onClick={() => startConversation(conv.id)}
              disabled={!canStart}
              title={canStart ? "Iniciar" : "Precisa de canal e mínimo 2 participantes"}
              style={{
                ...actionBtnStyle,
                background: canStart ? "rgba(59,165,93,0.15)" : "var(--bg-accent)",
                color: canStart ? "var(--status-online)" : "var(--text-muted)",
                cursor: canStart ? "pointer" : "not-allowed",
              }}
            >
              <Play size={12} />
            </button>
          )}
          {isRunning && (
            <button
              onClick={() => pauseConversation(conv.id)}
              title="Pausar"
              style={{ ...actionBtnStyle, background: "rgba(250,166,26,0.15)", color: "#faa61a" }}
            >
              <Pause size={12} />
            </button>
          )}
          {(isRunning || isPaused) && (
            <button
              onClick={() => stopConversation(conv.id)}
              title="Parar e resetar"
              style={{ ...actionBtnStyle, background: "rgba(237,66,69,0.1)", color: "var(--text-danger)" }}
            >
              <Square size={12} />
            </button>
          )}
          <button
            onClick={onToggle}
            style={{ ...actionBtnStyle, background: expanded ? "var(--brand-500)" : "var(--bg-accent)", color: expanded ? "#fff" : "var(--text-normal)" }}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            onClick={() => { stopConversation(conv.id); removeConversation(conv.id); }}
            title="Excluir"
            style={{ ...actionBtnStyle, background: "rgba(237,66,69,0.1)", color: "var(--text-danger)" }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "14px 16px", maxHeight: "60vh", overflowY: "auto" }}>
          <ConversationEditor conv={conv} onChange={(p) => updateConversation(conv.id, p)} />
        </div>
      )}
    </div>
  );
}

// ─── Conversation editor ──────────────────────────────────────────────────────

function ConversationEditor({
  conv,
  onChange,
}: {
  conv: AiConversation;
  onChange: (patch: Partial<AiConversation>) => void;
}) {
  const { accounts } = useAccountStore();
  const { activeChannelId, activeGuildId } = useNavigationStore();
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);

  const addParticipant = () => {
    if (conv.participants.length >= 5) return;
    const newP: AiParticipant = {
      id: crypto.randomUUID(),
      account_id: accounts[0]?.id ?? "",
      user_id: accounts[0]?.user_id ?? "",
      username: accounts[0]?.username ?? "Conta",
      color: accounts[0]?.color ?? "#5865f2",
      config: makeDefaultConfig("openrouter"),
      personality: "",
      delay_base_ms: 8000,
      delay_jitter_ms: 4000,
    };
    onChange({ participants: [...conv.participants, newP] });
    setEditingParticipantId(newP.id);
  };

  const updateParticipant = (pid: string, patch: Partial<AiParticipant>) => {
    onChange({
      participants: conv.participants.map((p) =>
        p.id === pid ? { ...p, ...patch } : p
      ),
    });
  };

  const removeParticipant = (pid: string) => {
    onChange({ participants: conv.participants.filter((p) => p.id !== pid) });
    if (editingParticipantId === pid) setEditingParticipantId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Basic info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Nome da conversa">
          <input
            value={conv.label}
            onChange={(e) => onChange({ label: e.target.value })}
            style={inputStyle}
            placeholder="Ex: Debate filosófico"
          />
        </Field>
        <Field label="ID do Canal">
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={conv.channel_id}
              onChange={(e) => onChange({ channel_id: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
              placeholder="ID do canal Discord"
            />
            {activeChannelId && (
              <button
                onClick={() => onChange({ channel_id: activeChannelId, guild_id: activeGuildId ?? null })}
                style={{ ...actionBtnStyle, background: "var(--bg-accent)", fontSize: 11, padding: "0 8px", whiteSpace: "nowrap" }}
                title="Usar canal atual"
              >
                Usar atual
              </button>
            )}
          </div>
        </Field>
      </div>

      <Field label="Assunto / Contexto inicial">
        <textarea
          value={conv.topic}
          onChange={(e) => onChange({ topic: e.target.value })}
          rows={2}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4, fontFamily: "inherit" }}
          placeholder="Ex: Debate sobre inteligência artificial e ética. Vocês têm opiniões diferentes e debatem de forma descontraída."
        />
      </Field>

      {/* Drop relâmpago section */}
      <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
        <label style={{ ...labelStyle, fontSize: 12, color: "var(--text-muted)" }}>
          ⚡ Drop Relâmpago — todos os perfis correm pra reagir e responder quando um drop é detectado
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
          <Field label="Emoji de reação">
            <input
              type="text"
              value={conv.drop_reaction_emoji ?? "⚡"}
              onChange={(e) => onChange({ drop_reaction_emoji: e.target.value })}
              style={{ ...inputStyle, width: "100%" }}
              placeholder="⚡"
            />
          </Field>
          <Field label="Resposta rápida">
            <input
              type="text"
              value={conv.drop_response_template ?? "eu quero!"}
              onChange={(e) => onChange({ drop_response_template: e.target.value })}
              style={{ ...inputStyle, width: "100%" }}
              placeholder="eu quero!"
            />
          </Field>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginTop: 2 }}>
          Detectado quando: "drop" + "primeiro"/"ganha" ou 2+ palavras-chave (pack, premium, grátis, etc.)
        </div>
      </div>

      {/* Orchestrator section */}
      <OrchestratorSection
        config={conv.orchestrator ?? null}
        onChange={(patch) => onChange({ orchestrator: patch ? { ...(conv.orchestrator ?? defaultOrchestrator()), ...patch } : null })}
      />

      {/* Participants section */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <label style={{ ...labelStyle }}>
            Participantes ({conv.participants.length}/5)
          </label>
          {conv.participants.length < 5 && (
            <button onClick={addParticipant} style={{ ...primaryBtnStyle, fontSize: 12, padding: "4px 12px" }}>
              + Adicionar
            </button>
          )}
        </div>

        {conv.participants.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic", padding: "8px 0" }}>
            Adicione pelo menos 2 participantes para iniciar.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {conv.participants.map((p, idx) => (
            <ParticipantCard
              key={p.id}
              participant={p}
              index={idx}
              accounts={accounts}
              expanded={editingParticipantId === p.id}
              onToggle={() => setEditingParticipantId(editingParticipantId === p.id ? null : p.id)}
              onChange={(patch) => updateParticipant(p.id, patch)}
              onRemove={() => removeParticipant(p.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Participant card ─────────────────────────────────────────────────────────

function ParticipantCard({
  participant: p,
  index,
  accounts,
  expanded,
  onToggle,
  onChange,
  onRemove,
}: {
  participant: AiParticipant;
  index: number;
  accounts: import("@/types").StoredAccount[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<AiParticipant>) => void;
  onRemove: () => void;
}) {
  const models = p.config.provider === "openrouter" ? OPENROUTER_MODELS : GOOGLE_MODELS;

  const handleAccountChange = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    onChange({
      account_id: account.id,
      user_id: account.user_id,
      username: account.username,
      color: account.color,
    });
  };

  return (
    <div
      style={{
        background: "var(--bg-tertiary)",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${expanded ? p.color : "var(--border-subtle)"}`,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: p.color, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "#fff",
        }}>
          {index + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-normal)" }}>
            {p.username}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {p.config.provider === "openrouter" ? "OpenRouter" : "Google AI"} · {p.config.model.split("/").pop()}
            {" · "}delay {p.delay_base_ms / 1000}s ±{p.delay_jitter_ms / 1000}s
          </div>
        </div>
        <button
          onClick={onToggle}
          style={{ ...actionBtnStyle, background: expanded ? p.color + "30" : "var(--bg-accent)" }}
        >
          {expanded ? "▲" : "▼"}
        </button>
        <button onClick={onRemove} style={{ ...actionBtnStyle, color: "var(--text-danger)", background: "rgba(237,66,69,0.1)" }}>
          ✕
        </button>
      </div>

      {/* Editor */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {/* Account */}
              <Field label="Conta Discord">
                <select
                  value={p.account_id}
                  onChange={(e) => handleAccountChange(e.target.value)}
                  style={selectStyle}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.username}</option>
                  ))}
                </select>
              </Field>

              {/* Provider */}
              <Field label="Provider de IA">
                <select
                  value={p.config.provider}
                  onChange={(e) => {
                    const prov = e.target.value as AiProvider;
                    onChange({ config: { ...p.config, provider: prov, model: makeDefaultConfig(prov).model } });
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
                  value={models.find((m) => m.id === p.config.model) ? p.config.model : "__custom__"}
                  onChange={(e) => {
                    if (e.target.value !== "__custom__") onChange({ config: { ...p.config, model: e.target.value } });
                  }}
                  style={selectStyle}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                  <option value="__custom__">Personalizado...</option>
                </select>
                {!models.find((m) => m.id === p.config.model) && (
                  <input
                    value={p.config.model}
                    onChange={(e) => onChange({ config: { ...p.config, model: e.target.value } })}
                    placeholder="Ex: gemini-2.5-flash-lite-preview-06-17"
                    style={{ ...inputStyle, marginTop: 4 }}
                    autoFocus
                  />
                )}
              </Field>

              {/* Temperature */}
              <Field label={`Temperatura: ${p.config.temperature ?? 0.9}`}>
                <input
                  type="range" min={0.1} max={1.5} step={0.05}
                  value={p.config.temperature ?? 0.9}
                  onChange={(e) => onChange({ config: { ...p.config, temperature: parseFloat(e.target.value) } })}
                  style={{ width: "100%", accentColor: p.color }}
                />
              </Field>
            </div>

            {/* API Key */}
            <ApiKeyInput
              value={p.config.api_key}
              onChange={(v) => onChange({ config: { ...p.config, api_key: v } })}
              placeholder={p.config.provider === "openrouter" ? "sk-or-..." : "AIza..."}
              label={p.config.provider === "openrouter" ? "API Key (OpenRouter)" : "API Key (Google AI)"}
            />

            {/* Personality */}
            <Field label="Personalidade / Papel">
              <textarea
                value={p.personality}
                onChange={(e) => onChange({ personality: e.target.value })}
                rows={2}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
                placeholder="Ex: cético, irônico, adora debater; ou: entusiasta de tecnologia, otimista"
              />
            </Field>

            {/* Delays */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label={`Delay base: ${(p.delay_base_ms / 1000).toFixed(1)}s`}>
                <input
                  type="range" min={1000} max={30000} step={500}
                  value={p.delay_base_ms}
                  onChange={(e) => onChange({ delay_base_ms: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: p.color }}
                />
              </Field>
              <Field label={`Variação (jitter): ±${(p.delay_jitter_ms / 1000).toFixed(1)}s`}>
                <input
                  type="range" min={0} max={10000} step={500}
                  value={p.delay_jitter_ms}
                  onChange={(e) => onChange({ delay_jitter_ms: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: p.color }}
                />
              </Field>
            </div>

            <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
              Cada mensagem será enviada com {(p.delay_base_ms / 1000).toFixed(1)}s ±{(p.delay_jitter_ms / 1000).toFixed(1)}s de delay aleatório.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{
      textAlign: "center", padding: "48px 24px",
      color: "var(--text-muted)",
    }}>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><MessagesSquare size={48} /></div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)", marginBottom: 8 }}>
        Nenhuma conversa criada
      </div>
      <div style={{ fontSize: 13, marginBottom: 20, maxWidth: 380, margin: "0 auto 20px" }}>
        Crie uma conversa entre IAs para fazer até 5 contas conversarem entre si automaticamente em um canal do Discord.
      </div>
      <button onClick={onCreate} style={primaryBtnStyle}>
        Criar primeira conversa
      </button>
    </div>
  );
}

// ─── Orchestrator section ─────────────────────────────────────────────────────

function defaultOrchestrator(): OrchestratorConfig {
  return { enabled: true, api_key: "", interval_turns: 5, extra_instructions: "" };
}

function OrchestratorSection({
  config,
  onChange,
}: {
  config: OrchestratorConfig | null;
  onChange: (patch: Partial<OrchestratorConfig> | null) => void;
}) {
  const enabled = config?.enabled ?? false;

  return (
    <div
      style={{
        background: enabled ? "rgba(167,139,250,0.07)" : "var(--bg-tertiary)",
        border: `1px solid ${enabled ? "#a78bfa55" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-sm)",
        padding: "12px 14px",
        transition: "border-color 200ms, background 200ms",
      }}
    >
      {/* Header toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: enabled ? 12 : 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: enabled ? "#a78bfa22" : "var(--bg-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, flexShrink: 0,
        }}>
          🎯
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-normal)" }}>
            Orquestrador (DeepSeek v4)
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            IA silenciosa que monitora a conversa e direciona os participantes periodicamente
          </div>
        </div>
        <button
          onClick={() => {
            if (enabled) {
              onChange({ enabled: false });
            } else {
              onChange(config ? { enabled: true } : null);
              if (!config) onChange(defaultOrchestrator());
            }
          }}
          style={{
            background: enabled ? "#a78bfa" : "var(--bg-accent)",
            color: enabled ? "#fff" : "var(--text-muted)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "4px 14px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            flexShrink: 0,
            transition: "background 150ms",
          }}
        >
          {enabled ? "Ativo" : "Inativo"}
        </button>
      </div>

      {enabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
            <ApiKeyInput
              value={config?.api_key ?? ""}
              onChange={(v) => onChange({ api_key: v })}
              placeholder="sk-or-..."
              label="API Key OpenRouter (para o orquestrador)"
            />
            <Field label={`A cada ${config?.interval_turns ?? 5} turnos`}>
              <input
                type="number"
                min={1}
                max={20}
                value={config?.interval_turns ?? 5}
                onChange={(e) => onChange({ interval_turns: Math.max(1, Number(e.target.value)) })}
                style={{ ...inputStyle, width: 64, textAlign: "center" }}
              />
            </Field>
          </div>

          <Field label="Instruções extras para o orquestrador (opcional)">
            <textarea
              value={config?.extra_instructions ?? ""}
              onChange={(e) => onChange({ extra_instructions: e.target.value })}
              rows={2}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
              placeholder="Ex: Mantenha o debate quente mas amigável. Introduza tópicos polêmicos sobre tecnologia periodicamente."
            />
          </Field>

          <div style={{
            fontSize: 11, color: "#a78bfa",
            background: "rgba(167,139,250,0.08)",
            borderRadius: 4, padding: "6px 10px",
            lineHeight: 1.5,
          }}>
            O orquestrador lê as últimas {20} mensagens a cada {config?.interval_turns ?? 5} turnos e injeta uma diretiva oculta nos prompts dos participantes. Eles seguem a instrução sem saber que veio de uma IA externa.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-primary)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-normal)",
  fontSize: 13,
  padding: "6px 10px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-muted)",
};

const primaryBtnStyle: React.CSSProperties = {
  background: "var(--brand-500)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--radius-sm)",
  padding: "7px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const actionBtnStyle: React.CSSProperties = {
  background: "var(--bg-accent)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  padding: "4px 10px",
  fontSize: 13,
  cursor: "pointer",
  color: "var(--text-normal)",
  fontWeight: 600,
  flexShrink: 0,
};

const closeBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--text-muted)", fontSize: 22, lineHeight: 1,
};

// ─── API Key input with reveal + copy ─────────────────────────────────────────

function ApiKeyInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 4 }}>
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, flex: 1 }}
          autoComplete="off"
        />
        <button
          onClick={() => setVisible(!visible)}
          title={visible ? "Ocultar" : "Mostrar"}
          style={{
            background: "var(--bg-accent)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "0 8px",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: 16,
            lineHeight: 1,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {visible ? "🙈" : "👁"}
        </button>
        <button
          onClick={handleCopy}
          title="Copiar"
          disabled={!value}
          style={{
            background: copied ? "rgba(59,165,93,0.15)" : "var(--bg-accent)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "0 8px",
            cursor: value ? "pointer" : "not-allowed",
            color: copied ? "var(--status-online)" : "var(--text-muted)",
            fontSize: 13,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 150ms",
          }}
        >
          {copied ? "✓" : "📋"}
        </button>
      </div>
    </Field>
  );
}
