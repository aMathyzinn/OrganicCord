import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { NavigationState } from "@/types";
import { getAppStore, persistStoreEntries } from "@/lib/appStore";
import { toast } from "@/components/ui/Toast";

function persistNavigation(entries: ReadonlyArray<readonly [string, unknown]>): void {
  void persistStoreEntries(entries).catch((error: unknown) => {
    console.error("Não foi possível salvar a navegação local.", error);
    toast.error("Não foi possível salvar a organização dos servidores.");
  });
}

interface GuildFolder {
  id: string;
  name?: string;
  color?: string;
  guildIds: string[];
  isExpanded: boolean;
}

function snapshotFolders(folders: readonly GuildFolder[]): GuildFolder[] {
  return folders.map((folder) => ({ ...folder, guildIds: [...folder.guildIds] }));
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
      persistNavigation([[`guildOrder_${accountId}`, order]]);
    }),

    reorderGuilds: (accountId, startIndex, endIndex) => set((s) => {
      const result = Array.from(s.guildOrder[accountId] || []);
      const [removed] = result.splice(startIndex, 1);
      if (!removed) return;
      result.splice(endIndex, 0, removed);
      s.guildOrder[accountId] = result;
      persistNavigation([[`guildOrder_${accountId}`, result]]);
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
      
      persistNavigation([
        [`folders_${accountId}`, snapshotFolders(s.guildFolders[accountId])],
        [`guildOrder_${accountId}`, [...s.guildOrder[accountId]]],
      ]);
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
      
      persistNavigation([[`folders_${accountId}`, snapshotFolders(s.guildFolders[accountId])]]);
    }),

    toggleFolder: (accountId, folderId) => set((s) => {
      const folders = s.guildFolders[accountId];
      if (folders) {
        const folder = folders.find(f => f.id === folderId);
        if (folder) folder.isExpanded = !folder.isExpanded;
        persistNavigation([[`folders_${accountId}`, snapshotFolders(s.guildFolders[accountId])]]);
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
      
      persistNavigation([[`folders_${accountId}`, snapshotFolders(s.guildFolders[accountId])]]);
    }),

    removeFolder: (accountId, folderId) => set((s) => {
      if (s.guildFolders[accountId]) {
        s.guildFolders[accountId] = s.guildFolders[accountId].filter(f => f.id !== folderId);
        persistNavigation([[`folders_${accountId}`, snapshotFolders(s.guildFolders[accountId])]]);
      }
    }),

    loadFolders: async (accountId) => {
      const store = await getAppStore();
      const savedFolders = await store.get<GuildFolder[]>(`folders_${accountId}`);
      const savedOrder = await store.get<string[]>(`guildOrder_${accountId}`);
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
        console.info("[guild-content] guild_selected", { accountId: acct, guildId });
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
