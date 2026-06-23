import { create } from "zustand";

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

export interface DmAiRule {
  id: string;
  account_id: string;
  enabled: boolean;
  config: AiConfig;
  reply_delay_ms: number;
}

interface AiStore {
  rules: AiAutoReplyRule[];
  dmRules: DmAiRule[];
  globalConfig: AiConfig | null;
  isGenerating: Record<string, boolean>;

  setGlobalConfig: (config: AiConfig) => void;
  clearGlobalConfig: () => void;

  addRule: (rule: AiAutoReplyRule) => void;
  updateRule: (id: string, patch: Partial<AiAutoReplyRule>) => void;
  removeRule: (id: string) => void;
  toggleRule: (id: string) => void;

  setDmRule: (rule: DmAiRule) => void;
  removeDmRule: (accountId: string) => void;
  toggleDmRule: (accountId: string) => void;

  generate: (payload: AiGeneratePayload) => Promise<AiGenerateResult>;
  testConfig: (config: AiConfig, testMessage: string) => Promise<string>;

  handleIncomingMessage: (
    accountId: string,
    channelId: string,
    guildId: string | null,
    authorId: string,
    content: string,
    messageId: string,
  ) => void;

  handleIncomingDm: (
    accountId: string,
    channelId: string,
    senderName: string,
    content: string,
    messageId: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
  ) => void;
}

export const OPENROUTER_MODELS: any[] = [];
export const GOOGLE_MODELS: any[] = [];

export const useAiStore = create<AiStore>()((set) => ({
  rules: [],
  dmRules: [],
  globalConfig: null,
  isGenerating: {},

  setGlobalConfig: () => {},
  clearGlobalConfig: () => {},
  addRule: () => {},
  updateRule: () => {},
  removeRule: () => {},
  toggleRule: () => {},
  setDmRule: () => {},
  removeDmRule: () => {},
  toggleDmRule: () => {},

  generate: async () => ({ text: "AI is disabled.", sent: false }),
  testConfig: async () => "AI is disabled.",
  handleIncomingMessage: () => {},
  handleIncomingDm: () => {},
}));

export function makeDefaultConfig(provider: AiProvider = "openrouter"): AiConfig {
  return {
    provider,
    api_key: "",
    model: "",
    system_prompt: "",
    temperature: 0.7,
    max_tokens: 500,
  };
}
