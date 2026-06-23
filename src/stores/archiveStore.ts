import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

interface ArchiveStore {
  archivedDMs: Record<string, string[]>; // accountId -> array of channelIds
  archiveDM: (accountId: string, channelId: string) => void;
  unarchiveDM: (accountId: string, channelId: string) => void;
  isArchived: (accountId: string, channelId: string) => boolean;
}

export const useArchiveStore = create<ArchiveStore>()(
  persist(
    immer((set, get) => ({
      archivedDMs: {},
      
      archiveDM: (accountId, channelId) => set(state => {
        if (!state.archivedDMs[accountId]) state.archivedDMs[accountId] = [];
        if (!state.archivedDMs[accountId].includes(channelId)) {
          state.archivedDMs[accountId].push(channelId);
        }
      }),
      
      unarchiveDM: (accountId, channelId) => set(state => {
        if (!state.archivedDMs[accountId]) return;
        state.archivedDMs[accountId] = state.archivedDMs[accountId].filter(id => id !== channelId);
      }),
      
      isArchived: (accountId, channelId) => {
        return get().archivedDMs[accountId]?.includes(channelId) || false;
      }
    })),
    { name: "organic-archives" }
  )
);
