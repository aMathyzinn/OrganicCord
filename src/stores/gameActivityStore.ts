import { create } from "zustand";
import * as api from "@/lib/tauri";

type PublishedActivity = {
  signature: string | null;
} | null;

interface GameActivityStore {
  settings: api.GameDetectionSettings | null;
  detectedGame: api.DetectedGame | null;
  loading: boolean;
  error: string | null;
  published: PublishedActivity;
  loadSettings: () => Promise<void>;
  setDetectionEnabled: (enabled: boolean) => Promise<void>;
  saveGame: (game: api.RegisteredGame) => Promise<void>;
  removeGame: (gameId: string) => Promise<void>;
  rpcSettings: api.DiscordRpcSettings | null;
  rpcStatus: api.DiscordRpcStatus | null;
  loadRpcSettings: () => Promise<void>;
  saveRpcSettings: (settings: api.DiscordRpcSettings) => Promise<void>;
  testDiscordRpc: () => Promise<void>;
  refreshAndSync: () => Promise<void>;
  clearPublishedActivity: () => Promise<void>;
}

const signatureFor = (game: api.DetectedGame | null) =>
  game ? `${game.id}:${game.processId}:${game.startedAt}` : null;

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : typeof error === "string" ? error : fallback;

let refreshInFlight: Promise<void> | null = null;

export const useGameActivityStore = create<GameActivityStore>((set, get) => ({
  settings: null,
  detectedGame: null,
  loading: false,
  error: null,
  published: null,
  rpcSettings: null,
  rpcStatus: null,

  loadSettings: async () => {
    set({ loading: true, error: null });
    try {
      set({ settings: await api.gameDetectionGetSettings(), loading: false });
    } catch (error) {
      set({ loading: false, error: errorMessage(error, "Não foi possível carregar os jogos registrados.") });
    }
  },

  setDetectionEnabled: async (enabled) => {
    try {
      set({ settings: await api.gameDetectionSetEnabled(enabled), error: null });
    } catch (error) {
      set({ error: errorMessage(error, "Não foi possível atualizar a detecção.") });
      throw error;
    }
  },

  saveGame: async (game) => {
    try {
      set({ settings: await api.gameDetectionUpdateGame(game), error: null });
    } catch (error) {
      set({ error: errorMessage(error, "Não foi possível salvar o jogo.") });
      throw error;
    }
  },

  removeGame: async (gameId) => {
    try {
      set({ settings: await api.gameDetectionRemoveGame(gameId), error: null });
    } catch (error) {
      set({ error: errorMessage(error, "Não foi possível remover o jogo.") });
      throw error;
    }
  },

  loadRpcSettings: async () => {
    try {
      set({ rpcSettings: await api.discordRpcGetSettings(), error: null });
    } catch (error) {
      set({ error: errorMessage(error, "Não foi possível carregar a configuração do Discord Desktop.") });
    }
  },

  saveRpcSettings: async (settings) => {
    try {
      const previousSettings = get().rpcSettings;
      const previousActivity = get().published;
      if (
        previousActivity?.signature
        && previousSettings?.enabled
        && previousSettings.applicationId
        && (!settings.enabled || settings.applicationId.trim() !== previousSettings.applicationId)
      ) {
        await api.discordRpcClearGame();
        set({ published: null });
      }
      set({ rpcSettings: await api.discordRpcUpdateSettings(settings), rpcStatus: null, error: null });
    } catch (error) {
      set({ error: errorMessage(error, "Não foi possível salvar a configuração do Discord Desktop.") });
      throw error;
    }
  },

  testDiscordRpc: async () => {
    try {
      set({ rpcStatus: await api.discordRpcTest(), error: null });
    } catch (error) {
      set({ rpcStatus: null, error: errorMessage(error, "Não foi possível conectar ao Discord Desktop.") });
      throw error;
    }
  },

  refreshAndSync: async () => {
    if (refreshInFlight) return refreshInFlight;

    const operation = (async () => {
      try {
        const detectedGame = await api.gameDetectionScan();
        const nextSignature = signatureFor(detectedGame);
        const previous = get().published;

        set({ detectedGame, error: null });

        const rpcSettings = get().rpcSettings ?? await api.discordRpcGetSettings();
        if (!get().rpcSettings) set({ rpcSettings });
        if (!rpcSettings.enabled || !rpcSettings.applicationId) {
          set({ published: null });
          return;
        }

        if (previous?.signature === nextSignature) return;

        if (previous?.signature) {
          await api.discordRpcClearGame();
        }

        if (detectedGame) {
          const status = await api.discordRpcPublishGame({
            name: detectedGame.name,
            startedAt: detectedGame.startedAt,
          });
          set({ rpcStatus: status });
        }

        set({ published: { signature: nextSignature } });
      } catch (error) {
        set({ error: errorMessage(error, "Não foi possível atualizar a atividade do jogo.") });
      }
    })();

    refreshInFlight = operation;
    try {
      await operation;
    } finally {
      if (refreshInFlight === operation) refreshInFlight = null;
    }
  },

  clearPublishedActivity: async () => {
    const previous = get().published;
    if (!previous?.signature) {
      set({ published: null });
      return;
    }
    try {
      await api.discordRpcClearGame();
      set({ published: null, detectedGame: null });
    } catch (error) {
      set({ error: errorMessage(error, "Não foi possível limpar a atividade do jogo.") });
    }
  },
}));
