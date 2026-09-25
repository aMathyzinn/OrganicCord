import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { useAccountStore } from "./accountStore";
import { soundService } from "@/lib/soundService";
import type { DiscordUser } from "@/types";

export interface PingData {
  time: string;
  value: number;
}

export interface IncomingCall {
  accountId: string;
  channelId: string;
  callerId: string;
  callerUser?: DiscordUser;
  region?: string;
  timestamp: number;
}

type OutputStatus = "idle" | "switching" | "ready" | "error";
type ScreenShareStatus =
  | "idle"
  | "allocating"
  | "allocated"
  | "negotiating"
  | "connected"
  | "streaming"
  | "error";

interface VoiceState {
  isConnecting: boolean;
  isConnected: boolean;
  isEncrypted: boolean;
  connectionStage: string;
  attemptId: string | null;
  accountId: string | null;
  channelId: string | null;
  guildId: string | null;
  endpoint: string | null;
  ping: number | null;
  pingHistory: PingData[];
  packetLoss: number | null;
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  activeOutputDeviceId: string | null;
  activeOutputDeviceName: string | null;
  outputFallback: boolean;
  outputStatus: OutputStatus;
  outputError: string | null;
  audioReceiveStage: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  krispEnabled: boolean;
  speakingUsers: Set<string>;
  voiceParticipants: Set<string>;
  ringingUsers: Set<string>;
  incomingCall: IncomingCall | null;
  screenShareStatus: ScreenShareStatus;
  screenShareStage: string | null;
  screenShareAttemptId: string | null;
  screenShareError: string | null;
  screenSharePreviewUrl: string | null;
  screenSharePreviewSequence: number;
  screenShareViewOpen: boolean;
  isScreenSharing: boolean;
  setInputDevice: (id: string | null) => void;
  setOutputDevice: (id: string | null) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setKrispEnabled: (enabled: boolean) => void;
  setSpeaking: (userId: string, speaking: boolean) => void;
  setVoiceParticipant: (userId: string, present: boolean) => void;
  setIncomingCall: (call: IncomingCall | null) => void;
  acceptIncomingCall: () => Promise<void>;
  declineIncomingCall: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  setScreenShareViewOpen: (open: boolean) => void;
  joinCall: (
    accountId: string,
    guildId: string | null,
    channelId: string,
    options?: { isAnswering?: boolean; initialParticipants?: string[] }
  ) => Promise<void>;
  leaveCall: () => Promise<void>;
  handleCallUpdate: (
    channelId: string,
    voiceStates: Array<{ user_id?: string }>,
    ringing: string[]
  ) => void;
  handleCallDelete: (channelId: string) => void;
  updatePing: (newPing: number) => void;
}

async function syncVoiceControls(state: VoiceState) {
  if (!state.accountId || !state.channelId) return;
  await invoke("set_voice_controls", {
    accountId: state.accountId,
    guildId: state.guildId,
    channelId: state.channelId,
    muted: state.isMuted,
    deafened: state.isDeafened,
  });
}

