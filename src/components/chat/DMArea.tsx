import { useEffect, useState, useCallback, useRef } from "react";
import { useDiscordStore } from "@/stores/discordStore";
import { useAccountStore } from "@/stores/accountStore";
import { useAiStore, makeDefaultConfig } from "@/stores/aiStore";
import type { DmAiRule } from "@/stores/aiStore";
import { MessageList } from "./MessageList";
import { MessageInput, AttachmentData } from "./MessageInput";
import { Avatar } from "@/components/ui/Avatar";
import type { DiscordMessage } from "@/types";
import { OPENROUTER_MODELS, GOOGLE_MODELS } from "@/stores/aiStore";
import type { AiConfig, AiProvider } from "@/stores/aiStore";
import * as api from "@/lib/tauri";
import { ActiveCallArea } from "./ActiveCallArea";
import { Bot, X, Phone, Video, Pin, Search } from "lucide-react";
import { useVoiceStore } from "@/stores/voiceStore";
import { PinnedMessagesPopover } from "./PinnedMessagesPopover";
import { SearchResultsSidebar } from "./SearchResultsSidebar";
import { TypingIndicator } from "./TypingIndicator";

interface Props {
  channelId: string;
  accountId: string;
}

export function DMArea({ channelId, accountId }: Props) {
  const { cache, loading, fetchMessages, fetchMoreMessages, sendMessage, fetchDMs } =
    useDiscordStore();
  const { accounts } = useAccountStore();
  const { dmRules } = useAiStore();
  const { joinCall, leaveCall, isConnecting, isConnected, channelId: voiceChannelId } = useVoiceStore();
  const [replyingTo, setReplyingTo] = useState<DiscordMessage | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const seenDmIds = useRef<Set<string>>(new Set());

  const messages = cache.messages[channelId] ?? [];
  const isLoading = loading.messages[channelId];
  const account = accounts.find((a) => a.id === accountId);

  const dms = cache.dms[accountId] ?? [];
  const dm = dms.find((d) => d.id === channelId);
  const recipient = dm?.recipients[0];

  const dmRule = dmRules.find((r) => r.account_id === accountId);

  // Initial load
  useEffect(() => {
    if (!cache.messages[channelId]) fetchMessages(accountId, channelId);
    if (!cache.dms[accountId]) fetchDMs(accountId);
    useDiscordStore.getState().clearUnread(accountId, channelId);
    setSearchQuery(null);
  }, [channelId, accountId]);

  // Seed seenDmIds with already loaded messages so we don't reply to old ones
  useEffect(() => {
    const msgs = cache.messages[channelId] ?? [];
    for (const m of msgs) seenDmIds.current.add(m.id);
  }, [channelId]);

  // Polling: fetch new messages via `after` cursor, trigger DM AI reply on new ones
  useEffect(() => {
    const poll = async () => {
      const existing = useDiscordStore.getState().cache.messages[channelId];
      const newestReal = existing?.find((m) => !m.id.startsWith("local-"));
      if (!newestReal) return;

      let fresh: DiscordMessage[];
      try {
        fresh = await api.getMessages(accountId, channelId, undefined, newestReal.id);
      } catch {
        return;
      }
      if (fresh.length === 0) return;

      useDiscordStore.setState((s) => {
        const cur = s.cache.messages[channelId] ?? [];
        const realIds = new Set(cur.filter((m) => !m.id.startsWith("local-")).map((m) => m.id));
        const toAdd = fresh.filter((m) => !realIds.has(m.id));
        if (toAdd.length === 0) return s;
        const freshFps = new Set(fresh.map((m) => `${m.author.id}:${m.content.trim()}`));
        const deduped = cur.filter(
          (m) => !m.id.startsWith("local-") || !freshFps.has(`${m.author.id}:${m.content.trim()}`)
        );
        const sorted = [...toAdd].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
        return { cache: { ...s.cache, messages: { ...s.cache.messages, [channelId]: [...sorted, ...deduped] } } };
      });

      // Trigger DM AI reply for new messages not from this account
      const myUserId = account?.user_id;
      if (myUserId) {
        const { handleIncomingDm } = useAiStore.getState();
        const allMsgs = useDiscordStore.getState().cache.messages[channelId] ?? [];
        // Build history for context (last 20 msgs, excluding new ones to reply)
        const history = allMsgs
          .slice(0, 20)
          .reverse()
          .map((m) => ({
            role: (m.author.id === myUserId ? "assistant" : "user") as "user" | "assistant",
            content: m.author.id === myUserId ? m.content : `${m.author.username}: ${m.content}`,
          }));

        for (const msg of fresh) {
          if (seenDmIds.current.has(msg.id)) continue;
          seenDmIds.current.add(msg.id);
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
    };

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [channelId, accountId, account?.user_id]);

  const handleSend = useCallback(async (content: string, attachment?: AttachmentData) => {
    if (!accountId || !channelId) return;
    try {
      if (attachment) {
        if (attachment.type === "file") {
          const buffer = await attachment.file.arrayBuffer();
          const data = new Uint8Array(buffer);
          await useDiscordStore.getState().sendMessageWithAttachment(
            accountId,
            channelId,
            content,
            replyingTo?.id,
            attachment.file.name,
            undefined,
            data
          );
        } else if (attachment.type === "path") {
          await useDiscordStore.getState().sendMessageWithAttachment(
            accountId,
            channelId,
            content,
            replyingTo?.id,
            attachment.name,
            attachment.path,
            undefined
          );
        }
      } else {
        await sendMessage(accountId, channelId, content, replyingTo?.id);
      }
      setReplyingTo(null);
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  }, [accountId, channelId, replyingTo, sendMessage]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-primary)" }}>
      {/* Header */}
      <div
        style={{
          height: 48,
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        {recipient && (
          <>
            <Avatar userId={recipient.id} avatarHash={recipient.avatar} avatarDecoration={recipient.avatar_decoration_data} username={recipient.username} size={32} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {recipient.global_name ?? recipient.username}
            </span>
            {recipient.bot && (
              <span style={{ fontSize: 10, fontWeight: 700, background: "var(--brand-500)", color: "#fff", padding: "1px 5px", borderRadius: "var(--radius-xs)" }}>
                BOT
              </span>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Ícones da Direita (estilo Discord) */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: "var(--interactive-normal)" }}>
          <button
            onClick={() => {
              if (isConnected || isConnecting) {
                leaveCall();
              } else {
                joinCall(accountId, null, channelId);
              }
            }}
            disabled={isConnecting}
            title={isConnected ? "Desligar chamada" : "Iniciar chamada de voz"}
            className="header-icon-button"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isConnected ? "var(--status-online)" : "inherit",
              opacity: isConnecting ? 0.5 : 1,
              padding: 0,
              transition: "color 0.2s",
            }}
          >
            <Phone size={24} strokeWidth={2} fill={isConnected ? "currentColor" : "none"} />
          </button>

          <button
            title="Iniciar chamada de vídeo"
            className="header-icon-button"
            style={{
              background: "transparent",
              border: "none",
              cursor: "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "inherit",
              padding: 0,
              opacity: 0.5,
            }}
          >
            <Video size={24} strokeWidth={2} />
          </button>

          <PinnedMessagesPopover channels={[]} />

          {/* Search input */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--bg-tertiary)",
              borderRadius: "var(--radius-sm)",
              padding: "4px 8px",
              width: 160,
              gap: 6,
            }}
          >
            <input
              placeholder="Buscar..."
              onKeyDown={(e) => {
                 if (e.key === "Enter" && e.currentTarget.value) {
                   setSearchQuery(e.currentTarget.value);
                 }
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-normal)",
                outline: "none",
                width: "100%",
                fontSize: 13,
              }}
            />
            <Search size={14} color="var(--text-muted)" />
          </div>

          {/* DM AI toggle */}
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
        </div>
      </div>

      {/* Messages / Call Area */}
      {(isConnected || isConnecting) && channelId === voiceChannelId && recipient && (
        <ActiveCallArea recipient={recipient} />
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <MessageList
              messages={messages}
              isLoading={isLoading}
              currentUserId={account?.user_id ?? ""}
              onLoadMore={() => fetchMoreMessages(accountId, channelId)}
              onReply={setReplyingTo}
            />
          </div>

          <TypingIndicator channelId={channelId} />

          <MessageInput
            channelId={channelId}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onSend={handleSend}
            accountColor={account?.color}
          />
        </div>

        {searchQuery !== null && (
          <SearchResultsSidebar
            accountId={accountId}
            channelId={channelId}
            query={searchQuery}
            onClose={() => setSearchQuery(null)}
            onSearch={setSearchQuery}
          />
        )}
      </div>

      {showAiModal && (
        <DmAiModal accountId={accountId} onClose={() => setShowAiModal(false)} />
      )}
    </div>
  );
}

// ─── DM AI Config Modal ───────────────────────────────────────────────────────

function DmAiModal({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { dmRules, setDmRule, removeDmRule, toggleDmRule } = useAiStore();
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
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
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
