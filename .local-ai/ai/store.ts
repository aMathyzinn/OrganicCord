import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AiConversation, AiConversationStore, ConvLogEntry, ConvRuntimeInfo, ConversationStatus,
} from "./types";
import { defaultInfo } from "./types";
import { runtimeMap, getRuntime, fetchParticipantProfiles, scheduleNextTurn, runOneTurn } from "./engine";

// ─── Countdown ticker map ─────────────────────────────────────────────────────

const countdownTimers = new Map<string, ReturnType<typeof setInterval>>();

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAiConversationStore = create<AiConversationStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      runtimeStatus: {},
      runtimeError: {},
      runtimeRounds: {},
      runtimeInfo: {},
      log: [],

      addConversation: (conv) =>
        set((s) => ({ conversations: [...s.conversations, conv] })),

      updateConversation: (id, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, ...patch } : c
          ),
        })),

      removeConversation: (id) => {
        get().stopConversation(id);
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
        }));
      },

      startConversation: (id) => {
        const conv = get().conversations.find((c) => c.id === id);
        if (!conv || conv.participants.length < 2) return;
        const rt = getRuntime(id);
        if (rt.status === "running") return;
        rt.status = "running";
        rt.error = null;

        // Mark that we're in warm-up so runOneTurn skips parallel turns and
        // long-pause logic until the conversation has some momentum.
        rt.turns_since_pause = 0;

        const first = conv.participants[0];
        set((s) => ({
          runtimeStatus: { ...s.runtimeStatus, [id]: "running" },
          runtimeError: { ...s.runtimeError, [id]: null },
          runtimeInfo: {
            ...s.runtimeInfo,
            [id]: {
              ...defaultInfo(),
              status: "running",
              next_participant_id: first.id,
              next_participant_name: first.username,
              next_participant_color: first.color,
            },
          },
        }));

        // Warm-up schedule: first participant starts after a short delay,
        // then each subsequent one waits progressively longer so they don't
        // all pile in at once. After the warm-up sequence the normal
        // round-robin takes over.
        //
        // Example for 3 participants (delays from start):
        //   P0 → 4–8s   P1 → 12–20s   P2 → 22–34s
        //
        const BASE_DELAY_MS  = 4_000;
        const STEP_MIN_MS    = 8_000;
        const STEP_MAX_MS    = 14_000;

        let accumulated = BASE_DELAY_MS + Math.random() * 4_000;

        conv.participants.forEach((p, idx) => {
          const delay = Math.round(accumulated);

          import("./store").then(({ useAiConversationStore }) => {
            useAiConversationStore.getState()._setInfo(id, {
              next_participant_id: p.id,
              next_participant_name: p.username,
              next_participant_color: p.color,
            });
            if (idx === 0) useAiConversationStore.getState()._startCountdown(id, delay);
          });

          setTimeout(() => {
            const currentRt = getRuntime(id);
            if (currentRt.status !== "running") return;
            // Only fire if this participant hasn't been leapfrogged by the
            // normal round-robin yet (rounds still low enough).
            if (currentRt.rounds <= idx) {
              currentRt.next_participant_idx = idx;
              runOneTurn(id, get, set).catch(console.error);
            }
          }, delay);

          accumulated += STEP_MIN_MS + Math.random() * (STEP_MAX_MS - STEP_MIN_MS);
        });

        fetchParticipantProfiles(conv.participants, getRuntime(id));
      },

      pauseConversation: (id) => {
        const rt = getRuntime(id);
        if (rt.timer_id) { clearTimeout(rt.timer_id); rt.timer_id = null; }
        const t = countdownTimers.get(id);
        if (t) { clearInterval(t); countdownTimers.delete(id); }
        rt.status = "paused";
        set((s) => ({
          runtimeStatus: { ...s.runtimeStatus, [id]: "paused" },
          runtimeInfo: {
            ...s.runtimeInfo,
            [id]: { ...(s.runtimeInfo[id] ?? defaultInfo()), status: "paused", countdown_ms: null },
          },
        }));
      },

      stopConversation: (id) => {
        const rt = getRuntime(id);
        if (rt.timer_id) { clearTimeout(rt.timer_id); rt.timer_id = null; }
        const t = countdownTimers.get(id);
        if (t) { clearInterval(t); countdownTimers.delete(id); }
        rt.local_sent = [];
        runtimeMap.delete(id);
        set((s) => ({
          runtimeStatus: { ...s.runtimeStatus, [id]: "idle" },
          runtimeError: { ...s.runtimeError, [id]: null },
          runtimeRounds: { ...s.runtimeRounds, [id]: 0 },
          runtimeInfo: { ...s.runtimeInfo, [id]: defaultInfo() },
        }));
      },

      resetConversation: (id) => { get().stopConversation(id); },

      _pushLog: (entry) =>
        set((s) => ({ log: [...s.log.slice(-199), entry] })),

      _setInfo: (convId, patch) =>
        set((s) => ({
          runtimeInfo: {
            ...s.runtimeInfo,
            [convId]: { ...(s.runtimeInfo[convId] ?? defaultInfo()), ...patch },
          },
        })),

      _startCountdown: (convId, totalMs) => {
        const old = countdownTimers.get(convId);
        if (old) clearInterval(old);

        const startedAt = Date.now();
        useAiConversationStore.getState()._setInfo(convId, {
          countdown_ms: totalMs,
          countdown_started_at: startedAt,
          countdown_total_ms: totalMs,
        });

        const ticker = setInterval(() => {
          const remaining = Math.max(0, totalMs - (Date.now() - startedAt));
          useAiConversationStore.getState()._setInfo(convId, { countdown_ms: remaining });
          if (remaining === 0) {
            clearInterval(ticker);
            countdownTimers.delete(convId);
          }
        }, 100);

        countdownTimers.set(convId, ticker);
      },
    }),
    {
      name: "organiccord-ai-conversations",
      // Persist conversations + enough runtime state to show correct status on reload.
      // We do NOT persist runtimeMap (contains Set, timers) — it's rebuilt on startConversation.
      partialize: (s) => ({
        conversations: s.conversations,
        // Persist per-conv rounds so the UI shows correct count after reload
        runtimeRounds: s.runtimeRounds,
      }),
      // Schema migration: bump version when AiConversation/AiParticipant shape changes.
      // v0 → v1: no-op (initial version)
      version: 3,
      migrate: (persisted: unknown, fromVersion: number) => {
        const state = persisted as Record<string, unknown>;
        const conversations = (state.conversations as AiConversation[] | undefined) ?? [];
        if (fromVersion < 1) {
          state.conversations = conversations.map((conv) => ({
            ...conv,
            context_messages: conv.context_messages ?? 30,
            participants: conv.participants.map((p) => ({
              ...p,
              delay_base_ms: p.delay_base_ms ?? 8000,
              delay_jitter_ms: p.delay_jitter_ms ?? 4000,
            })),
          }));
        }
        if (fromVersion < 2) {
          // v2: orchestrator field added — default to null (disabled)
          state.conversations = ((state.conversations as AiConversation[]) ?? conversations).map((conv) => ({
            ...conv,
            orchestrator: conv.orchestrator ?? null,
          }));
        }
        if (fromVersion < 3) {
          // v3: drop relâmpago fields
          state.conversations = ((state.conversations as AiConversation[]) ?? conversations).map((conv) => ({
            ...conv,
            drop_reaction_emoji: (conv as unknown as Record<string, unknown>).drop_reaction_emoji ?? "⚡",
            drop_response_template: (conv as unknown as Record<string, unknown>).drop_response_template ?? "eu quero!",
          }));
        }
        return state as unknown as AiConversationStore;
      },
    }
  )
);
