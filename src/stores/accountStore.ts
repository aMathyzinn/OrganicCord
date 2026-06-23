import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { StoredAccount, AccountSession, SessionStatus } from "@/types";
import * as api from "@/lib/tauri";

export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

export interface CustomStatus {
  text: string;
  emojiName?: string;
  emojiId?: string;
  expiresAt?: string;
}

interface AccountState {
  accounts: StoredAccount[];
  sessions: Record<string, AccountSession>;
  // Persisted desired status per account (survives reload)
  presenceStatus: Record<string, PresenceStatus>;
  customStatus: Record<string, CustomStatus | null>;
  loading: boolean;
  error: string | null;
  // Stealth mode: hides selected accounts and AI features
  stealthMode: boolean;
  hiddenAccountIds: string[];

  loadAccounts: () => Promise<void>;
  addAccount: (token: string) => Promise<StoredAccount>;
  removeAccount: (accountId: string) => Promise<void>;
  connectAccount: (accountId: string) => Promise<void>;
  disconnectAccount: (accountId: string) => Promise<void>;
  connectAll: () => Promise<void>;
  setSessionStatus: (accountId: string, status: SessionStatus) => void;
  setPresenceStatus: (accountId: string, status: PresenceStatus) => Promise<void>;
  setCustomStatus: (accountId: string, status: CustomStatus) => Promise<void>;
  clearCustomStatus: (accountId: string) => Promise<void>;
  clearError: () => void;
  toggleStealth: () => void;
  toggleHideAccount: (accountId: string) => void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    immer((set, get) => ({
      accounts: [],
      sessions: {},
      presenceStatus: {},
      customStatus: {},
      loading: false,
      error: null,
      stealthMode: false,
      hiddenAccountIds: [],

      loadAccounts: async () => {
        set((s) => { s.loading = true; s.error = null; });
        try {
          const accounts = await api.listAccounts();
          set((s) => { s.accounts = accounts; s.loading = false; });
        } catch (e) {
          set((s) => { s.error = String(e); s.loading = false; });
        }
      },

      addAccount: async (token: string) => {
        set((s) => { s.loading = true; s.error = null; });
        try {
          const result = await api.addAccount(token);
          set((s) => { s.accounts.push(result.account); s.loading = false; });
          await get().connectAccount(result.account.id);
          return result.account;
        } catch (e) {
          set((s) => { s.error = String(e); s.loading = false; });
          throw e;
        }
      },

      removeAccount: async (accountId: string) => {
        try {
          await api.gatewayDisconnect(accountId).catch(() => {});
          await api.removeAccount(accountId);
          set((s) => {
            s.accounts = s.accounts.filter((a) => a.id !== accountId);
            delete s.sessions[accountId];
            delete s.presenceStatus[accountId];
            delete s.customStatus[accountId];
          });
        } catch (e) {
          set((s) => { s.error = String(e); });
          throw e;
        }
      },

      connectAccount: async (accountId: string) => {
        set((s) => {
          s.sessions[accountId] = {
            ...(s.sessions[accountId] ?? {}),
            account_id: accountId,
            status: "Connecting",
          } as AccountSession;
        });
        try {
          const session = await api.connectAccount(accountId);
          set((s) => { s.sessions[accountId] = session; });

          // Connect gateway with the persisted status (default: online)
          const desiredStatus = get().presenceStatus[accountId] ?? "online";
          await api.gatewayConnect(accountId, desiredStatus);
        } catch (e) {
          set((s) => {
            s.sessions[accountId] = {
              ...(s.sessions[accountId] ?? {}),
              status: { Error: String(e) },
            } as AccountSession;
          });
        }
      },

      disconnectAccount: async (accountId: string) => {
        await api.gatewayDisconnect(accountId).catch(() => {});
        await api.disconnectAccount(accountId);
        set((s) => {
          if (s.sessions[accountId]) {
            s.sessions[accountId].status = "Disconnected";
          }
        });
      },

      connectAll: async () => {
        const { accounts, connectAccount } = get();
        await Promise.all(accounts.map((a) => connectAccount(a.id)));
      },

      setSessionStatus: (accountId: string, status: SessionStatus) => {
        set((s) => {
          if (s.sessions[accountId]) {
            s.sessions[accountId].status = status;
          }
        });
      },

      setPresenceStatus: async (accountId: string, status: PresenceStatus) => {
        set((s) => { s.presenceStatus[accountId] = status; });
        // Update live gateway session if connected
        await api.gatewaySetStatus(accountId, status).catch((e) => {
          console.warn("[presence] gateway_set_status failed:", e);
        });
      },

      setCustomStatus: async (accountId: string, status: CustomStatus) => {
        set((s) => { s.customStatus[accountId] = status; });
        await api.setCustomStatus(accountId, status).catch((e) => {
          console.warn("[customStatus] set_custom_status failed:", e);
        });
        await api.gatewaySetCustomActivity(accountId, status.text, status.emojiName, status.emojiId).catch((e) => {
          console.warn("[customStatus] gateway_set_custom_activity failed:", e);
        });
      },

      clearCustomStatus: async (accountId: string) => {
        set((s) => { s.customStatus[accountId] = null; });
        await api.clearCustomStatus(accountId).catch((e) => {
          console.warn("[customStatus] clear_custom_status failed:", e);
        });
        await api.gatewaySetCustomActivity(accountId).catch((e) => {
          console.warn("[customStatus] gateway_set_custom_activity (clear) failed:", e);
        });
      },

      clearError: () => set((s) => { s.error = null; }),

      toggleStealth: () => set((s) => { s.stealthMode = !s.stealthMode; }),

      toggleHideAccount: (accountId: string) => set((s) => {
        const idx = s.hiddenAccountIds.indexOf(accountId);
        if (idx === -1) s.hiddenAccountIds.push(accountId);
        else s.hiddenAccountIds.splice(idx, 1);
      }),
    })),
    {
      name: "organiccord-accounts",
      // Only persist desired presence status and custom status — sessions are rebuilt on reconnect
      partialize: (s) => ({ presenceStatus: s.presenceStatus, customStatus: s.customStatus, stealthMode: s.stealthMode, hiddenAccountIds: s.hiddenAccountIds }),
    }
  )
);
