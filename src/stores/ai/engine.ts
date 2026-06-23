import { invoke } from "@tauri-apps/api/core";
import { useDiscordStore } from "@/stores/discordStore";
import { getSelfProfile } from "@/lib/tauri";
import type {
  AiParticipant, AiConversation, RuntimeState, ChannelMessage,
  AiConversationStore, ConvLogEntry, ConvRuntimeInfo,
} from "./types";
import { defaultInfo, makeRuntime } from "./types";
import type { AiConfig } from "@/stores/aiStore";
import {
  detectLoop, buildLoopBreakInstruction, parseBurstBlocks,
  buildSystemPrompt, buildBlockSystemPrompt, buildInterventionSystemPrompt,
  buildHumanReplySystemPrompt, buildGreetingSystemPrompt, buildBotCheckDenialSystemPrompt,
  buildCallRefusalSystemPrompt, buildDmSystemPrompt,
  buildContextMessages,
  maybeExternalHook, isPersonalQuestion, shouldDisagree, randomBreakTopic,
  detectAddressee,
} from "./prompts";
import { makeParticipantMemory } from "./types";
import { runOrchestrator, runResumeOrchestrator, ORCHESTRATOR_COLOR } from "./orchestrator";

// ─── Runtime map (in-memory, per-session) ────────────────────────────────────
// This lives outside Zustand intentionally: it holds non-serialisable values
// (Set, setTimeout handles) and is rebuilt on app restart.

export const runtimeMap = new Map<string, RuntimeState>();

export function getRuntime(id: string): RuntimeState {
  if (!runtimeMap.has(id)) {
    runtimeMap.set(id, makeRuntime());
  }
  return runtimeMap.get(id)!;
}

// ─── Global rate limiter ──────────────────────────────────────────────────────

const lastCallTime = new Map<string, number>();

function minIntervalMs(provider: string): number {
  if (provider === "google") return 32_000;
  return 6_000;
}

async function waitForRateLimit(
  config: AiConfig,
  convId?: string,
  participantName?: string,
  participantColor?: string
): Promise<void> {
  const key = `${config.provider}:${config.api_key.slice(-8)}`;
  const interval = minIntervalMs(config.provider);
  const now = Date.now();
  const last = lastCallTime.get(key) ?? 0;
  const wait = Math.max(0, last + interval - now);
  if (wait > 0) {
    if (convId) {
      // lazy import to avoid circular dep
      const { useAiConversationStore } = await import("./store");
      useAiConversationStore.getState()._setInfo(convId, {
        is_generating: true,
        generating_participant_name: participantName ?? null,
        generating_participant_color: participantColor ?? null,
      });
    }
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCallTime.set(key, Date.now());
}

// ─── API call with retry ──────────────────────────────────────────────────────

async function invokeWithRetry(
  payload: Record<string, unknown>,
  convId?: string,
  participantName?: string,
  participantColor?: string,
  maxRetries = 2
): Promise<{ text: string; sent: boolean }> {
  const config = payload.config as AiConfig;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    await waitForRateLimit(config, convId, participantName, participantColor);
    try {
      return await invoke<{ text: string; sent: boolean }>("ai_generate", { payload });
    } catch (e) {
      lastError = e;
      const msg = String(e).toLowerCase();
      const isRate =
        msg.includes("429") || msg.includes("too many") ||
        msg.includes("rate limit") || msg.includes("quota");
      if (!isRate) throw e;
      const key = `${config.provider}:${config.api_key.slice(-8)}`;
      lastCallTime.set(key, Date.now());
      const extraWait = minIntervalMs(config.provider) * (attempt + 1);
      console.warn(`[AI Conv] 429 recebido, espera adicional de ${extraWait / 1000}s`);
      await new Promise((r) => setTimeout(r, extraWait));
    }
  }
  throw lastError;
}

// ─── Discord cache helper ─────────────────────────────────────────────────────

export function addMessageToDiscordCache(
  channelId: string,
  authorId: string,
  authorName: string,
  content: string
) {
  const fakeMsg = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    content,
    author: { id: authorId, username: authorName, discriminator: "0", avatar: null },
    timestamp: new Date().toISOString(),
    edited_timestamp: null,
    attachments: [],
    embeds: [],
    reactions: [],
    referenced_message: null,
  };
  useDiscordStore.getState().prependMessage(channelId, fakeMsg);
}

// ─── Profile fetcher ──────────────────────────────────────────────────────────

export async function fetchParticipantProfiles(
  participants: AiParticipant[],
  rt: RuntimeState
) {
  for (const p of participants) {
    if (rt.profile_cache[p.id]) continue;
    try {
      const user = await getSelfProfile(p.account_id);
      rt.profile_cache[p.id] = {
        username: user.username,
        display_name: user.global_name ?? null,
        user_id: user.id,
        bio: user.bio ?? null,
        discriminator: user.discriminator,
      };
    } catch {
      rt.profile_cache[p.id] = {
        username: p.username,
        display_name: null,
        user_id: p.user_id,
        bio: null,
        discriminator: "0",
      };
    }
  }
}

// ─── Delay helpers ────────────────────────────────────────────────────────────

function humanDelay(baseSec: number, jitterSec: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const ms = (baseSec + gauss * (jitterSec * 0.5)) * 1000;
  return Math.max(600, Math.round(ms));
}

/** Returns an extra delay (ms) based on message content length/complexity.
 *  Longer messages = more time "thinking". Short replies = almost no extra.
 */
function contextDelayMs(text: string): number {
  const len = text.length;
  if (len < 30) return 0;           // short reply — no extra
  if (len < 100) return 2_000;      // medium — +2s
  if (len < 250) return 5_000;      // long — +5s
  return 8_000;                     // very long — +8s
}

/** Randomly inserts a long pause to simulate real-life interruptions.
 *  Short pauses (1–5 min) are common. Very long pauses (10–30 min) are rare but happen.
 *  Probability increases with consecutive turns without a break.
 */
function longPauseDelayMs(consecutiveTurns: number): number {
  // Base 8% chance, growing 4% per turn since last pause, capped at 50%
  const chance = Math.min(0.5, 0.08 + consecutiveTurns * 0.04);
  if (Math.random() >= chance) return 0;

  // 85% chance: short pause (1–5 min). 15% chance: long pause (10–30 min).
  if (Math.random() < 0.85) {
    const pauseSec = 60 + Math.random() * 240;
    return Math.round(pauseSec * 1000);
  } else {
    // Long pause: 10–30 min — simulates someone going to eat, shower, etc.
    const pauseSec = 600 + Math.random() * 1200;
    return Math.round(pauseSec * 1000);
  }
}

// ─── Typo injection ───────────────────────────────────────────────────────────
// Simulates natural human typing errors in Portuguese — swaps chars, omits letters,
// adds double chars, or misses accents. Probability ~18% per message, only on short msgs.

const TYPO_SWAPS: Array<[string, string]> = [
  ["ã", "a"], ["ç", "c"], ["é", "e"], ["ê", "e"], ["ó", "o"], ["ô", "o"],
  ["í", "i"], ["á", "a"], ["ú", "u"], ["qu", "q"], ["lh", "l"], ["nh", "n"],
];

