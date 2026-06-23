export type AiConfig = any;
export type AiMessage = any;

export type ConversationStatus = "idle" | "running" | "paused" | "error" | "generating";

export interface AiParticipantProfile {
  username: string;
  display_name: string | null;
  user_id: string;
  bio: string | null;
  discriminator: string;
}

export interface AiParticipant {
  id: string;
  account_id: string;
  user_id: string;
  username: string;
  color: string;
  config: AiConfig;
  personality: string;
  delay_base_ms: number;
  delay_jitter_ms: number;
  profile?: AiParticipantProfile | null;
}

export interface OrchestratorConfig {
  enabled: boolean;
  api_key: string;
  interval_turns: number;
  extra_instructions: string;
}

export interface AiConversation {
  id: string;
  label: string;
  channel_id: string;
  guild_id: string | null;
  participants: AiParticipant[];
  topic: string;
  enabled: boolean;
  created_at: string;
  context_messages: number;
  orchestrator?: OrchestratorConfig | null;
  drop_reaction_emoji: string;
  drop_response_template: string;
}

export interface ConvLogEntry {
  ts: number;
  conv_id: string;
  participant_id: string;
  participant_name: string;
  participant_color: string;
  type: string;
  text?: string;
  block_index?: number;
  block_total?: number;
}

export interface ConvRuntimeInfo {
  status: ConversationStatus;
  error: string | null;
  rounds: number;
  next_participant_id: string | null;
  next_participant_name: string | null;
  next_participant_color: string | null;
  burst_lock_id: string | null;
  burst_lock_name: string | null;
  countdown_ms: number | null;
  countdown_started_at: number | null;
  countdown_total_ms: number | null;
  is_generating: boolean;
  generating_participant_name: string | null;
  generating_participant_color: string | null;
}

export interface AiConversationStore {
  conversations: AiConversation[];
  runtimeInfo: Record<string, ConvRuntimeInfo>;
  addConversation: (conv: AiConversation) => void;
  updateConversation: (id: string, patch: Partial<AiConversation>) => void;
  removeConversation: (id: string) => void;
  startConversation: (id: string) => void;
  stopConversation: (id: string) => void;
  addLog: (log: any) => void;
  clearLogs: (id: string) => void;
  _setInfo: (convId: string, patch: Partial<ConvRuntimeInfo>) => void;
}
