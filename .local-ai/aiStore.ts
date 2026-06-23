import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

const uid = () => crypto.randomUUID();

export type AiProvider = "openrouter" | "google";

export interface AiConfig {
  provider: AiProvider;
  api_key: string;
  model: string;
  system_prompt: string;
  temperature: number | null;
  max_tokens: number | null;
}

export interface AiAutoReplyRule {
  id: string;
  account_id: string;
  channel_id: string;
  guild_id: string | null;
  enabled: boolean;
  config: AiConfig;
  trigger_prefix: string | null;
  reply_delay_ms: number | null;
}

export interface AiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AiGeneratePayload {
  config: AiConfig;
  messages: AiMessage[];
  account_id: string;
  channel_id: string;
  send: boolean;
  reply_to: string | null;
}

export interface AiGenerateResult {
  text: string;
  sent: boolean;
}

// ─── DM AI Rule ───────────────────────────────────────────────────────────────
// One rule per account: responds to ALL incoming DMs for that account.

export interface DmAiRule {
  id: string;
  account_id: string;
  enabled: boolean;
  config: AiConfig;
  reply_delay_ms: number;
}

// Pending auto-reply timers: channelId → timeoutId
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface AiStore {
  rules: AiAutoReplyRule[];
  dmRules: DmAiRule[];
  globalConfig: AiConfig | null;
  isGenerating: Record<string, boolean>;  // channelId → bool

  setGlobalConfig: (config: AiConfig) => void;
  clearGlobalConfig: () => void;

  addRule: (rule: AiAutoReplyRule) => void;
  updateRule: (id: string, patch: Partial<AiAutoReplyRule>) => void;
  removeRule: (id: string) => void;
  toggleRule: (id: string) => void;

  // DM AI rules
  setDmRule: (rule: DmAiRule) => void;
  removeDmRule: (accountId: string) => void;
  toggleDmRule: (accountId: string) => void;

  generate: (payload: AiGeneratePayload) => Promise<AiGenerateResult>;
  testConfig: (config: AiConfig, testMessage: string) => Promise<string>;

  // Called by message listener to trigger auto-reply
  handleIncomingMessage: (
    accountId: string,
    channelId: string,
    guildId: string | null,
    authorId: string,
    content: string,
    messageId: string,
  ) => void;

  // Called by DM polling to trigger DM auto-reply
  handleIncomingDm: (
    accountId: string,
    channelId: string,
    senderName: string,
    content: string,
    messageId: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
  ) => void;
}

const DEFAULT_SYSTEM_PROMPT =
  "Você é um usuário real do Discord. Responda de forma CURTÍSSIMA, informal, com gírias (ce, pra, slk, vdd, kk). 1 frase só. Tipo celular. Sem markdown. Sem respostas completas. Pode discordar, zuar, ou mudar de assunto.";

export const OPENROUTER_MODELS = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini (rápido)" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5" },
  { id: "google/gemini-pro-1.5", label: "Gemini Pro 1.5" },
  { id: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B (grátis)" },
  { id: "mistralai/mistral-7b-instruct:free", label: "Mistral 7B (grátis)" },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
];

export const GOOGLE_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite Preview" },
  { id: "gemini-2.5-flash-lite-preview-06-17", label: "Gemini 2.5 Flash Lite Preview" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { id: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash 8B (leve)" },
];

export const useAiStore = create<AiStore>()(
  persist(
    (set, get) => ({
      rules: [],
      dmRules: [],
      globalConfig: null,
      isGenerating: {},

      setGlobalConfig: (config) => set({ globalConfig: config }),
      clearGlobalConfig: () => set({ globalConfig: null }),

      addRule: (rule) => set((s) => ({ rules: [...s.rules, rule] })),

      updateRule: (id, patch) =>
        set((s) => ({
          rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      removeRule: (id) => {
        const timer = pendingTimers.get(id);
        if (timer) { clearTimeout(timer); pendingTimers.delete(id); }
        set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
      },

      toggleRule: (id) =>
        set((s) => ({
          rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
        })),

      setDmRule: (rule) =>
        set((s) => ({
          dmRules: [
            ...s.dmRules.filter((r) => r.account_id !== rule.account_id),
            rule,
          ],
        })),

      removeDmRule: (accountId) =>
        set((s) => ({ dmRules: s.dmRules.filter((r) => r.account_id !== accountId) })),

      toggleDmRule: (accountId) =>
        set((s) => ({
          dmRules: s.dmRules.map((r) =>
            r.account_id === accountId ? { ...r, enabled: !r.enabled } : r
          ),
        })),

      generate: async (payload) => {
        set((s) => ({ isGenerating: { ...s.isGenerating, [payload.channel_id]: true } }));
        try {
          const result = await invoke<AiGenerateResult>("ai_generate", { payload });
          return result;
        } finally {
          set((s) => ({ isGenerating: { ...s.isGenerating, [payload.channel_id]: false } }));
        }
      },

      testConfig: async (config, testMessage) => {
        return invoke<string>("ai_test_config", { config, testMessage });
      },

      handleIncomingMessage: (accountId, channelId, guildId, authorId, content, messageId) => {
        const { rules, generate } = get();

        const matchingRules = rules.filter(
          (r) => r.enabled && r.account_id === accountId && r.channel_id === channelId
        );
        if (matchingRules.length === 0) return;

        for (const rule of matchingRules) {
          if (rule.trigger_prefix && !content.startsWith(rule.trigger_prefix)) continue;

          const delay = rule.reply_delay_ms ?? 1000;
          const timerKey = `${rule.id}-${messageId}`;

          const timer = setTimeout(async () => {
            pendingTimers.delete(timerKey);
            try {
              await generate({
                config: rule.config,
                messages: [{ role: "user", content }],
                account_id: accountId,
                channel_id: channelId,
                send: true,
                reply_to: messageId,
              });
            } catch (e) {
              console.error("[AiStore] auto-reply failed:", e);
            }
          }, delay);

          pendingTimers.set(timerKey, timer);
        }
      },

      handleIncomingDm: (accountId, channelId, senderName, content, messageId, history) => {
        const { dmRules, generate } = get();
        const rule = dmRules.find((r) => r.account_id === accountId && r.enabled);
        if (!rule) return;

        const timerKey = `dm-${accountId}-${messageId}`;
        if (pendingTimers.has(timerKey)) return;

        const timer = setTimeout(async () => {
          pendingTimers.delete(timerKey);
          try {
            const messages: AiMessage[] = [
              ...history,
              { role: "user", content: `${senderName}: ${content}` },
            ];
            await generate({
              config: rule.config,
              messages,
              account_id: accountId,
              channel_id: channelId,
              send: true,
              reply_to: messageId,
            });
          } catch (e) {
            console.error("[AiStore] DM auto-reply failed:", e);
          }
        }, rule.reply_delay_ms);

        pendingTimers.set(timerKey, timer);
      },
    }),
    {
      name: "organiccord-ai",
      partialize: (s) => ({ rules: s.rules, dmRules: s.dmRules, globalConfig: s.globalConfig }),
    }
  )
);

export function makeDefaultConfig(provider: AiProvider = "openrouter"): AiConfig {
  return {
    provider,
    api_key: "",
    model: provider === "openrouter" ? "openai/gpt-4o-mini" : "gemini-2.0-flash",
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    temperature: 0.7,
    max_tokens: 500,
  };
}
