import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { load } from "@tauri-apps/plugin-store";
import type { NavigationState } from "@/types";

let storeCache: any = null;
const getStore = async () => {
  if (!storeCache) {
    storeCache = await load("organiccord_settings.json", { autoSave: false } as any);
  }
  return storeCache;
};

interface GuildFolder {
  id: string;
  name?: string;
  color?: string;
  guildIds: string[];
  isExpanded: boolean;
}

interface NavigationStore extends NavigationState {
  // Maps accountId → guildId → last active channelId (per-account, so switching accounts doesn't bleed nav state)
  lastChannelByGuild: Record<string, Record<string, string>>;
  focusedImage: string | null;
  guildFolders: Record<string, GuildFolder[]>; // accountId -> folders
  guildOrder: Record<string, string[]>; // accountId -> array of guildId / folderId
  setActiveAccount: (accountId: string | null) => void;
  setActiveGuild: (guildId: string | null) => void;
  setActiveChannel: (channelId: string | null) => void;
  setView: (view: NavigationState["view"]) => void;
  navigateToDMs: () => void;
  setFocusedImage: (url: string | null) => void;
  createFolder: (accountId: string, guildIds: string[], name?: string, color?: string) => void;
  toggleFolder: (accountId: string, folderId: string) => void;
  moveGuildToFolder: (accountId: string, guildId: string, targetFolderId: string | null) => void;
  removeFolder: (accountId: string, folderId: string) => void;
  loadFolders: (accountId: string) => Promise<void>;
  setGuildOrder: (accountId: string, order: string[]) => void;
  reorderGuilds: (accountId: string, startIndex: number, endIndex: number) => void;
  combineGuildsIntoFolder: (accountId: string, sourceId: string, targetId: string) => void;
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
    guildFolders: {},
    guildOrder: {},

    setGuildOrder: (accountId, order) => set((s) => {
      s.guildOrder[accountId] = order;
      getStore().then(store => {
        store.set(`guildOrder_${accountId}`, order);
        store.save();
      });
    }),

    reorderGuilds: (accountId, startIndex, endIndex) => set((s) => {
      const result = Array.from(s.guildOrder[accountId] || []);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      s.guildOrder[accountId] = result;
      
      getStore().then(store => {
        store.set(`guildOrder_${accountId}`, result);
        store.save();
      });
    }),

    combineGuildsIntoFolder: (accountId, sourceId, targetId) => set((s) => {
      // sourceId is dropped onto targetId
      // Ensure target is not already a folder
      const folders = s.guildFolders[accountId] || [];
      const order = s.guildOrder[accountId] || [];
      
      const isTargetFolder = targetId.startsWith("folder-");
      if (isTargetFolder) {
         // add source to folder
         const folder = folders.find(f => f.id === targetId);
         if (folder && !folder.guildIds.includes(sourceId)) {
           folder.guildIds.push(sourceId);
           s.guildOrder[accountId] = order.filter(id => id !== sourceId);
         }
      } else {
         // create new folder
         const newFolder: GuildFolder = {
           id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
           guildIds: [targetId, sourceId], // drop over target -> target is visually first
           isExpanded: false
         };
         if (!s.guildFolders[accountId]) s.guildFolders[accountId] = [];
         s.guildFolders[accountId].push(newFolder);
         
         // Replace targetId in order with new folder, and remove sourceId
         let newOrder = order.map(id => id === targetId ? newFolder.id : id);
         newOrder = newOrder.filter(id => id !== sourceId);
         s.guildOrder[accountId] = newOrder;
      }
      
      getStore().then(store => {
        store.set(`folders_${accountId}`, s.guildFolders[accountId]);
        store.set(`guildOrder_${accountId}`, s.guildOrder[accountId]);
        store.save();
      });
    }),

    createFolder: (accountId, guildIds, name, color) => set((s) => {
      if (!s.guildFolders[accountId]) s.guildFolders[accountId] = [];
      const newFolder: GuildFolder = {
        id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name,
        color,
        guildIds,
        isExpanded: false
      };
      s.guildFolders[accountId].push(newFolder);
      
      // Persist async
      getStore().then(store => {
        store.set(`folders_${accountId}`, s.guildFolders[accountId]);
        store.save();
      });
    }),

    toggleFolder: (accountId, folderId) => set((s) => {
      const folders = s.guildFolders[accountId];
      if (folders) {
        const folder = folders.find(f => f.id === folderId);
        if (folder) folder.isExpanded = !folder.isExpanded;
        // Persist async
        getStore().then(store => {
          store.set(`folders_${accountId}`, s.guildFolders[accountId]);
          store.save();
        });
      }
    }),

    moveGuildToFolder: (accountId, guildId, targetFolderId) => set((s) => {
      if (!s.guildFolders[accountId]) s.guildFolders[accountId] = [];
      // Remove from any existing folder
      s.guildFolders[accountId].forEach(f => {
        f.guildIds = f.guildIds.filter(id => id !== guildId);
      });
      // Add to new folder if target is specified
      if (targetFolderId) {
        const targetFolder = s.guildFolders[accountId].find(f => f.id === targetFolderId);
        if (targetFolder && !targetFolder.guildIds.includes(guildId)) {
          targetFolder.guildIds.push(guildId);
        }
      }
      // Clean up empty folders
      s.guildFolders[accountId] = s.guildFolders[accountId].filter(f => f.guildIds.length > 0);
      
      // Persist async
      getStore().then(store => {
        store.set(`folders_${accountId}`, s.guildFolders[accountId]);
        store.save();
      });
    }),

    removeFolder: (accountId, folderId) => set((s) => {
      if (s.guildFolders[accountId]) {
        s.guildFolders[accountId] = s.guildFolders[accountId].filter(f => f.id !== folderId);
        // Persist async
        getStore().then(store => {
          store.set(`folders_${accountId}`, s.guildFolders[accountId]);
          store.save();
        });
      }
    }),

    loadFolders: async (accountId) => {
      const store = await getStore();
      const savedFolders = await (store as any).get(`folders_${accountId}`) as GuildFolder[];
      const savedOrder = await (store as any).get(`guildOrder_${accountId}`) as string[];
      set((s) => {
        if (savedFolders) s.guildFolders[accountId] = savedFolders;
        if (savedOrder) s.guildOrder[accountId] = savedOrder;
      });
    },

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
