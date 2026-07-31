import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export type NotificationLevel = "all" | "mentions" | "nothing";

export interface MuteDurations {
  FIFTEEN_MINS: number;
  ONE_HOUR: number;
  EIGHT_HOURS: number;
  TWENTY_FOUR_HOURS: number;
  PERMANENT: null;
}

export const MUTE_DURATIONS = {
  FIFTEEN_MINS: 15 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  EIGHT_HOURS: 8 * 60 * 60 * 1000,
  TWENTY_FOUR_HOURS: 24 * 60 * 60 * 1000,
  PERMANENT: null,
};

function isEntryActive(entry: number | null | undefined): boolean {
  if (entry === undefined) return false;
  if (entry === null) return true; // Permanent
  return Date.now() < entry; // Check expiration
}

interface NotificationState {
  globalLevel: NotificationLevel;
  guildLevels: Record<string, NotificationLevel>;
  channelLevels: Record<string, NotificationLevel>;

  // Mutes: value is expiration timestamp (number) or null (permanent)
  mutedGuilds: Record<string, number | null>;
  mutedChannels: Record<string, number | null>;
  mutedUsers: Record<string, number | null>;
  mutedUserGuilds: Record<string, number | null>; // `${guildId}:${userId}`

  setGlobalLevel: (level: NotificationLevel) => void;
  setGuildLevel: (guildId: string, level: NotificationLevel) => void;
  setChannelLevel: (channelId: string, level: NotificationLevel) => void;

  muteGuild: (guildId: string, durationMs?: number | null) => void;
  unmuteGuild: (guildId: string) => void;
  isGuildMuted: (guildId: string) => boolean;

  muteChannel: (channelId: string, durationMs?: number | null) => void;
  unmuteChannel: (channelId: string) => void;
  isChannelMuted: (channelId: string) => boolean;

  muteUser: (userId: string, durationMs?: number | null) => void;
  unmuteUser: (userId: string) => void;
  isUserMuted: (userId: string) => boolean;

  muteUserInGuild: (guildId: string, userId: string, durationMs?: number | null) => void;
  unmuteUserInGuild: (guildId: string, userId: string) => void;
  isUserMutedInGuild: (guildId: string, userId: string) => boolean;

  isMuted: (guildId?: string | null, channelId?: string | null, authorId?: string | null) => boolean;
  getEffectiveLevel: (guildId?: string, channelId?: string) => NotificationLevel;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    immer((set, get) => ({
      globalLevel: "mentions",
      guildLevels: {},
      channelLevels: {},
      mutedGuilds: {},
      mutedChannels: {},
      mutedUsers: {},
      mutedUserGuilds: {},

      setGlobalLevel: (level) => set((state) => { state.globalLevel = level; }),
      setGuildLevel: (guildId, level) => set((state) => { state.guildLevels[guildId] = level; }),
      setChannelLevel: (channelId, level) => set((state) => { state.channelLevels[channelId] = level; }),

      muteGuild: (guildId, durationMs = null) => set((state) => {
        state.mutedGuilds[guildId] = durationMs ? Date.now() + durationMs : null;
      }),
      unmuteGuild: (guildId) => set((state) => {
        delete state.mutedGuilds[guildId];
      }),
      isGuildMuted: (guildId) => {
        return isEntryActive(get().mutedGuilds[guildId]);
      },

      muteChannel: (channelId, durationMs = null) => set((state) => {
        state.mutedChannels[channelId] = durationMs ? Date.now() + durationMs : null;
      }),
      unmuteChannel: (channelId) => set((state) => {
        delete state.mutedChannels[channelId];
      }),
      isChannelMuted: (channelId) => {
        return isEntryActive(get().mutedChannels[channelId]);
      },

      muteUser: (userId, durationMs = null) => set((state) => {
        state.mutedUsers[userId] = durationMs ? Date.now() + durationMs : null;
      }),
      unmuteUser: (userId) => set((state) => {
        delete state.mutedUsers[userId];
      }),
      isUserMuted: (userId) => {
        return isEntryActive(get().mutedUsers[userId]);
      },

      muteUserInGuild: (guildId, userId, durationMs = null) => set((state) => {
        const key = `${guildId}:${userId}`;
        state.mutedUserGuilds[key] = durationMs ? Date.now() + durationMs : null;
      }),
      unmuteUserInGuild: (guildId, userId) => set((state) => {
        const key = `${guildId}:${userId}`;
        delete state.mutedUserGuilds[key];
      }),
      isUserMutedInGuild: (guildId, userId) => {
        const key = `${guildId}:${userId}`;
        return isEntryActive(get().mutedUserGuilds[key]);
      },

      isMuted: (guildId, channelId, authorId) => {
        const state = get();
        if (authorId && isEntryActive(state.mutedUsers[authorId])) return true;
        if (guildId && authorId && isEntryActive(state.mutedUserGuilds[`${guildId}:${authorId}`])) return true;
        if (channelId && isEntryActive(state.mutedChannels[channelId])) return true;
        if (guildId && isEntryActive(state.mutedGuilds[guildId])) return true;
        return false;
      },

      getEffectiveLevel: (guildId, channelId) => {
        const state = get();
        if (channelId && state.channelLevels[channelId]) {
          return state.channelLevels[channelId];
        }
        if (guildId && state.guildLevels[guildId]) {
          return state.guildLevels[guildId];
        }
        return state.globalLevel;
      }
    })),
    { name: "organiccord-notifications" }
  )
);
