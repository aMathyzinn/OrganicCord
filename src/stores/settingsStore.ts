import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { load } from "@tauri-apps/plugin-store";

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
    },

    updateSetting: (key, value) => {
      set((s) => {
        s.settings[key] = value;
      });
      // Persist
      getStore().then(store => {
        store.set("app_settings", get().settings);
        store.save();
      });
    }
  }))
);