function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function savePreference(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // A chamada continua usando o valor em memória quando o storage está indisponível.
  }
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  isConnecting: false,
  isConnected: false,
  isEncrypted: false,
  connectionStage: "Desconectado",
  attemptId: null,
  accountId: null,
  channelId: null,
  guildId: null,
  endpoint: null,
  ping: null,
  pingHistory: [],
  packetLoss: null,
  inputDeviceId: readPreference("organiccord.voice.inputDevice"),
  outputDeviceId: readPreference("organiccord.voice.outputDevice"),
  activeOutputDeviceId: null,
  activeOutputDeviceName: null,
  outputFallback: false,
  outputStatus: "idle",
  outputError: null,
  audioReceiveStage: null,
  isMuted: false,
  isDeafened: false,
  krispEnabled: readPreference("organiccord.voice.rnnoise") !== "false",
  speakingUsers: new Set<string>(),
  voiceParticipants: new Set<string>(),
  ringingUsers: new Set<string>(),
  incomingCall: null,
  screenShareStatus: "idle",
  screenShareStage: null,
  screenShareAttemptId: null,
  screenShareError: null,
  screenSharePreviewUrl: null,
  screenSharePreviewSequence: 0,
  screenShareViewOpen: false,
  isScreenSharing: false,

  setSpeaking: (userId, speaking) => {
    set((state) => {
      const next = new Set(state.speakingUsers);
      if (speaking) next.add(userId);
      else next.delete(userId);
      const participants = new Set(state.voiceParticipants);
      if (speaking) participants.add(userId);
      return { speakingUsers: next, voiceParticipants: participants };
    });
  },

  setVoiceParticipant: (userId, present) => {
    const current = get();
    const account = useAccountStore.getState().accounts.find((a) => a.id === current.accountId);
    const myId = account?.user_id ?? account?.id;
    const isOtherUser = userId !== myId;
    const isDm = !current.guildId;

    set((state) => {
      const next = new Set(state.voiceParticipants);
      const nextRinging = new Set(state.ringingUsers);
      if (present) {
        next.add(userId);
        nextRinging.delete(userId);
      } else {
        next.delete(userId);
      }
      return { voiceParticipants: next, ringingUsers: nextRinging };
    });

    if (isDm && isOtherUser) {
      if (present) {
        soundService.stopOutgoingRing();
        soundService.playUserJoined();
      } else {
        soundService.playUserLeft();
      }
    }
  },

  setIncomingCall: (incomingCall) => {
    if (incomingCall) {
      soundService.playIncomingRing();
    } else {
      soundService.stopIncomingRing();
    }
    set({ incomingCall });
  },

  acceptIncomingCall: async () => {
    const { incomingCall, joinCall } = get();
    if (!incomingCall) return;
    soundService.stopIncomingRing();
    const { accountId, channelId, callerId } = incomingCall;
    set({ incomingCall: null });
    await joinCall(accountId, null, channelId, {
      isAnswering: true,
      initialParticipants: callerId ? [callerId] : [],
    });
  },

  declineIncomingCall: async () => {
    const { incomingCall } = get();
    if (!incomingCall) return;
    soundService.stopIncomingRing();
    const { accountId, channelId } = incomingCall;
    set({ incomingCall: null });
    await invoke("stop_dm_call", { accountId, channelId }).catch((e) => {
      console.error("Falha ao recusar chamada:", e);
    });
  },

  setInputDevice: (inputDeviceId) => {
    savePreference("organiccord.voice.inputDevice", inputDeviceId);
    set({ inputDeviceId });
  },
  setOutputDevice: (outputDeviceId) => {
    savePreference("organiccord.voice.outputDevice", outputDeviceId);
    const current = get();
    const hasVoiceSession = Boolean(current.accountId && (current.isConnecting || current.isConnected));
    set({
      outputDeviceId,
      outputStatus: hasVoiceSession ? "switching" : current.outputStatus,
      outputError: null,
      audioReceiveStage: null,
    });
    if (hasVoiceSession && current.accountId) {
      void invoke("set_voice_output_device", {
        accountId: current.accountId,
        outputDeviceId,
      }).catch((error) => {
        useVoiceStore.setState({
          outputStatus: "error",
          outputError: String(error),
        });
      });
    }
  },
  toggleMute: () => {
    const willMute = !get().isMuted;
    if (willMute) {
      soundService.playMute();
    } else {
      soundService.playUnmute();
    }
    set({ isMuted: willMute });
    void syncVoiceControls(get()).catch((error) => console.error("Falha ao atualizar mute:", error));
  },
  toggleDeafen: () => {
    const willDeafen = !get().isDeafened;
    if (willDeafen) {
      soundService.playDeafen();
    } else {
      soundService.playUndeafen();
    }
    set({ isDeafened: willDeafen });
    void syncVoiceControls(get()).catch((error) => console.error("Falha ao atualizar deafen:", error));
  },
  setKrispEnabled: (krispEnabled) => {
    savePreference("organiccord.voice.rnnoise", String(krispEnabled));
    set({ krispEnabled });
  },

  startScreenShare: async () => {
    const current = get();
    if (!current.isConnected || !current.accountId || !current.channelId) {
      set({
        screenShareStatus: "error",
        screenShareError: "Entre em uma chamada antes de compartilhar a tela.",
        screenShareStage: "Compartilhamento indisponível",
      });
      return;
    }
    const account = useAccountStore.getState().accounts.find((item) => item.id === current.accountId);
    const userId = account?.user_id ?? account?.id;
    if (!userId) {
      set({
        screenShareStatus: "error",
        screenShareError: "Não foi possível identificar a conta ativa.",
        screenShareStage: "Conta indisponível",
      });
      return;
    }

    set({
      screenShareStatus: "allocating",
      screenShareStage: "Solicitando servidor de compartilhamento...",
      screenShareAttemptId: null,
      screenShareError: null,
      screenSharePreviewUrl: null,
      screenSharePreviewSequence: 0,
      screenShareViewOpen: true,
      isScreenSharing: false,
    });
    try {
      const attemptId = await invoke<string>("start_screen_share", {
        request: {
          accountId: current.accountId,
          guildId: current.guildId,
          channelId: current.channelId,
          userId,
        },
      });
      const latest = get();
      if (
        latest.accountId !== current.accountId ||
        latest.channelId !== current.channelId ||
        latest.screenShareStatus === "idle"
      ) {
        await invoke("stop_screen_share", { accountId: current.accountId }).catch(() => undefined);
        return;
      }
      set((state) => ({
        screenShareAttemptId: state.screenShareAttemptId ?? attemptId,
      }));
    } catch (error) {
      set({
        screenShareStatus: "error",
        screenShareStage: "Não foi possível iniciar o compartilhamento",
        screenShareAttemptId: null,
        screenShareError: String(error),
        screenSharePreviewUrl: null,
        screenSharePreviewSequence: 0,
        screenShareViewOpen: false,
        isScreenSharing: false,
      });
    }
  },

  stopScreenShare: async () => {
    const { accountId } = get();
    if (accountId) {
      await invoke("stop_screen_share", { accountId }).catch((error) => {
        console.error("Falha ao parar compartilhamento:", error);
      });
    }
    set({
      screenShareStatus: "idle",
      screenShareStage: null,
      screenShareAttemptId: null,
      screenShareError: null,
      screenSharePreviewUrl: null,
      screenSharePreviewSequence: 0,
      screenShareViewOpen: false,
      isScreenSharing: false,
    });
  },

  setScreenShareViewOpen: (screenShareViewOpen) => set({ screenShareViewOpen }),

  updatePing: (newPing) => {
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    set((state) => ({
      ping: newPing,
      pingHistory: [...state.pingHistory, { time, value: newPing }].slice(-20),
    }));
  },

  joinCall: async (accountId, guildId, channelId, options) => {
    const account = useAccountStore.getState().accounts.find((item) => item.id === accountId);
    const userId = account?.user_id ?? account?.id;
    if (!userId) {
      set({ isConnecting: false, isConnected: false, connectionStage: "Conta indisponível" });
      return;
    }

    const isAnswering = options?.isAnswering ?? false;
    const initialParticipants = options?.initialParticipants ?? [];
    const initialSet = new Set<string>([userId, ...initialParticipants]);

    const current = get();
    set({
      isConnecting: true,
      isConnected: false,
      isEncrypted: false,
      connectionStage: "Preparando chamada segura...",
      attemptId: null,
      accountId,
      guildId,
      channelId,
      endpoint: null,
      ping: null,
      pingHistory: [],
      packetLoss: null,
      activeOutputDeviceId: null,
      activeOutputDeviceName: null,
      outputFallback: false,
      outputStatus: "idle",
      outputError: null,
      audioReceiveStage: null,
      speakingUsers: new Set<string>(),
      voiceParticipants: initialSet,
      ringingUsers: new Set<string>(),
      screenShareStatus: "idle",
      screenShareStage: null,
      screenShareAttemptId: null,
      screenShareError: null,
      screenSharePreviewUrl: null,
      screenSharePreviewSequence: 0,
      screenShareViewOpen: false,
      isScreenSharing: false,
    });

    try {
      const attemptId = await invoke<string>("prepare_voice_connection", {
        accountId,
        serverId: guildId ?? channelId,
        channelId,
        userId,
        inputDeviceId: current.inputDeviceId,
        outputDeviceId: current.outputDeviceId,
        krispEnabled: current.krispEnabled,
        muted: current.isMuted,
        deafened: current.isDeafened,
      });
      const latest = get();
      if (latest.accountId !== accountId || latest.channelId !== channelId) {
        await invoke("stop_voice_connection", { accountId }).catch(() => undefined);
        return;
      }
      set({
        attemptId,
        connectionStage: "Aguardando alocação do servidor de voz...",
      });

      if (!guildId && !isAnswering) {
        soundService.playOutgoingRing();
        await invoke("start_dm_call", { accountId, channelId });
      }

      await invoke("gateway_join_voice", {
        accountId,
        guildId,
        channelId,
        selfMute: current.isMuted,
        selfDeaf: current.isDeafened,
      });
    } catch (error) {
      soundService.stopOutgoingRing();
      await invoke("stop_voice_connection", { accountId }).catch(() => undefined);
      set({
        isConnecting: false,
        isConnected: false,
        isEncrypted: false,
        attemptId: null,
        connectionStage: String(error),
      });
    }
  },

  leaveCall: async () => {
    const { accountId, guildId, isMuted, isDeafened, isConnected } = get();
    soundService.stopOutgoingRing();
    soundService.stopIncomingRing();
    if (isConnected) {
      soundService.playUserLeft();
    }
    if (accountId) {
      await get().stopScreenShare();
      await Promise.allSettled([
        invoke("stop_voice_connection", { accountId }),
        invoke("gateway_join_voice", {
          accountId,
          guildId,
          channelId: null,
          selfMute: isMuted,
          selfDeaf: isDeafened,
        }),
      ]);
    }
    set({
      isConnecting: false,
      isConnected: false,
      isEncrypted: false,
      connectionStage: "Desconectado",
      attemptId: null,
      accountId: null,
      channelId: null,
      guildId: null,
      endpoint: null,
      ping: null,
      pingHistory: [],
      packetLoss: null,
      activeOutputDeviceId: null,
      activeOutputDeviceName: null,
      outputFallback: false,
      outputStatus: "idle",
      outputError: null,
      audioReceiveStage: null,
      speakingUsers: new Set<string>(),
      voiceParticipants: new Set<string>(),
      ringingUsers: new Set<string>(),
      screenShareStatus: "idle",
      screenShareStage: null,
      screenShareAttemptId: null,
      screenShareError: null,
      screenSharePreviewUrl: null,
      screenSharePreviewSequence: 0,
      screenShareViewOpen: false,
      isScreenSharing: false,
    });
  },

  handleCallUpdate: (channelId, voiceStates, ringing) => {
    const current = get();
    if (current.channelId !== channelId) return;

    const account = useAccountStore.getState().accounts.find((a) => a.id === current.accountId);
    const myId = account?.user_id ?? account?.id;

    const newParticipants = new Set(current.voiceParticipants);
    for (const vs of voiceStates) {
      if (vs.user_id) newParticipants.add(vs.user_id);
    }
    const newRinging = new Set(ringing);

    const hadOthers = Array.from(current.voiceParticipants).some((id) => id !== myId);
    const nowHasOthers = Array.from(newParticipants).some((id) => id !== myId);

    // Se alguém atendeu a chamada via CALL_UPDATE
    if (!hadOthers && nowHasOthers) {
      soundService.stopOutgoingRing();
      soundService.playUserJoined();
    }

    // Se estávamos chamando em DM, o ringing zerou e ninguém atendeu -> chamada recusada/encerrada
    const wasRinging = current.ringingUsers.size > 0 || (current.isConnected && !hadOthers && !current.guildId);
    if (!current.guildId && wasRinging && !nowHasOthers && ringing.length === 0 && voiceStates.length <= 1) {
      soundService.stopOutgoingRing();
      soundService.playUserLeft();
      void get().leaveCall();
      return;
    }

    set({
      voiceParticipants: newParticipants,
      ringingUsers: newRinging,
    });
  },

  handleCallDelete: (channelId) => {
    const current = get();
    if (current.channelId !== channelId) return;
    soundService.stopOutgoingRing();
    soundService.playUserLeft();
    void get().leaveCall();
  },
}));