function injectTypo(text: string): string {
  if (text.length > 60 || Math.random() > 0.18) return text;
  const r = Math.random();
  if (r < 0.35) {
    // Swap/drop an accent or common digraph
    for (const [from, to] of TYPO_SWAPS) {
      if (text.includes(from) && Math.random() < 0.4) {
        return text.replace(from, to);
      }
    }
  } else if (r < 0.60) {
    // Drop a random vowel (not first char)
    const vowels = ["a", "e", "i", "o", "u"];
    const indices = [...text].map((c, i) => (i > 0 && vowels.includes(c) ? i : -1)).filter((i) => i >= 0);
    if (indices.length > 0) {
      const idx = indices[Math.floor(Math.random() * indices.length)];
      return text.slice(0, idx) + text.slice(idx + 1);
    }
  } else if (r < 0.80) {
    // Double a consonant
    const consonants = ["s", "r", "l", "n", "m", "t", "c"];
    const indices = [...text].map((c, i) => (i > 0 && consonants.includes(c) ? i : -1)).filter((i) => i >= 0);
    if (indices.length > 0) {
      const idx = indices[Math.floor(Math.random() * indices.length)];
      return text.slice(0, idx) + text[idx] + text.slice(idx);
    }
  }
  // else: no-op (keeps original)
  return text;
}

// ─── Activity rhythm ──────────────────────────────────────────────────────────
// Real users have bursts of activity followed by gaps. We model this as a simple
// per-session "energy" counter: 0 = dead, 1 = normal, 2+ = hot streak.
// Energy decays between turns and spikes when a human joins the chat.

let _sessionEnergy = 1.0;

export function spikeChatEnergy() {
  _sessionEnergy = Math.min(2.5, _sessionEnergy + 1.0);
}

function decayEnergy() {
  _sessionEnergy = Math.max(0.3, _sessionEnergy * 0.92);
}

function energyThinkMultiplier(): number {
  if (_sessionEnergy >= 2.0) return 0.55; // hot: much faster
  if (_sessionEnergy >= 1.2) return 0.80; // active: a bit faster
  if (_sessionEnergy <= 0.5) return 1.80; // dead: much slower
  return 1.0;
}

export function burstDelay(): number {
  return humanDelay(1.8, 1.4);
}

export function thinkDelay(participant: AiParticipant, extraMs = 0): number {
  return humanDelay(participant.delay_base_ms / 1000, participant.delay_jitter_ms / 1000) + extraMs;
}

// ─── Channel context helpers ──────────────────────────────────────────────────

export function getChannelContext(channelId: string, limit: number, rt: RuntimeState): ChannelMessage[] {
  const discordMsgs = useDiscordStore.getState().cache.messages[channelId] ?? [];
  const fromDiscord: ChannelMessage[] = [...discordMsgs]
    .reverse()
    .map((m) => ({
      id: m.id,
      author_id: m.author.id,
      author_name: m.author.global_name ?? m.author.username,
      content: m.content,
      timestamp: m.timestamp,
      reply_to_message_id: m.referenced_message?.id ?? null,
    }));

  const discordFingerprints = new Set(
    fromDiscord.map((m) => `${m.author_id}:${m.content.trim()}`)
  );
  rt.local_sent = rt.local_sent.filter(
    (m) => !discordFingerprints.has(`${m.author_id}:${m.content.trim()}`)
  );

  const combined = [...fromDiscord, ...rt.local_sent].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return combined.slice(-limit);
}

// ─── Store action helpers (to avoid circular dep in engine) ──────────────────

type StoreGetter = () => AiConversationStore;
type StoreSetter = (fn: (s: AiConversationStore) => Partial<AiConversationStore>) => void;

async function getStore() {
  const { useAiConversationStore } = await import("./store");
  return useAiConversationStore.getState();
}

function pushLog(convId: string, entry: Omit<ConvLogEntry, "ts" | "conv_id">) {
  getStore().then((s) => s._pushLog({ ts: Date.now(), conv_id: convId, ...entry }));
}

function setNextSpeaker(
  convId: string,
  conv: AiConversation,
  participantIdx: number,
  store: AiConversationStore
) {
  const p = conv.participants[participantIdx % conv.participants.length];
  store._setInfo(convId, {
    next_participant_id: p.id,
    next_participant_name: p.username,
    next_participant_color: p.color,
    burst_lock_id: null,
    burst_lock_name: null,
  });
}

function setBurstLock(
  convId: string,
  participant: AiParticipant | null,
  store: AiConversationStore
) {
  store._setInfo(convId, {
    burst_lock_id: participant?.id ?? null,
    burst_lock_name: participant?.username ?? null,
  });
}

// ─── Main turn runner ─────────────────────────────────────────────────────────

