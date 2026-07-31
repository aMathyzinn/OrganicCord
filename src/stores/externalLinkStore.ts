import { create } from "zustand";
import { open as openUrl } from "@tauri-apps/plugin-shell";

interface ExternalLinkState {
  isOpen: boolean;
  targetUrl: string;
  openExternalLink: (url: string) => void;
  confirmOpen: () => Promise<void>;
  closeModal: () => void;
}

export const useExternalLinkStore = create<ExternalLinkState>((set, get) => ({
  isOpen: false,
  targetUrl: "",

  openExternalLink: (url: string) => {
    if (!url) return;
    set({ isOpen: true, targetUrl: url });
  },

  confirmOpen: async () => {
    const { targetUrl } = get();
    if (targetUrl) {
      try {
        await openUrl(targetUrl);
      } catch (e) {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
      }
    }
    set({ isOpen: false, targetUrl: "" });
  },

  closeModal: () => {
    set({ isOpen: false, targetUrl: "" });
  },
}));
