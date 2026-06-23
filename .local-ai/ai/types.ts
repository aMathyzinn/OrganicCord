import type { AiConfig, AiMessage } from "@/stores/aiStore";
import type { OrchestratorDirective } from "./orchestrator";

export type { AiConfig, AiMessage };

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
  // How many conversation turns between each orchestrator check
  interval_turns: number;
  // Optional extra instructions for the orchestrator itself
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
  // Drop relâmpago: when a message matching these keywords is detected,
  // all participants race to react + respond as fast as possible
  drop_reaction_emoji: string;       // emoji to react with (e.g. "⚡", "🔥", "🎉")
  drop_response_template: string;    // quick response text template (e.g. "eu quero!", "bora!", "primeiro!")
}

export interface ChannelMessage {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  timestamp: string;
  reply_to_message_id?: string | null;
}

// Per-participant memory: remembers facts/context about each human user
export interface ParticipantMemory {
  // history of messages exchanged with this human (author_id → messages)
  user_threads: Record<string, ChannelMessage[]>;
  // free-form notes the AI accumulated about each user
  user_notes: Record<string, string>;
  // if actively in a 1:1 thread with a user, their id is stored here
  active_dm_user_id: string | null;
  // timestamp of last message in the active DM thread
  active_dm_last_ts: number;
}

export function makeParticipantMemory(): ParticipantMemory {
  return { user_threads: {}, user_notes: {}, active_dm_user_id: null, active_dm_last_ts: 0 };
}

export interface RuntimeState {
  status: ConversationStatus;
  error: string | null;
  next_participant_idx: number;
  rounds: number;
  timer_id: ReturnType<typeof setTimeout> | null;
  seen_message_ids: Set<string>;
  burst_lock: string | null;
  local_sent: ChannelMessage[];
  last_speaker_id: string | null;
  same_pair_turns: number;
  pending_human_msg: ChannelMessage | null;
  human_responder_id: string | null;
  profile_cache: Record<string, AiParticipantProfile>;
  pending_mention: Record<string, ChannelMessage | null>;
  recent_contents: string[];
  loop_override: string | null;
  loop_streak: number;
  // Tracks real Discord message IDs sent by each bot: message_id → participant.user_id
  sent_message_ids: Map<string, string>;
  // Orchestrator state
  last_orchestrator_round: number;
  orchestrator_directive: OrchestratorDirective | null;
  orchestrator_running: boolean;
  // Natural pacing
  turns_since_pause: number;
  last_message_ts: number;
  // Greeting & anti-bot events
  greeted_message_ids: Set<string>;
  bot_check_message_ids: Set<string>;
  // Per-participant memory & DM state (participant.id → memory)
  participant_memory: Record<string, ParticipantMemory>;
  // Call refusal tracking: message IDs already handled
  call_request_message_ids: Set<string>;
  // Topic staleness tracking: how many consecutive turns on the same topic fingerprint
  topic_stale_turns: number;
  // Last topic fingerprint (serialized as sorted word array joined)
  last_topic_key: string;
  // Addressee lock: when the last message was directed at a specific bot,
  // only that bot should respond. Cleared after they respond.
  // Format: { participant_id, message_id } — message_id to avoid double-processing
  addressee_lock: { participant_id: string; message_id: string } | null;
}

export interface ConvLogEntry {
  ts: number;
  conv_id: string;
  participant_id: string;
  participant_name: string;
  participant_color: string;
  type: "sent" | "burst_start" | "burst_end" | "skipped" | "waiting" | "error" | "rate_limit" | "generating" | "loop_break";
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
  runtimeStatus: Record<string, ConversationStatus>;
  runtimeError: Record<string, string | null>;
  runtimeRounds: Record<string, number>;
  runtimeInfo: Record<string, ConvRuntimeInfo>;
  log: ConvLogEntry[];

  addConversation: (conv: AiConversation) => void;
  updateConversation: (id: string, patch: Partial<AiConversation>) => void;
  removeConversation: (id: string) => void;
  startConversation: (id: string) => void;
  pauseConversation: (id: string) => void;
  stopConversation: (id: string) => void;
  resetConversation: (id: string) => void;
  _pushLog: (entry: ConvLogEntry) => void;
  _setInfo: (convId: string, patch: Partial<ConvRuntimeInfo>) => void;
  _startCountdown: (convId: string, totalMs: number) => void;
}

export function defaultInfo(): ConvRuntimeInfo {
  return {
    status: "idle", error: null, rounds: 0,
    next_participant_id: null, next_participant_name: null, next_participant_color: null,
    burst_lock_id: null, burst_lock_name: null,
    countdown_ms: null, countdown_started_at: null, countdown_total_ms: null,
    is_generating: false, generating_participant_name: null, generating_participant_color: null,
  };
}

export function makeRuntime(): RuntimeState {
  return {
    status: "idle",
    error: null,
    next_participant_idx: 0,
    rounds: 0,
    timer_id: null,
    seen_message_ids: new Set(),
    burst_lock: null,
    local_sent: [],
    last_speaker_id: null,
    same_pair_turns: 0,
    pending_human_msg: null,
    human_responder_id: null,
    profile_cache: {},
    pending_mention: {},
    recent_contents: [],
    loop_override: null,
    loop_streak: 0,
    sent_message_ids: new Map(),
    last_orchestrator_round: 0,
    orchestrator_directive: null,
    orchestrator_running: false,
    turns_since_pause: 0,
    last_message_ts: Date.now(),
    greeted_message_ids: new Set(),
    bot_check_message_ids: new Set(),
    participant_memory: {},
    call_request_message_ids: new Set(),
    topic_stale_turns: 0,
    last_topic_key: "",
    addressee_lock: null,
  };
}
