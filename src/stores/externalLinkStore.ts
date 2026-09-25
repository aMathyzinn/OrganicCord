import { create } from "zustand";
import { open as openUrl } from "@tauri-apps/plugin-shell";

interface ExternalLinkState {
  isOpen: boolean;
  targetUrl: string;
  error: string | null;
  openExternalLink: (url: string) => void;
  confirmOpen: () => Promise<void>;
  closeModal: () => void;
}

function validatedWebUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export const useExternalLinkStore = create<ExternalLinkState>((set, get) => ({
  isOpen: false,
  targetUrl: "",
  error: null,

  openExternalLink: (url: string) => {
    if (!url) return;
    const safeUrl = validatedWebUrl(url);
    set({
      isOpen: true,
      targetUrl: safeUrl ?? url,
      error: safeUrl ? null : "O OrganicCord bloqueou este endereço porque ele não é um link HTTP ou HTTPS seguro.",
    });
  },

  confirmOpen: async () => {
    const { targetUrl } = get();
    const safeUrl = validatedWebUrl(targetUrl);
    if (!safeUrl) return;
    try {
      await openUrl(safeUrl);
      set({ isOpen: false, targetUrl: "", error: null });
    } catch {
      set({ error: "O sistema não conseguiu abrir este endereço no navegador padrão." });
    }
  },

  closeModal: () => {
    set({ isOpen: false, targetUrl: "", error: null });
  },
}));