if (typeof window !== "undefined") {
  void listen<{
    accountId: string;
    attemptId: string;
    status: "connecting" | "connected" | "error" | "disconnected";
    stage: string;
    endpoint: string | null;
    encrypted: boolean;
  }>("voice-status", ({ payload }) => {
    const current = useVoiceStore.getState();
    if (
      current.accountId !== payload.accountId ||
      current.attemptId == null ||
      current.attemptId !== payload.attemptId
    ) return;

    const wasConnected = current.isConnected;
    const nowConnected = payload.status === "connected";
    if (!wasConnected && nowConnected) {
      const isDm = !current.guildId;
      const account = useAccountStore.getState().accounts.find((a) => a.id === current.accountId);
      const myId = account?.user_id ?? account?.id;
      const hasOtherParticipants = Array.from(current.voiceParticipants).some((id) => id !== myId);

      // Em DM onde somos o único participante e estamos chamando, manter toque de chamada tocando!
      if (!isDm || hasOtherParticipants) {
        soundService.stopOutgoingRing();
        soundService.stopIncomingRing();
        soundService.playUserJoined();
      }
    } else if (wasConnected && (payload.status === "disconnected" || payload.status === "error")) {
      soundService.stopOutgoingRing();
      soundService.stopIncomingRing();
      soundService.playUserLeft();
    }

    useVoiceStore.setState({
      isConnecting: payload.status === "connecting",
      isConnected: nowConnected,
      isEncrypted: payload.encrypted,
      connectionStage: payload.stage,
      endpoint: payload.endpoint ?? current.endpoint,
    });
  });

  void listen<{ account_id: string; user_id: string; speaking: boolean }>(
    "voice-speaking",
    ({ payload }) => {
      const current = useVoiceStore.getState();
      if (current.accountId !== payload.account_id) return;
      current.setSpeaking(payload.user_id, payload.speaking);
    }
  );

  void listen<{
    account_id: string;
    data: { user_id?: string; channel_id?: string | null };
  }>("gateway-voice-state", ({ payload }) => {
    const current = useVoiceStore.getState();
    const userId = payload.data?.user_id;
    if (current.accountId !== payload.account_id || !userId) return;
    current.setVoiceParticipant(userId, payload.data.channel_id === current.channelId);
  });

  void listen<{ accountId: string; attemptId: string; pingMs: number }>("voice-metrics", ({ payload }) => {
    const current = useVoiceStore.getState();
    if (current.accountId === payload.accountId && current.attemptId === payload.attemptId) {
      useVoiceStore.getState().updatePing(payload.pingMs);
    }
  });

  void listen<{
    accountId: string;
    attemptId: string;
    status: "ready" | "error" | "receiving" | "playing";
    requestedDeviceId: string | null;
    activeDeviceId: string | null;
    activeDeviceName: string | null;
    fallback: boolean;
    detail: string | null;
  }>("voice-audio-status", ({ payload }) => {
    const current = useVoiceStore.getState();
    if (current.accountId !== payload.accountId || current.attemptId !== payload.attemptId) return;
    if (payload.status === "ready") {
      useVoiceStore.setState({
        activeOutputDeviceId: payload.activeDeviceId,
        activeOutputDeviceName: payload.activeDeviceName,
        outputFallback: payload.fallback,
        outputStatus: "ready",
        outputError: null,
      });
    } else if (payload.status === "error") {
      useVoiceStore.setState({
        outputStatus: "error",
        outputError: payload.detail ?? "Não foi possível abrir a saída de áudio selecionada.",
      });
    } else {
      useVoiceStore.setState({ audioReceiveStage: payload.detail });
    }
  });

  void listen<{
    accountId: string;
    attemptId: string;
    status: ScreenShareStatus;
    stage: string;
    streamKey: string | null;
  }>("screen-share-status", ({ payload }) => {
    const current = useVoiceStore.getState();
    if (current.accountId !== payload.accountId) return;
    if (payload.status === "idle") {
      useVoiceStore.setState({
        screenShareStatus: "idle",
        screenShareStage: null,
        screenShareAttemptId: null,
        screenShareError: null,
        screenSharePreviewUrl: null,
        screenSharePreviewSequence: 0,
        screenShareViewOpen: false,
        isScreenSharing: false,
      });
      return;
    }
    if (
      current.screenShareAttemptId != null &&
      current.screenShareAttemptId !== payload.attemptId
    ) return;
    useVoiceStore.setState({
      screenShareStatus: payload.status,
      screenShareStage: payload.stage,
      screenShareAttemptId: payload.attemptId,
      screenShareError: payload.status === "error" ? payload.stage : null,
      screenShareViewOpen: payload.status === "error" ? current.screenShareViewOpen : true,
      isScreenSharing: payload.status === "streaming",
    });
  });

  void listen<{
    accountId: string;
    attemptId: string;
    sequence: number;
    mimeType: string;
    dataBase64: string;
  }>("screen-share-preview", ({ payload }) => {
    const current = useVoiceStore.getState();
    if (
      current.accountId !== payload.accountId ||
      current.screenShareAttemptId !== payload.attemptId ||
      payload.mimeType !== "image/jpeg" ||
      payload.sequence <= current.screenSharePreviewSequence
    ) return;
    useVoiceStore.setState({
      screenSharePreviewUrl: `data:${payload.mimeType};base64,${payload.dataBase64}`,
      screenSharePreviewSequence: payload.sequence,
    });
  });
}
