import { create } from "zustand";

interface ProfileState {
  isOpen: boolean;
  userId: string | null;
  openProfile: (userId: string) => void;
  closeProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  isOpen: false,
  userId: null,
  openProfile: (userId: string) => set({ isOpen: true, userId }),
  closeProfile: () => set({ isOpen: false, userId: null }),
}));