export async function runOneTurn(
  convId: string,
  get: StoreGetter,
  set: StoreSetter
): Promise<void> {
  const { useAiConversationStore } = await import("./store");
  const store = useAiConversationStore.getState();

  const convMaybe = get().conversations.find((c) => c.id === convId);
  const rt = getRuntime(convId);
  if (!convMaybe || rt.status !== "running") return;
  const conv = convMaybe; // non-null after guard

  const participantIdx = rt.next_participant_idx % conv.participants.length;
  const participant = conv.participants[participantIdx];

  // Wait if another participant holds the burst lock
  if (rt.burst_lock && rt.burst_lock !== participant.id) {
    store._pushLog({
      ts: Date.now(), conv_id: convId,
      participant_id: participant.id,
      participant_name: participant.username,
      participant_color: participant.color,
      type: "waiting",
    });
    rt.timer_id = setTimeout(() => {
      rt.timer_id = null;
      runOneTurn(convId, get, set).catch(console.error);
    }, 800);
    return;
  }

  // ── Decide parallel turn ─────────────────────────────────────────────────
  // With 3+ participants, 35% chance of 2 participants responding at once.
  // Disabled when addressee_lock is active — only one bot should answer.
  const parallelChance = conv.participants.length >= 3 && !rt.addressee_lock ? 0.35 : 0;
  const doParallel = Math.random() < parallelChance;
  const secondIdx = doParallel
    ? (participantIdx + 1 + Math.floor(Math.random() * (conv.participants.length - 1))) % conv.participants.length
    : -1;
  const secondParticipant = doParallel ? conv.participants[secondIdx] : null;

  const contextLimit = conv.context_messages ?? 30;
  const channelMsgs = getChannelContext(conv.channel_id, contextLimit, rt);

  // ── Human message detection (must happen before addressee_lock check) ────────
  // Collect ALL unseen human messages. Mark every one as seen immediately so
  // subsequent turns don't re-process them. Use only the latest for pending/reply logic.
  const aiUserIds = new Set(conv.participants.map((p) => p.user_id));
  const unseenHumanMsgs = channelMsgs.filter(
    (m) => !aiUserIds.has(m.author_id) && !m.id.startsWith("local-") && !rt.seen_message_ids.has(m.id)
  );
  // Mark all unseen human messages as seen right now to prevent re-processing
  for (const m of unseenHumanMsgs) rt.seen_message_ids.add(m.id);
  const latestHumanMsg = unseenHumanMsgs.length > 0
    ? unseenHumanMsgs[unseenHumanMsgs.length - 1]
    : null;

  // Set pending_human_msg only if there isn't one already in-flight
  if (latestHumanMsg && !rt.pending_human_msg) {
    spikeChatEnergy();
    let targetParticipant: AiParticipant | null = null;
    if (latestHumanMsg.reply_to_message_id) {
      const botUserId = rt.sent_message_ids.get(latestHumanMsg.reply_to_message_id);
      if (botUserId) {
        targetParticipant = conv.participants.find((p) => p.user_id === botUserId) ?? null;
      }
    }
    const responder = targetParticipant
      ?? (conv.participants.filter((p) => p.id !== rt.last_speaker_id)[0]
         ?? conv.participants[0]);
    rt.pending_human_msg = latestHumanMsg;
    rt.human_responder_id = responder.id;
  }

  // ── Addressee detection ───────────────────────────────────────────────────
  // Only scan human messages — bot messages never set the lock (would cause loops).
  // When a human addresses a specific bot, that bot gets priority for one turn.
  {
    // Find the most recent human message that hasn't been addr_checked yet
    const lastHumanMsg = [...channelMsgs].reverse().find(
      (m) => !aiUserIds.has(m.author_id) && !m.id.startsWith("local-") &&
             !rt.seen_message_ids.has(m.id + ":addr_checked")
    ) ?? null;

    if (lastHumanMsg) {
      rt.seen_message_ids.add(lastHumanMsg.id + ":addr_checked");

      const profiledParticipants = conv.participants.map((p) => ({
        ...p,
        profile: rt.profile_cache[p.id] ?? null,
      }));

      const replyToAuthorId = lastHumanMsg.reply_to_message_id
        ? rt.sent_message_ids.get(lastHumanMsg.reply_to_message_id) ?? undefined
        : undefined;

      const match = detectAddressee(
        lastHumanMsg.content,
        profiledParticipants,
        lastHumanMsg.author_id,
        replyToAuthorId,
      );

      if (match && rt.addressee_lock?.message_id !== lastHumanMsg.id) {
        rt.addressee_lock = { participant_id: match.participant_id, message_id: lastHumanMsg.id };
      } else if (!match) {
        rt.addressee_lock = null;
      }
    }

    // If lock is set and this is NOT the addressed bot, redirect immediately
    if (rt.addressee_lock && rt.addressee_lock.participant_id !== participant.id) {
      const targetIdx = conv.participants.findIndex((p) => p.id === rt.addressee_lock!.participant_id);
      if (targetIdx >= 0) {
        rt.next_participant_idx = targetIdx;
        setNextSpeaker(convId, conv, targetIdx, store);
      }
      store._setInfo(convId, { is_generating: false, generating_participant_name: null, generating_participant_color: null });
      if (rt.timer_id) { clearTimeout(rt.timer_id); rt.timer_id = null; }
      rt.timer_id = setTimeout(() => {
        rt.timer_id = null;
        runOneTurn(convId, get, set).catch(console.error);
      }, 400 + Math.random() * 600);
      return;
    }
  }

  // ── Orchestrator check ────────────────────────────────────────────────────
  // Fires every `interval_turns` rounds (and always on round 0 if enabled).
  // Runs async in background — doesn't block the turn. The directive it writes
  // into rt.orchestrator_directive is picked up by the NEXT turn's prompts.
  const orch = conv.orchestrator;
  if (orch?.enabled && orch.api_key) {
    const interval = Math.max(1, orch.interval_turns ?? 3);
    const roundsSinceLast = rt.rounds - rt.last_orchestrator_round;
    const isDue = rt.rounds === 0 || roundsSinceLast >= interval;
    if (isDue && !rt.orchestrator_running) {
      rt.last_orchestrator_round = rt.rounds;
      // Fire-and-forget: apply result when it resolves
      runOrchestrator(conv, rt, channelMsgs).then((result) => {
        if (!result) return;
        rt.orchestrator_directive = result.directive;
        store._pushLog({
          ts: Date.now(), conv_id: convId,
          participant_id: "orchestrator",
          participant_name: "Orquestrador",
          participant_color: ORCHESTRATOR_COLOR,
          type: "loop_break",
          text: `🎯 ${result.log_summary}`,
        });
      }).catch((e) => console.error("[Orchestrator] error:", e));
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Call request detection ────────────────────────────────────────────────
  // If anyone asks to join a voice call, all bots refuse with different excuses.
  const CALL_PATTERNS = /\b(call|voz|vc|voice|chama (no|pra) call|entra (no|na) call|bora call|vai call|chama|chamada)\b/i;
  if (latestHumanMsg && !rt.call_request_message_ids.has(latestHumanMsg.id)) {
    if (CALL_PATTERNS.test(latestHumanMsg.content)) {
      rt.call_request_message_ids.add(latestHumanMsg.id);
      store._pushLog({
        ts: Date.now(), conv_id: convId,
        participant_id: "system", participant_name: "📵 Call", participant_color: "#a78bfa",
        type: "loop_break",
        text: `Pedido de call detectado — todos vão recusar`,
      });
      conv.participants.map(async (p, idx) => {
        const stagger = idx * (1500 + Math.random() * 2000);
        await new Promise((r) => setTimeout(r, stagger));
        invoke<void>("discord_trigger_typing", { accountId: p.account_id, channelId: conv.channel_id }).catch(() => {});
        await new Promise((r) => setTimeout(r, 600 + Math.random() * 900));
        try {
          const result = await invokeWithRetry({
            config: {
              ...p.config,
              system_prompt: buildCallRefusalSystemPrompt(p, conv, latestHumanMsg.author_name),
              temperature: Math.min(1.2, (p.config.temperature ?? 0.9) + 0.2),
              max_tokens: 40,
            },
            messages: buildContextMessages(p, channelMsgs, conv, false),
            account_id: p.account_id, channel_id: conv.channel_id, send: false, reply_to: null,
          }, convId, p.username, p.color);
          const text = result.text.trim().split("|||")[0].trim();
          if (!text) return;
          const sentId = await invoke<string>("discord_send_text", { accountId: p.account_id, channelId: conv.channel_id, content: text, replyTo: latestHumanMsg.id });
          if (sentId) rt.sent_message_ids.set(sentId, p.user_id);
          addMessageToDiscordCache(conv.channel_id, p.user_id, p.username, text);
          rt.local_sent.push({ id: `local-${Date.now()}-${Math.random()}`, author_id: p.user_id, author_name: p.username, content: text, timestamp: new Date().toISOString() });
          rt.last_message_ts = Date.now();
          store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: p.id, participant_name: p.username, participant_color: p.color, type: "sent", text });
        } catch (e) { console.error(`[AI] call refusal failed for ${p.username}:`, e); }
      });
    }
  }

  // ── Global mention detection + DM mode + memory ───────────────────────────
  // Scans the most recent unhandled human message for mentions of any participant.
  // When found: enters DM mode (bot replies directly to that user without waiting
  // for round-robin) and uses per-participant memory for richer context.
  // DM mode expires after 3 min of silence from that user.
  const DM_TIMEOUT_MS = 3 * 60 * 1000;

  // Expire stale DM sessions
  for (const p of conv.participants) {
    const mem = rt.participant_memory[p.id];
    if (mem?.active_dm_user_id && Date.now() - mem.active_dm_last_ts > DM_TIMEOUT_MS) {
      mem.active_dm_user_id = null;
    }
  }

  // Update memory thread for every new human message seen
  if (latestHumanMsg) {
    for (const p of conv.participants) {
      if (!rt.participant_memory[p.id]) rt.participant_memory[p.id] = makeParticipantMemory();
      const mem = rt.participant_memory[p.id];
      const thread = mem.user_threads[latestHumanMsg.author_id] ?? [];
      if (!thread.some((m) => m.id === latestHumanMsg.id)) {
        thread.push(latestHumanMsg);
        if (thread.length > 40) thread.shift();
        mem.user_threads[latestHumanMsg.author_id] = thread;
      }
    }
  }

  for (const msg of [...channelMsgs].reverse()) {
    if (rt.seen_message_ids.has(msg.id + ":mention_handled")) break;
    if (msg.id.startsWith("local-")) continue;
    if (aiUserIds.has(msg.author_id)) continue;

    for (const target of conv.participants) {
      const tProfile = rt.profile_cache[target.id];
      const tNames = [
        target.username.toLowerCase(),
        tProfile?.display_name?.toLowerCase(),
        tProfile?.username?.toLowerCase(),
        `@${tProfile?.username?.toLowerCase() ?? target.username.toLowerCase()}`,
        `<@${target.user_id}>`,
      ].filter(Boolean) as string[];

      const lower = msg.content.toLowerCase();
      const isMentioned = tNames.some((n) => lower.includes(n));
      if (!isMentioned) continue;

      const mentionKey = `${msg.id}:mention:${target.id}`;
      if (rt.seen_message_ids.has(mentionKey)) continue;
      rt.seen_message_ids.add(mentionKey);
      rt.seen_message_ids.add(msg.id + ":mention_handled");

      // Activate DM mode for this participant ↔ user pair
      if (!rt.participant_memory[target.id]) rt.participant_memory[target.id] = makeParticipantMemory();
      const mem = rt.participant_memory[target.id];
      mem.active_dm_user_id = msg.author_id;
      mem.active_dm_last_ts = Date.now();

      store._pushLog({
        ts: Date.now(), conv_id: convId,
        participant_id: target.id, participant_name: target.username, participant_color: target.color,
        type: "generating",
      });

      ;(async () => {
        invoke<void>("discord_trigger_typing", { accountId: target.account_id, channelId: conv.channel_id }).catch(() => {});
        await new Promise((r) => setTimeout(r, 600 + Math.random() * 1200));
        try {
          const result = await invokeWithRetry({
            config: {
              ...target.config,
              system_prompt: buildDmSystemPrompt(target, conv, mem, msg.author_name, msg.author_id),
              temperature: target.config.temperature ?? 0.9,
              max_tokens: 60,
            },
            messages: buildContextMessages(target, channelMsgs, conv, false),
            account_id: target.account_id, channel_id: conv.channel_id, send: false, reply_to: null,
          }, convId, target.username, target.color);

          const text = result.text.trim().split("|||")[0].trim();
          if (!text) return;
          const sentId = await invoke<string>("discord_send_text", {
            accountId: target.account_id, channelId: conv.channel_id, content: text, replyTo: msg.id,
          });
          if (sentId) rt.sent_message_ids.set(sentId, target.user_id);
          addMessageToDiscordCache(conv.channel_id, target.user_id, target.username, text);
          const localMsg: ChannelMessage = { id: `local-${Date.now()}-${Math.random()}`, author_id: target.user_id, author_name: target.username, content: text, timestamp: new Date().toISOString() };
          rt.local_sent.push(localMsg);
          // Also record the bot's reply into the thread memory
          const thread = mem.user_threads[msg.author_id] ?? [];
          thread.push(localMsg);
          if (thread.length > 40) thread.shift();
          mem.user_threads[msg.author_id] = thread;
          rt.last_message_ts = Date.now();
          store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: target.id, participant_name: target.username, participant_color: target.color, type: "sent", text });
        } catch (e) { console.error(`[AI] DM reply failed for ${target.username}:`, e); }
      })().catch(console.error);
    }
    break;
  }

  // ── DM continuation: respond to user in active thread without waiting for turn ──
  // If a human sends a message and a bot has an active DM session with them,
  // that bot replies immediately regardless of whose round it is.
  if (latestHumanMsg && !rt.seen_message_ids.has(latestHumanMsg.id + ":dm_handled")) {
    for (const target of conv.participants) {
      const mem = rt.participant_memory[target.id];
      if (!mem?.active_dm_user_id) continue;
      if (mem.active_dm_user_id !== latestHumanMsg.author_id) continue;
      // Don't double-handle if this was already a mention reply
      if (rt.seen_message_ids.has(`${latestHumanMsg.id}:mention:${target.id}`)) continue;

      rt.seen_message_ids.add(latestHumanMsg.id + ":dm_handled");
      mem.active_dm_last_ts = Date.now();

      // Record message in thread
      const thread = mem.user_threads[latestHumanMsg.author_id] ?? [];
      if (!thread.some((m) => m.id === latestHumanMsg.id)) {
        thread.push(latestHumanMsg);
        if (thread.length > 40) thread.shift();
        mem.user_threads[latestHumanMsg.author_id] = thread;
      }

      store._pushLog({
        ts: Date.now(), conv_id: convId,
        participant_id: target.id, participant_name: target.username, participant_color: target.color,
        type: "generating",
      });

      ;(async () => {
        const delay = 800 + Math.random() * 1500;
        invoke<void>("discord_trigger_typing", { accountId: target.account_id, channelId: conv.channel_id }).catch(() => {});
        await new Promise((r) => setTimeout(r, delay));
        try {
          const result = await invokeWithRetry({
            config: {
              ...target.config,
              system_prompt: buildDmSystemPrompt(target, conv, mem, latestHumanMsg.author_name, latestHumanMsg.author_id),
              temperature: target.config.temperature ?? 0.9,
              max_tokens: 60,
            },
            messages: buildContextMessages(target, channelMsgs, conv, false),
            account_id: target.account_id, channel_id: conv.channel_id, send: false, reply_to: null,
          }, convId, target.username, target.color);

          const text = result.text.trim().split("|||")[0].trim();
          if (!text) return;
          const sentId = await invoke<string>("discord_send_text", {
            accountId: target.account_id, channelId: conv.channel_id, content: text,
            replyTo: latestHumanMsg.id,
          });
          if (sentId) rt.sent_message_ids.set(sentId, target.user_id);
          addMessageToDiscordCache(conv.channel_id, target.user_id, target.username, text);
          const localMsg: ChannelMessage = { id: `local-${Date.now()}-${Math.random()}`, author_id: target.user_id, author_name: target.username, content: text, timestamp: new Date().toISOString() };
          rt.local_sent.push(localMsg);
          mem.user_threads[latestHumanMsg.author_id] = [...(mem.user_threads[latestHumanMsg.author_id] ?? []), localMsg].slice(-40);
          rt.last_message_ts = Date.now();
          store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: target.id, participant_name: target.username, participant_color: target.color, type: "sent", text });
        } catch (e) { console.error(`[AI] DM continuation failed for ${target.username}:`, e); }
      })().catch(console.error);
    }
  }

  // ── Drop relâmpago detection ─────────────────────────────────────────────
  // Keywords that indicate a "drop" giveaway — all bots race to react + respond
  const DROP_KEYWORDS = ["drop", "primeiro", "ganha", "grátis", "gratis", "pack", "premium", "relâmpago", "relampago", "otimização", "otimizacao", "performance", "giveaway"];
  if (latestHumanMsg && !rt.seen_message_ids.has(latestHumanMsg.id + ":drop_handled")) {
    const lowerContent = latestHumanMsg.content.toLowerCase();
    const isDrop = DROP_KEYWORDS.filter((kw) => lowerContent.includes(kw)).length >= 2
      || (lowerContent.includes("drop") && lowerContent.includes("primeiro"))
      || (lowerContent.includes("drop") && lowerContent.includes("ganha"));

    if (isDrop) {
      rt.seen_message_ids.add(latestHumanMsg.id + ":drop_handled");
      // All participants race simultaneously — no round-robin, no delays
      const emoji = conv.drop_reaction_emoji || "⚡";
      const template = conv.drop_response_template || "eu quero!";

      store._pushLog({
        ts: Date.now(), conv_id: convId,
        participant_id: "system",
        participant_name: "⚡ Drop",
        participant_color: "#fbbf24",
        type: "loop_break",
        text: `Drop detectado! Todos correndo...`,
      });

      // Fire all participants in parallel — each reacts + responds
      const racers = conv.participants.map(async (p) => {
        // 1. React ASAP (no delay)
        invoke<void>("discord_add_reaction", {
          accountId: p.account_id,
          channelId: conv.channel_id,
          messageId: latestHumanMsg.id,
          emoji,
        }).catch(() => {});

        // 2. Tiny random delay (50-400ms) to simulate human reaction time variance
        const reactionDelay = 50 + Math.random() * 350;
        await new Promise((r) => setTimeout(r, reactionDelay));

        // 3. Send a quick response — use template with slight variation
        const variations = [
          template,
          `${template} 🔥`,
          `primeiro!!`,
          `eu quero!!`,
          `bora bora`,
          `pega pra mim`,
          `quero quero`,
          `é meu!`,
          `manda!`,
          `${template} ${template}`,
        ];
        const text = variations[Math.floor(Math.random() * variations.length)];

        try {
          const sentId = await invoke<string>("discord_send_text", {
            accountId: p.account_id,
            channelId: conv.channel_id,
            content: text,
            replyTo: latestHumanMsg.id,
          });
          if (sentId) rt.sent_message_ids.set(sentId, p.user_id);
          addMessageToDiscordCache(conv.channel_id, p.user_id, p.username, text);
          rt.local_sent.push({
            id: `local-${Date.now()}-${Math.random()}`,
            author_id: p.user_id,
            author_name: p.username,
            content: text,
            timestamp: new Date().toISOString(),
          });
          rt.last_message_ts = Date.now();
          store._pushLog({
            ts: Date.now(), conv_id: convId,
            participant_id: p.id,
            participant_name: p.username,
            participant_color: p.color,
            type: "sent",
            text,
          });
        } catch (e) {
          console.error(`[AI] drop response failed for ${p.username}:`, e);
        }
      });

      // Don't await — fire and let them race in background
      Promise.all(racers).catch(console.error);
    }
  }

  // ── Greeting detection ────────────────────────────────────────────────────
  // When a human sends a greeting, all bots acknowledge it with AI-generated
  // personalized responses, staggered with natural delays.
  const GREETING_PATTERNS = /^(oi|olá|ola|oie|opa|salve|e aí|eai|fala|hey|hi|hello|bom dia|boa tarde|boa noite|boa|eae|eae!|oii|oiii)\b/i;
  if (latestHumanMsg && !rt.greeted_message_ids.has(latestHumanMsg.id)) {
    const isGreeting = GREETING_PATTERNS.test(latestHumanMsg.content.trim());
    if (isGreeting) {
      rt.greeted_message_ids.add(latestHumanMsg.id);
      store._pushLog({
        ts: Date.now(), conv_id: convId,
        participant_id: "system", participant_name: "👋 Entrada", participant_color: "#34d399",
        type: "loop_break",
        text: `${latestHumanMsg.author_name} entrou na conversa — todos vão saudar`,
      });

      // Fire all participants in parallel with staggered delays
      const greeters = conv.participants.map(async (p, idx) => {
        // Stagger so they don't all reply at the same millisecond
        const stagger = idx * (1200 + Math.random() * 1800);
        await new Promise((r) => setTimeout(r, stagger));

        invoke<void>("discord_trigger_typing", { accountId: p.account_id, channelId: conv.channel_id }).catch(() => {});
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));

        try {
          const result = await invokeWithRetry({
            config: {
              ...p.config,
              system_prompt: buildGreetingSystemPrompt(p, conv, latestHumanMsg.author_name),
              temperature: Math.min(1.2, (p.config.temperature ?? 0.9) + 0.15),
              max_tokens: 40,
            },
            messages: buildContextMessages(p, channelMsgs, conv, false),
            account_id: p.account_id,
            channel_id: conv.channel_id,
            send: false,
            reply_to: null,
          }, convId, p.username, p.color);

          const text = result.text.trim().split("|||")[0].trim();
          if (!text) return;
          const sentId = await invoke<string>("discord_send_text", {
            accountId: p.account_id,
            channelId: conv.channel_id,
            content: text,
            replyTo: null,
          });
          if (sentId) rt.sent_message_ids.set(sentId, p.user_id);
          addMessageToDiscordCache(conv.channel_id, p.user_id, p.username, text);
          rt.local_sent.push({ id: `local-${Date.now()}-${Math.random()}`, author_id: p.user_id, author_name: p.username, content: text, timestamp: new Date().toISOString() });
          rt.last_message_ts = Date.now();
          store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: p.id, participant_name: p.username, participant_color: p.color, type: "sent", text });
        } catch (e) {
          console.error(`[AI] greeting failed for ${p.username}:`, e);
        }
      });
      Promise.all(greeters).catch(console.error);
    }
  }

  // ── Bot-check detection ───────────────────────────────────────────────────
  // When someone suspects the bots are bots, everyone denies naturally.
  const BOT_CHECK_PATTERNS = /\b(bot|robô|robo|ia|script|automatizado|fake|automático|automático|macro)\b/i;
  const BOT_CHECK_QUESTION = /(\?|é bot|são bot|vcs são|vocês são|isso é|tá automático|ta automatico|parece bot)/i;
  if (latestHumanMsg && !rt.bot_check_message_ids.has(latestHumanMsg.id)) {
    const content = latestHumanMsg.content;
    const isBotCheck = BOT_CHECK_PATTERNS.test(content) && BOT_CHECK_QUESTION.test(content);
    if (isBotCheck) {
      rt.bot_check_message_ids.add(latestHumanMsg.id);
      store._pushLog({
        ts: Date.now(), conv_id: convId,
        participant_id: "system", participant_name: "🛡️ Anti-bot", participant_color: "#f87171",
        type: "loop_break",
        text: `Suspeita de bot detectada — todos vão negar`,
      });

      const deniers = conv.participants.map(async (p, idx) => {
        const stagger = idx * (2000 + Math.random() * 3000);
        await new Promise((r) => setTimeout(r, stagger));

        invoke<void>("discord_trigger_typing", { accountId: p.account_id, channelId: conv.channel_id }).catch(() => {});
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 1000));

        try {
          const result = await invokeWithRetry({
            config: {
              ...p.config,
              system_prompt: buildBotCheckDenialSystemPrompt(p, conv, content),
              temperature: Math.min(1.2, (p.config.temperature ?? 0.9) + 0.2),
              max_tokens: 40,
            },
            messages: buildContextMessages(p, channelMsgs, conv, false),
            account_id: p.account_id,
            channel_id: conv.channel_id,
            send: false,
            reply_to: null,
          }, convId, p.username, p.color);

          const text = result.text.trim().split("|||")[0].trim();
          if (!text) return;
          const sentId = await invoke<string>("discord_send_text", {
            accountId: p.account_id,
            channelId: conv.channel_id,
            content: text,
            replyTo: latestHumanMsg.id,
          });
          if (sentId) rt.sent_message_ids.set(sentId, p.user_id);
          addMessageToDiscordCache(conv.channel_id, p.user_id, p.username, text);
          rt.local_sent.push({ id: `local-${Date.now()}-${Math.random()}`, author_id: p.user_id, author_name: p.username, content: text, timestamp: new Date().toISOString() });
          rt.last_message_ts = Date.now();
          store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: p.id, participant_name: p.username, participant_color: p.color, type: "sent", text });
        } catch (e) {
          console.error(`[AI] bot-check denial failed for ${p.username}:`, e);
        }
      });
      Promise.all(deniers).catch(console.error);
    }
  }

  if (rt.pending_human_msg && rt.human_responder_id === participant.id) {
    const humanMsg = rt.pending_human_msg;
    rt.pending_human_msg = null;
    rt.human_responder_id = null;
    rt.seen_message_ids.add(humanMsg.id);

    store._setInfo(convId, {
      is_generating: true,
      generating_participant_name: participant.username,
      generating_participant_color: participant.color,
      countdown_ms: null,
    });
    invoke<void>("discord_trigger_typing", { accountId: participant.account_id, channelId: conv.channel_id }).catch(() => {});

    try {
      const result = await invokeWithRetry({
        config: {
          ...participant.config,
          system_prompt: buildHumanReplySystemPrompt(participant, conv, humanMsg.author_name, channelMsgs),
          temperature: participant.config.temperature ?? 0.9,
          max_tokens: 60,
        },
        messages: buildContextMessages(participant, channelMsgs, conv, false),
        account_id: participant.account_id,
        channel_id: conv.channel_id,
        send: false,
        reply_to: null,
      }, convId, participant.username, participant.color);

      const text = result.text.trim().split("|||")[0].trim();
      if (text) {
        const sentId = await invoke<string>("discord_send_text", {
          accountId: participant.account_id,
          channelId: conv.channel_id,
          content: text,
          replyTo: humanMsg.id,
        });
        if (sentId) rt.sent_message_ids.set(sentId, participant.user_id);
        addMessageToDiscordCache(conv.channel_id, participant.user_id, participant.username, text);
        rt.local_sent.push({
          id: `local-${Date.now()}-${Math.random()}`,
          author_id: participant.user_id,
          author_name: participant.username,
          content: text,
          timestamp: new Date().toISOString(),
        });
        store._pushLog({
          ts: Date.now(), conv_id: convId,
          participant_id: participant.id,
          participant_name: participant.username,
          participant_color: participant.color,
          type: "sent",
          text,
        });
      }
    } catch (e) {
      console.error("[AI] human reply failed:", e);
    }

    store._setInfo(convId, { is_generating: false, generating_participant_name: null, generating_participant_color: null });
    rt.same_pair_turns = 0;
    // Skip the normal generation turn — this bot already replied to the human
    // Advance turn and schedule next participant normally
    for (const m of channelMsgs) {
      if (!m.id.startsWith("local-")) rt.seen_message_ids.add(m.id);
    }
    rt.next_participant_idx = (participantIdx + 1) % conv.participants.length;
    rt.rounds += 1;
    set((s) => ({
      runtimeRounds: { ...s.runtimeRounds, [convId]: rt.rounds },
      runtimeInfo: { ...s.runtimeInfo, [convId]: { ...(s.runtimeInfo[convId] ?? defaultInfo()), rounds: rt.rounds } },
    }));
    if (rt.status === "running") {
      const nextP = conv.participants[rt.next_participant_idx];
      const delay = thinkDelay(nextP, 0);
      setNextSpeaker(convId, conv, rt.next_participant_idx, store);
      store._startCountdown(convId, delay);
      rt.timer_id = setTimeout(() => { rt.timer_id = null; runOneTurn(convId, get, set).catch(console.error); }, delay);
    }
    return;
  }

  // mentionMsg kept for forceSingle check below (global mention already handled above)
  const mentionMsg = null;

  // ── Intervention logic ────────────────────────────────────────────────────
  const canIntervene = conv.participants.length >= 3 && rt.rounds >= 4;
  if (canIntervene) {
    if (rt.last_speaker_id && rt.last_speaker_id !== participant.id) {
      rt.same_pair_turns += 1;
    } else if (!rt.last_speaker_id) {
      rt.same_pair_turns = 0;
    }

    const interventionChance = Math.min(0.9, (rt.same_pair_turns - 5) * 0.2);
    if (rt.same_pair_turns >= 6 && Math.random() < interventionChance) {
      const bystanders = conv.participants.filter((p) => p.id !== participant.id && p.id !== rt.last_speaker_id);
      if (bystanders.length > 0) {
        const intervener = bystanders[Math.floor(Math.random() * bystanders.length)];
        const talkingPair = [
          participant.username,
          conv.participants.find((p) => p.id === rt.last_speaker_id)?.username ?? "outro",
        ].filter(Boolean);

        store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: intervener.id, participant_name: intervener.username, participant_color: intervener.color, type: "generating" });
        invoke<void>("discord_trigger_typing", { accountId: intervener.account_id, channelId: conv.channel_id }).catch(() => {});

        try {
          const result = await invokeWithRetry({
            config: {
              ...intervener.config,
              system_prompt: buildInterventionSystemPrompt(intervener, conv, talkingPair),
              temperature: Math.min(1.2, (intervener.config.temperature ?? 0.9) + 0.1),
              max_tokens: 80,
            },
            messages: buildContextMessages(intervener, channelMsgs, conv, false),
            account_id: intervener.account_id,
            channel_id: conv.channel_id,
            send: false,
            reply_to: null,
          }, convId, intervener.username, intervener.color);

          const text = result.text.trim().split("|||")[0].trim();
          if (text) {
            const sentId = await invoke<string>("discord_send_text", {
              accountId: intervener.account_id,
              channelId: conv.channel_id,
              content: text,
              replyTo: null,
            });
            if (sentId) rt.sent_message_ids.set(sentId, intervener.user_id);
            addMessageToDiscordCache(conv.channel_id, intervener.user_id, intervener.username, text);
            rt.local_sent.push({
              id: `local-${Date.now()}-${Math.random()}`,
              author_id: intervener.user_id,
              author_name: intervener.username,
              content: text,
              timestamp: new Date().toISOString(),
            });
            store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: intervener.id, participant_name: intervener.username, participant_color: intervener.color, type: "sent", text });
            rt.same_pair_turns = 0;
          }
        } catch (e) {
          console.error("[AI] intervention failed:", e);
        }
      }
    }
  }
  rt.last_speaker_id = participant.id;

  // ── Topic staleness tracker ───────────────────────────────────────────────
  // Computes a topic fingerprint from recent messages and checks if it barely
  // changed since last turn. After STALE_THRESHOLD consecutive stale turns,
  // forces a BREAK instruction into the next prompt regardless of orchestrator.
  {
    const STOP = new Set([
      "que","não","sim","mas","pra","pro","com","por","uma","uns","sei","aí",
      "né","tá","ta","vai","vou","tem","ter","ser","aqui","ali","isso","esse",
      "essa","tipo","cara","mano","vc","você","eu","de","da","do","em","na",
      "no","já","ja","faz","kk","kkk","kkkk","haha","slk","vdd","tbm","tmb","gente",
    ]);
    const recentWords = channelMsgs.slice(-10)
      .map((m) => m.content.toLowerCase().replace(/[^\w\sáéíóúãõçàü]/g, " ").split(/\s+/))
      .flat()
      .filter((w) => w.length > 3 && !STOP.has(w));
    const freq = new Map<string, number>();
    for (const w of recentWords) freq.set(w, (freq.get(w) ?? 0) + 1);
    // Keep top-8 words as the topic key
    const topKey = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w]) => w)
      .sort()
      .join("|");

    const STALE_THRESHOLD = 6; // turns before forcing a break
    if (topKey && topKey === rt.last_topic_key) {
      rt.topic_stale_turns += 1;
    } else {
      rt.topic_stale_turns = 0;
      rt.last_topic_key = topKey;
    }

    if (rt.topic_stale_turns >= STALE_THRESHOLD && !rt.loop_override) {
      const topic = randomBreakTopic();
      rt.loop_override = `\n🔄 ASSUNTO ESGOTADO (${rt.topic_stale_turns} turnos no mesmo tema). MUDE JÁ para outro assunto. Pergunte ou comente sobre: "${topic}". 1 frase, do nada, tipo celular.`;
      rt.loop_streak = (rt.loop_streak ?? 0) + 1;
      rt.topic_stale_turns = 0;
      store._pushLog({
        ts: Date.now(), conv_id: convId,
        participant_id: "system", participant_name: "🔄 Giro de assunto", participant_color: "#f0a500",
        type: "loop_break", text: `Assunto estagnado → forcando pivô: "${topic}"`,
      });
    } else if (rt.topic_stale_turns === 0 && rt.loop_streak > 0) {
      // Topic changed naturally — clear the override so prompts stop carrying it
      rt.loop_override = null;
      rt.loop_streak = 0;
    }
  }

  // ── Generate main turn (with optional parallel) ───────────────────────────
  const doBurst = Math.random() < 0.65;
  const forceSingle = mentionMsg != null;

  // Compute turn-level signals once (shared by primary + parallel participant)
  const latestHumanContent = latestHumanMsg?.content ?? "";
  const turnForceDisagree = shouldDisagree(rt.recent_contents);
  const turnPersonalQuestion = isPersonalQuestion(latestHumanContent);
  const turnExternalHook = maybeExternalHook();

  // The message that directly addressed the current participant (if any)
  const addressedByMsg = rt.addressee_lock?.participant_id === participant.id
    ? (channelMsgs[channelMsgs.length - 1] ?? null)
    : null;

  // Helper: generate blocks for one participant
  async function generateFor(p: AiParticipant, isMention: boolean): Promise<string[]> {
    // If addressee lock is active, never burst — one focused reply only
    const burst = Math.random() < 0.65 && !isMention && !rt.addressee_lock;
    if (burst) {
      const result = await invokeWithRetry({
        config: {
          ...p.config,
          system_prompt: buildBlockSystemPrompt(p, conv, rt, channelMsgs),
          temperature: Math.min(1.1, p.config.temperature ?? 0.9),
          max_tokens: 120,
        },
        messages: buildContextMessages(p, channelMsgs, conv, true),
        account_id: p.account_id,
        channel_id: conv.channel_id,
        send: false,
        reply_to: null,
      }, convId, p.username, p.color);
      return parseBurstBlocks(result.text.trim());
    } else {
      const result = await invokeWithRetry({
        config: {
          ...p.config,
          system_prompt: buildSystemPrompt(
            p, conv, rt,
            p.id === participant.id ? (mentionMsg ?? undefined) : undefined,
            channelMsgs,
            {
              forceDisagree: turnForceDisagree,
              personalQuestion: turnPersonalQuestion,
              externalHook: turnExternalHook,
              addressedBy: p.id === participant.id ? addressedByMsg : null,
            }
          ),
          temperature: p.config.temperature ?? 0.9,
          max_tokens: 60,
        },
        messages: buildContextMessages(p, channelMsgs, conv, false),
        account_id: p.account_id,
        channel_id: conv.channel_id,
        send: false,
        reply_to: null,
      }, convId, p.username, p.color);
      return [result.text.trim()];
    }
  }

  // Helper: send blocks for one participant
  async function sendBlocks(p: AiParticipant, blocks: string[]): Promise<void> {
    rt.burst_lock = p.id;
    setBurstLock(convId, p, store);
    if (blocks.length > 1) {
      store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: p.id, participant_name: p.username, participant_color: p.color, type: "burst_start", block_total: blocks.length });
    }
    try {
      for (let i = 0; i < blocks.length; i++) {
        const rawText = blocks[i];
        if (!rawText) continue;
        const text = injectTypo(rawText);
        const sentId = await invoke<string>("discord_send_text", {
          accountId: p.account_id,
          channelId: conv.channel_id,
          content: text,
          replyTo: null,
        });
        if (sentId) {
          rt.sent_message_ids.set(sentId, p.user_id);
          if (rt.sent_message_ids.size > 500) {
            rt.sent_message_ids.delete(rt.sent_message_ids.keys().next().value!);
          }
        }
        addMessageToDiscordCache(conv.channel_id, p.user_id, p.username, text);
        rt.local_sent.push({
          id: `local-${Date.now()}-${Math.random()}`,
          author_id: p.user_id,
          author_name: p.username,
          content: text,
          timestamp: new Date().toISOString(),
        });
        rt.last_message_ts = Date.now();
        rt.recent_contents.push(text);
        if (rt.recent_contents.length > 10) rt.recent_contents.shift();
        const loopReason = detectLoop(rt.recent_contents);
        if (loopReason) {
          rt.loop_streak += 1;
          rt.loop_override = buildLoopBreakInstruction(loopReason, rt.loop_streak);
          store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: p.id, participant_name: "🔄 Loop", participant_color: "#f0a500", type: "loop_break", text: `Loop detectado: ${loopReason}` });
        } else if (!rt.loop_override?.includes("ASSUNTO ESGOTADO")) {
          // Only clear if the override wasn't set by the topic staleness tracker this turn
          rt.loop_streak = 0;
          rt.loop_override = null;
        }
        store._pushLog({
          ts: Date.now(), conv_id: convId,
          participant_id: p.id,
          participant_name: p.username,
          participant_color: p.color,
          type: "sent",
          text,
          block_index: blocks.length > 1 ? i + 1 : undefined,
          block_total: blocks.length > 1 ? blocks.length : undefined,
        });
        if (i < blocks.length - 1) {
          const delay = burstDelay();
          // Show typing indicator during the inter-block pause so it looks natural
          invoke<void>("discord_trigger_typing", { accountId: p.account_id, channelId: conv.channel_id }).catch(() => {});
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    } finally {
      rt.burst_lock = null;
      setBurstLock(convId, null, store);
      // Release addressee lock once the addressed bot has spoken
      if (rt.addressee_lock?.participant_id === p.id) {
        rt.addressee_lock = null;
      }
      if (blocks.length > 1) {
        store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: p.id, participant_name: p.username, participant_color: p.color, type: "burst_end" });
      }
    }
  }

  if (doParallel && secondParticipant) {
    // ── Parallel turn: both generate at the same time ──────────────────────
    store._setInfo(convId, {
      is_generating: true,
      generating_participant_name: `${participant.username} + ${secondParticipant.username}`,
      generating_participant_color: participant.color,
      countdown_ms: null,
    });
    store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: participant.id, participant_name: participant.username, participant_color: participant.color, type: "generating" });
    store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: secondParticipant.id, participant_name: secondParticipant.username, participant_color: secondParticipant.color, type: "generating" });
    invoke<void>("discord_trigger_typing", { accountId: participant.account_id, channelId: conv.channel_id }).catch(() => {});
    invoke<void>("discord_trigger_typing", { accountId: secondParticipant.account_id, channelId: conv.channel_id }).catch(() => {});

    // Race: both generate, whoever finishes first posts first
    type GenResult = { p: AiParticipant; blocks: string[] } | { p: AiParticipant; error: unknown };
    const p1Promise = generateFor(participant, forceSingle)
      .then((blocks): GenResult => ({ p: participant, blocks }))
      .catch((e): GenResult => ({ p: participant, error: e }));
    const p2Promise = generateFor(secondParticipant, false)
      .then((blocks): GenResult => ({ p: secondParticipant, blocks }))
      .catch((e): GenResult => ({ p: secondParticipant, error: e }));

    // Process results as they arrive
    const results = await Promise.all([p1Promise, p2Promise]);

    store._setInfo(convId, { is_generating: false, generating_participant_name: null, generating_participant_color: null });

    for (const res of results) {
      if ("error" in res) {
        const e = res.error;
        const msg = String(e).toLowerCase();
        const isRate = msg.includes("429") || msg.includes("too many") || msg.includes("rate limit") || msg.includes("quota");
        if (isRate) {
          rt.status = "paused";
          rt.error = "Rate limit atingido. Retome em alguns minutos.";
          store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: res.p.id, participant_name: res.p.username, participant_color: res.p.color, type: "rate_limit" });
          set((s) => ({
            runtimeStatus: { ...s.runtimeStatus, [convId]: "paused" },
            runtimeError: { ...s.runtimeError, [convId]: rt.error },
            runtimeInfo: { ...s.runtimeInfo, [convId]: { ...(s.runtimeInfo[convId] ?? defaultInfo()), status: "paused", countdown_ms: null } },
          }));
          return;
        }
        // Non-rate error for one participant — skip it, continue with the other
        console.error(`[AI] parallel turn failed for ${res.p.username}:`, e);
        continue;
      }
      const validBlocks = res.blocks.filter((b) => b.trim());
      if (validBlocks.length > 0) {
        await sendBlocks(res.p, validBlocks);
        // Small gap between parallel sends for realism
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 800));
      }
    }
  } else {
    // ── Single turn (original logic) ───────────────────────────────────────
    store._setInfo(convId, {
      is_generating: true,
      generating_participant_name: participant.username,
      generating_participant_color: participant.color,
      countdown_ms: null,
    });
    store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: participant.id, participant_name: participant.username, participant_color: participant.color, type: "generating" });
    invoke<void>("discord_trigger_typing", { accountId: participant.account_id, channelId: conv.channel_id }).catch(() => {});

    let blocks: string[];
    try {
      blocks = await generateFor(participant, forceSingle);
    } catch (e) {
      store._setInfo(convId, { is_generating: false, generating_participant_name: null, generating_participant_color: null });
      const msg = String(e).toLowerCase();
      const isRate = msg.includes("429") || msg.includes("too many") || msg.includes("rate limit") || msg.includes("quota");
      const isAuth = msg.includes("401") || msg.includes("403") || msg.includes("invalid api key") || msg.includes("unauthorized");
      if (isRate) {
        rt.status = "paused";
        rt.error = "Rate limit atingido. Retome em alguns minutos.";
        store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: participant.id, participant_name: participant.username, participant_color: participant.color, type: "rate_limit" });
        set((s) => ({
          runtimeStatus: { ...s.runtimeStatus, [convId]: "paused" },
          runtimeError: { ...s.runtimeError, [convId]: rt.error },
          runtimeInfo: { ...s.runtimeInfo, [convId]: { ...(s.runtimeInfo[convId] ?? defaultInfo()), status: "paused", countdown_ms: null } },
        }));
        return;
      }
      if (isAuth) {
        rt.status = "error";
        rt.error = String(e);
        store._pushLog({ ts: Date.now(), conv_id: convId, participant_id: participant.id, participant_name: participant.username, participant_color: participant.color, type: "error", text: String(e) });
        set((s) => ({
          runtimeStatus: { ...s.runtimeStatus, [convId]: "error" },
          runtimeError: { ...s.runtimeError, [convId]: String(e) },
          runtimeInfo: { ...s.runtimeInfo, [convId]: { ...(s.runtimeInfo[convId] ?? defaultInfo()), status: "error", countdown_ms: null } },
        }));
        return;
      }
      // Transient error (empty content, timeout, parse error) — skip turn, keep running
      console.warn(`[AI] transient error for ${participant.username}, skipping turn:`, e);
      blocks = [];
    }

    store._setInfo(convId, { is_generating: false, generating_participant_name: null, generating_participant_color: null });
    const validBlocks = blocks.filter((b) => b.trim());
    if (validBlocks.length > 0) {
      await sendBlocks(participant, validBlocks);
    }
  }

  // Always mark all channel messages as seen and advance the turn counter,
  // even if this turn produced no output (skip/error/empty blocks).
  for (const m of channelMsgs) {
    if (!m.id.startsWith("local-")) rt.seen_message_ids.add(m.id);
  }

  rt.next_participant_idx = (participantIdx + 1) % conv.participants.length;
  rt.rounds += 1;

  set((s) => ({
    runtimeRounds: { ...s.runtimeRounds, [convId]: rt.rounds },
    runtimeInfo: { ...s.runtimeInfo, [convId]: { ...(s.runtimeInfo[convId] ?? defaultInfo()), rounds: rt.rounds } },
  }));

  if (rt.status === "running") {
    const nextP = conv.participants[rt.next_participant_idx];
    rt.turns_since_pause += 1;

    // Contextual delay: if the last sent text was long, add extra think time
    const lastContent = rt.recent_contents[rt.recent_contents.length - 1] ?? "";
    const ctxMs = contextDelayMs(lastContent);

    // Long pause: random 1–30 min break (probability grows with consecutive turns)
    const pauseMs = longPauseDelayMs(rt.turns_since_pause);
    if (pauseMs > 0) {
      rt.turns_since_pause = 0;
      pushLog(convId, {
        participant_id: nextP.id,
        participant_name: nextP.username,
        participant_color: nextP.color,
        type: "waiting",
        text: `pausa de ${Math.round(pauseMs / 1000 / 60)}min`,
      });
    }

    // ── Silence detection: if >20 min since last message, orchestrator starts a new topic ──
    const silenceMs = Date.now() - rt.last_message_ts;
    const SILENCE_THRESHOLD = 20 * 60 * 1000; // 20 min
    if (silenceMs >= SILENCE_THRESHOLD && conv.orchestrator?.enabled && conv.orchestrator.api_key && !rt.orchestrator_running) {
      rt.orchestrator_running = true;
      pushLog(convId, {
        participant_id: "orchestrator",
        participant_name: "Orquestrador",
        participant_color: ORCHESTRATOR_COLOR,
        type: "loop_break",
        text: `🔇 silêncio de ${Math.round(silenceMs / 1000 / 60)}min — gerando novo assunto...`,
      });
      runResumeOrchestrator(conv, rt, channelMsgs, silenceMs).then((result) => {
        if (result) {
          rt.orchestrator_directive = result.directive;
          store._pushLog({
            ts: Date.now(), conv_id: convId,
            participant_id: "orchestrator",
            participant_name: "Orquestrador",
            participant_color: ORCHESTRATOR_COLOR,
            type: "loop_break",
            text: `🔄 novo assunto: ${result.log_summary}`,
          });
        }
      }).catch((e) => console.error("[Orchestrator] resume failed:", e)).finally(() => {
        rt.orchestrator_running = false;
      });
    }

    decayEnergy();
    const baseDelay = Math.round(thinkDelay(nextP, ctxMs) * energyThinkMultiplier());
    const delay = baseDelay + pauseMs;
    setNextSpeaker(convId, conv, rt.next_participant_idx, store);
    store._startCountdown(convId, delay);
    rt.timer_id = setTimeout(() => {
      rt.timer_id = null;
      runOneTurn(convId, get, set).catch(console.error);
    }, delay);
  }
}

export function scheduleNextTurn(
  convId: string,
  get: StoreGetter,
  set: StoreSetter
) {
  const conv = get().conversations.find((c) => c.id === convId);
  const rt = getRuntime(convId);
  if (!conv) return;

  // humanDelay inline (can't import without circular dep)
  const u1 = Math.random();
  const u2 = Math.random();
  const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const delay = Math.max(2000, Math.round((5 + gauss * 1.0) * 1000));

  import("./store").then(({ useAiConversationStore }) => {
    const store = useAiConversationStore.getState();
    const p = conv.participants[rt.next_participant_idx % conv.participants.length];
    store._setInfo(convId, {
      next_participant_id: p.id,
      next_participant_name: p.username,
      next_participant_color: p.color,
      burst_lock_id: null,
      burst_lock_name: null,
    });
    store._startCountdown(convId, delay);
  });

  rt.timer_id = setTimeout(() => {
    rt.timer_id = null;
    runOneTurn(convId, get, set).catch(console.error);
  }, delay);
}
