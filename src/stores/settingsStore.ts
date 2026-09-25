import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { applyTheme } from "@/lib/themeManager";
import { getAppStore, persistStoreEntries } from "@/lib/appStore";
import { toast } from "@/components/ui/Toast";

export type ThemeId = "dark" | "light" | "midnight" | "system" | "custom" | string;
export type DisplayMode = "cozy" | "compact";

export interface CustomThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  brandColor: string;
  textColor: string;
}

export interface AppSettings {
  desktopNotifications: boolean;
  flashTaskbar: boolean;
  soundDms: boolean;
  soundMentions: boolean;
  soundUserJoin: boolean;
  soundUserLeave: boolean;
  soundMuteToggle: boolean;
  allowServerDMs: boolean;
  filterExplicitDMs: boolean;

  // Personalizações de Aparência
  theme: ThemeId;
  customThemeColors?: CustomThemeColors;
  appIcon: string;
  displayMode: DisplayMode;
  fontSize: number;
  messageSpacing: number;
  syncThemeWithOS: boolean;
  applyOtherUsersThemes: boolean;
  streamerMode: boolean;
}

const defaultSettings: AppSettings = {
  desktopNotifications: true,
  flashTaskbar: true,
  soundDms: true,
  soundMentions: true,
  soundUserJoin: true,
  soundUserLeave: true,
  soundMuteToggle: true,
  allowServerDMs: true,
  filterExplicitDMs: true,

  theme: "midnight",
  appIcon: "dark_mono",
  displayMode: "cozy",
  fontSize: 15,
  messageSpacing: 16,
  syncThemeWithOS: false,
  applyOtherUsersThemes: false,
  streamerMode: false,
};

interface SettingsStore {
  settings: AppSettings;
  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  immer((set, get) => ({
    settings: defaultSettings,

    loadSettings: async () => {
      const store = await getAppStore();
      const savedSettings = await store.get<Partial<AppSettings>>("app_settings");
      if (savedSettings) {
        set((s) => {
          s.settings = { ...defaultSettings, ...savedSettings };
        });
      }
      applyTheme(get().settings);
    },

    updateSetting: (key, value) => {
      set((s) => {
        s.settings[key] = value;
      });
      applyTheme(get().settings);
      void persistStoreEntries([["app_settings", get().settings]]).catch((error: unknown) => {
        console.error("Não foi possível salvar as configurações locais.", error);
        toast.error("Não foi possível salvar esta configuração. Tente novamente.");
      });
    }
  }))
);
