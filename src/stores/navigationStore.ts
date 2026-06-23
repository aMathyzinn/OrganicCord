import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { NavigationState } from "@/types";

interface NavigationStore extends NavigationState {
  // Maps accountId → guildId → last active channelId (per-account, so switching accounts doesn't bleed nav state)
  lastChannelByGuild: Record<string, Record<string, string>>;
  focusedImage: string | null;
  setActiveAccount: (accountId: string) => void;
  setActiveGuild: (guildId: string | null) => void;
  setActiveChannel: (channelId: string | null) => void;
  setView: (view: NavigationState["view"]) => void;
  navigateToDMs: () => void;
  setFocusedImage: (url: string | null) => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useNavigationStore = create<NavigationStore>()(
  immer((set) => ({
    activeAccountId: null,
    activeGuildId: null,
    activeChannelId: null,
    view: "dms",
    lastChannelByGuild: {},
    focusedImage: null,
    isSettingsOpen: false,

    openSettings: () =>
      set((s) => {
        s.isSettingsOpen = true;
      }),

    closeSettings: () =>
      set((s) => {
        s.isSettingsOpen = false;
      }),

    setActiveAccount: (accountId) =>
      set((s) => {
        if (s.activeAccountId !== accountId) {
          s.activeAccountId = accountId;
        }
        s.activeGuildId = null;
        s.activeChannelId = null;
        s.view = "dms";
      }),

    setActiveGuild: (guildId) =>
      set((s) => {
        const acct = s.activeAccountId;
        // Save current channel for the previous guild before switching (scoped per account)
        if (acct && s.activeGuildId && s.activeChannelId) {
          if (!s.lastChannelByGuild[acct]) s.lastChannelByGuild[acct] = {};
          s.lastChannelByGuild[acct][s.activeGuildId] = s.activeChannelId;
        }
        s.activeGuildId = guildId;
        // Restore the last visited channel for this guild for the current account only
        const lastChannel = acct && guildId ? s.lastChannelByGuild[acct]?.[guildId] : null;
        s.activeChannelId = lastChannel ?? null;
        s.view = "guilds";
      }),

    setActiveChannel: (channelId) =>
      set((s) => {
        s.activeChannelId = channelId;
        // Persist so switching guilds and back restores this channel (scoped per account)
        const acct = s.activeAccountId;
        if (acct && s.activeGuildId && channelId) {
          if (!s.lastChannelByGuild[acct]) s.lastChannelByGuild[acct] = {};
          s.lastChannelByGuild[acct][s.activeGuildId] = channelId;
        }
      }),

    setView: (view) =>
      set((s) => {
        s.view = view;
        if (view === "dms") {
          s.activeGuildId = null;
          s.activeChannelId = null;
        }
      }),

    navigateToDMs: () =>
      set((s) => {
        s.view = "dms";
        s.activeGuildId = null;
        s.activeChannelId = null;
      }),

    setFocusedImage: (url) =>
      set((s) => {
        s.focusedImage = url;
      }),
  }))
);
