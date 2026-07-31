import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { load } from "@tauri-apps/plugin-store";
import { applyTheme } from "@/lib/themeManager";

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

let storeCache: any = null;
const getStore = async () => {
  if (!storeCache) {
    storeCache = await load("organiccord_settings.json", { autoSave: false } as any);
  }
  return storeCache;
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
      const store = await getStore();
      const savedSettings = await (store as any).get("app_settings") as Partial<AppSettings>;
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
      // Persist
      getStore().then(store => {
        store.set("app_settings", get().settings);
        store.save();
      });
    }
  }))
);
