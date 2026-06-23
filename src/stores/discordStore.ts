import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { DiscordGuild, DiscordChannel, DiscordMessage, DiscordDM, DiscordRelationship, DiscordPresence } from "@/types";
import * as api from "@/lib/tauri";

interface DiscordCache {
  guilds: Record<string, DiscordGuild[]>;         // accountId → guilds
  channels: Record<string, DiscordChannel[]>;     // guildId → channels
  messages: Record<string, DiscordMessage[]>;     // channelId → messages
  dms: Record<string, DiscordDM[]>;               // accountId → DMs
  guildEmojis: Record<string, Record<string, any[]>>; // accountId -> guildId -> emojis
  guildRoles: Record<string, Record<string, any[]>>; // accountId -> guildId -> roles
  session_ids: Record<string, string>;            // accountId -> sessionId
  relationships: Record<string, DiscordRelationship[]>; // accountId → relationships
  presences: Record<string, Record<string, DiscordPresence>>; // accountId -> userId -> presence
  threads: Record<string, any[]>;                 // guildId → threads
  pinnedMessages: Record<string, DiscordMessage[]>; // channelId -> pinned messages
  unreads: Record<string, Record<string, { count: number; mentions: number; guildId?: string }>>; // accountId -> channelId -> unread data
  typingUsers: Record<string, { userId: string; timestamp: number; member?: any }[]>; // channelId -> users
}

interface LoadingState {
  guilds: Record<string, boolean>;
  channels: Record<string, boolean>;
  messages: Record<string, boolean>;
  threads: Record<string, boolean>;
}

interface DiscordStore {
  cache: DiscordCache;
  loading: LoadingState;
  errors: Record<string, string>;

  setSessionId: (accountId: string, sessionId: string) => void;
  fetchGuilds: (accountId: string) => Promise<void>;
  fetchChannels: (accountId: string, guildId: string) => Promise<void>;
  fetchForumThreads: (accountId: string, channelId: string, guildId: string) => Promise<void>;
  fetchMessages: (accountId: string, channelId: string) => Promise<void>;
  fetchMoreMessages: (accountId: string, channelId: string) => Promise<void>;
  fetchDMs: (accountId: string) => Promise<void>;
  closeDM: (accountId: string, channelId: string) => Promise<void>;
  openDM: (accountId: string, userId: string) => Promise<string>;
  fetchRelationships: (accountId: string) => Promise<void>;
  fetchPinnedMessages: (accountId: string, channelId: string) => Promise<void>;
  pinMessage: (accountId: string, channelId: string, messageId: string) => Promise<void>;
  unpinMessage: (accountId: string, channelId: string, messageId: string) => Promise<void>;
  sendMessage: (accountId: string, channelId: string, content: string, replyTo?: string) => Promise<void>;
  sendMessageWithAttachment: (
    accountId: string,
    channelId: string,
    content: string,
    replyTo: string | undefined,
    fileName: string,
    filePath?: string,
    fileData?: Uint8Array
  ) => Promise<void>;
  addReaction: (accountId: string, channelId: string, messageId: string, emoji: string) => Promise<void>;
  removeReaction: (accountId: string, channelId: string, messageId: string, emoji: string) => Promise<void>;
  prependMessage: (channelId: string, message: DiscordMessage) => void;
  addGuildEmojis: (accountId: string, guildId: string, emojis: any[]) => void;
  addGuildRoles: (accountId: string, guildId: string, roles: any[]) => void;
  updatePresence: (accountId: string, presence: DiscordPresence) => void;
  updatePresences: (accountId: string, presences: DiscordPresence[]) => void;
  incrementUnread: (accountId: string, channelId: string, hasMention: boolean, guildId?: string) => void;
  clearUnread: (accountId: string, channelId: string) => void;
  addTypingUser: (channelId: string, userId: string, timestamp: number, member?: any) => void;
  clearCache: (accountId: string) => void;
}

export const useDiscordStore = create<DiscordStore>()(
  immer((set, get) => ({
    cache: { 
      guilds: {}, 
      channels: {}, 
      messages: {}, 
      dms: {}, 
      guildEmojis: {}, 
      guildRoles: {},
      session_ids: {},
      relationships: {}, 
      presences: {}, 
      threads: {}, 
      pinnedMessages: {}, 
      unreads: {},
      typingUsers: {}
    },
    loading: { guilds: {}, channels: {}, messages: {}, threads: {} },
    errors: {},
    
    setSessionId: (accountId, sessionId) => {
      set((s) => {
        s.cache.session_ids[accountId] = sessionId;
      });
    },

    fetchGuilds: async (accountId) => {
      if (get().loading.guilds[accountId]) return;
      set((s) => { s.loading.guilds[accountId] = true; });
      try {
        const guilds = await api.getGuilds(accountId);
        // Ordena por nome
        guilds.sort((a, b) => a.name.localeCompare(b.name));
        
        // Tenta carregar emojis cacheados
        try {
          const cachedEmojis = localStorage.getItem(`guildEmojis-${accountId}`);
          if (cachedEmojis) {
            set((s) => { s.cache.guildEmojis[accountId] = JSON.parse(cachedEmojis); });
          }
        } catch (e) {}

        set((s) => {
          s.cache.guilds[accountId] = guilds;
          s.loading.guilds[accountId] = false;
        });
      } catch (e) {
        set((s) => {
          s.errors[`guilds-${accountId}`] = String(e);
          s.loading.guilds[accountId] = false;
        });
      }
    },

    fetchChannels: async (accountId, guildId) => {
      if (get().loading.channels[guildId]) return;
      set((s) => { s.loading.channels[guildId] = true; });
      try {
        const channels = await api.getChannels(accountId, guildId);
        // Subscribe to presences and members for this guild
        api.subscribeGuild(accountId, guildId).catch(console.error);
        // Ordena por posição
        channels.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        set((s) => {
          s.cache.channels[guildId] = channels;
          s.loading.channels[guildId] = false;
        });
      } catch (e) {
        set((s) => {
          s.errors[`channels-${guildId}`] = String(e);
          s.loading.channels[guildId] = false;
        });
      }
    },

    fetchForumThreads: async (accountId, channelId, guildId) => {
      console.log(`[discordStore] fetchForumThreads called with accountId: ${accountId}, channelId: ${channelId}, guildId: ${guildId}. Loading state: ${get().loading.threads[channelId]}`);
      if (!accountId || !channelId || !guildId) return;
      if (get().loading.threads[channelId]) return;
      set((s) => { s.loading.threads[channelId] = true; });
      try {
        const response = await api.getForumThreads(accountId, channelId, guildId);
        console.log(`[discordStore] fetchForumThreads raw response keys:`, Object.keys(response));
        console.log(`[discordStore] fetchForumThreads raw response preview:`, JSON.stringify(response).substring(0, 300));
        // Dependendo da estrutura de search, pode ter 'threads', 'posts', ou a array pode estar na raiz
        const threads = response.threads || (Array.isArray(response) ? response : []);
        console.log(`[discordStore] extracted threads count:`, threads.length);
        set((s) => {
          // Salvar threads na key do guildId, mas como não temos o guildId aqui facilmente,
          // podemos mapear por channelId? Wait! A cache.threads é Record<string, any[]>.
          // Vamos continuar usando cache.threads, mas salvar na key do channelId para simplificar o ForumArea.
          s.cache.threads[channelId] = threads;
          s.loading.threads[channelId] = false;
        });
      } catch (e) {
        console.error(`[discordStore] Error fetching forum threads:`, e);
        set((s) => {
          s.errors[`threads-${channelId}`] = String(e);
          s.loading.threads[channelId] = false;
        });
      }
    },

    fetchMessages: async (accountId, channelId) => {
      set((s) => { s.loading.messages[channelId] = true; });
      try {
        const messages = await api.getMessages(accountId, channelId);
        set((s) => {
          s.cache.messages[channelId] = messages;
          s.loading.messages[channelId] = false;
        });
      } catch (e) {
        set((s) => {
          s.errors[`messages-${channelId}`] = String(e);
          s.loading.messages[channelId] = false;
        });
      }
    },

    fetchMoreMessages: async (accountId, channelId) => {
      const existing = get().cache.messages[channelId];
      if (!existing || existing.length === 0) return;

      const oldest = existing[existing.length - 1];
      try {
        const older = await api.getMessages(accountId, channelId, oldest.id);
        set((s) => {
          const cur = s.cache.messages[channelId] ?? [];
          const curIds = new Set(cur.map((m) => m.id));
          const toAdd = older.filter((m) => !curIds.has(m.id));
          s.cache.messages[channelId] = [...cur, ...toAdd];
        });
      } catch (e) {
        set((s) => { s.errors[`messages-${channelId}`] = String(e); });
      }
    },

    fetchDMs: async (accountId) => {
      try {
        const dms = await api.getDMs(accountId);
        set((s) => { s.cache.dms[accountId] = dms; });
      } catch (e) {
        set((s) => { s.errors[`dms-${accountId}`] = String(e); });
      }
    },

    closeDM: async (accountId, channelId) => {
      try {
        await api.closeDM(accountId, channelId);
        set((s) => {
          if (s.cache.dms[accountId]) {
            s.cache.dms[accountId] = s.cache.dms[accountId].filter(dm => dm.id !== channelId);
          }
        });
      } catch (e) {
        console.error("Erro ao fechar DM:", e);
      }
    },

    fetchPinnedMessages: async (accountId, channelId) => {
      try {
        const pins = await api.getPinnedMessages(accountId, channelId);
        set((s) => { s.cache.pinnedMessages[channelId] = pins; });
      } catch (e) {
        console.error("Erro ao buscar mensagens fixadas:", e);
      }
    },

    pinMessage: async (accountId, channelId, messageId) => {
      try {
        await api.pinMessage(accountId, channelId, messageId);
      } catch (e) {
        console.error("Erro ao fixar mensagem:", e);
      }
    },

    unpinMessage: async (accountId, channelId, messageId) => {
      try {
        await api.unpinMessage(accountId, channelId, messageId);
      } catch (e) {
        console.error("Erro ao desfixar mensagem:", e);
      }
    },

    openDM: async (accountId, userId) => {
      // 1. Verificar se a DM já existe no cache
      const dms = get().cache.dms[accountId] || [];
      const existingDM = dms.find(dm => 
        dm.channel_type === 1 && dm.recipients?.length === 1 && dm.recipients[0].id === userId
      );
      
      if (existingDM) {
        return existingDM.id;
      }

      // 2. Se não existir, chama API para criar/abrir DM
      try {
        const dm = await api.createDM(accountId, userId);
        set((s) => {
          if (!s.cache.dms[accountId]) s.cache.dms[accountId] = [];
          s.cache.dms[accountId].push(dm);
        });
        return dm.id;
      } catch (e) {
        console.error("Failed to open DM:", e);
        throw e;
      }
    },

    fetchRelationships: async (accountId) => {
      console.log("fetchRelationships called for account:", accountId);
      try {
        const [rels, presences] = await Promise.all([
          api.getRelationships(accountId),
          api.getGatewayPresences(accountId).catch(e => {
            console.error("Failed to get presences:", e);
            return [];
          })
        ]);
        console.log("getGatewayPresences returned:", presences);
        set((s) => { 
          s.cache.relationships[accountId] = rels; 
          if (!s.cache.presences[accountId]) {
            s.cache.presences[accountId] = {};
          }
          if (presences && Array.isArray(presences)) {
            for (const presence of presences) {
              if (presence && presence.user && presence.user.id) {
                s.cache.presences[accountId][presence.user.id] = presence;
              }
            }
          }
        });
      } catch (e) {
        console.error("fetchRelationships error:", e);
        set((s) => { s.errors[`relationships-${accountId}`] = String(e); });
      }
    },

    sendMessage: async (accountId, channelId, content, replyTo) => {
      const message = await api.sendMessage(accountId, channelId, content, replyTo);
      get().prependMessage(channelId, message);
    },

    sendMessageWithAttachment: async (accountId, channelId, content, replyTo, fileName, filePath, fileData) => {
      const message = await api.sendMessageWithAttachment(
        accountId,
        channelId,
        content,
        replyTo,
        fileName,
        filePath,
        fileData
      );
      get().prependMessage(channelId, message);
    },

    addReaction: async (accountId, channelId, messageId, emoji) => {
      // Optimistic update
      set((s) => {
        const msgs = s.cache.messages[channelId];
        if (msgs) {
          const msg = msgs.find(m => m.id === messageId);
          if (msg) {
            if (!msg.reactions) msg.reactions = [];
            const r = msg.reactions.find(x => x.emoji.name === emoji);
            if (r) {
              if (!r.me) {
                r.count++;
                r.me = true;
              }
            } else {
              msg.reactions.push({
                count: 1,
                me: true,
                emoji: { id: null, name: emoji }
              });
            }
          }
        }
      });
      try {
        await api.addReaction(accountId, channelId, messageId, emoji);
      } catch (e) {
        // Rollback
        console.error(e);
      }
    },

    removeReaction: async (accountId, channelId, messageId, emoji) => {
      // Optimistic update
      set((s) => {
        const msgs = s.cache.messages[channelId];
        if (msgs) {
          const msg = msgs.find(m => m.id === messageId);
          if (msg && msg.reactions) {
            const rIndex = msg.reactions.findIndex(x => x.emoji.name === emoji);
            if (rIndex !== -1) {
              const r = msg.reactions[rIndex];
              if (r.me) {
                r.count--;
                r.me = false;
                if (r.count <= 0) {
                  msg.reactions.splice(rIndex, 1);
                }
              }
            }
          }
        }
      });
      try {
        await api.removeReaction(accountId, channelId, messageId, emoji);
      } catch (e) {
        console.error(e);
      }
    },

    prependMessage: (channelId, message) => {
      set((s) => {
        const msgs = s.cache.messages[channelId];
        if (msgs) {
          const fingerprint = `${message.author.id}:${message.content.trim()}`;
          const existingIndex = msgs.findIndex(
            (m) => m.id === message.id || (m.id.startsWith("local-") && `${m.author.id}:${m.content.trim()}` === fingerprint)
          );
          
          if (existingIndex !== -1) {
            const existing = msgs[existingIndex];
            if (existing.id.startsWith("local-") && !message.id.startsWith("local-")) {
              msgs[existingIndex] = message;
            }
          } else {
            msgs.unshift(message);
          }
        } else {
          s.cache.messages[channelId] = [message];
        }
      });
    },

    addGuildEmojis: (accountId, guildId, emojis) => {
      set((s) => {
        if (!s.cache.guildEmojis[accountId]) {
          s.cache.guildEmojis[accountId] = {};
        }
        s.cache.guildEmojis[accountId][guildId] = emojis.map((e: any) => ({
          id: e.id,
          names: [e.name],
          imgUrl: `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "webp"}?size=48`
        }));
        
        try {
          localStorage.setItem(`guildEmojis-${accountId}`, JSON.stringify(s.cache.guildEmojis[accountId]));
        } catch (e) {}
      });
    },

    addGuildRoles: (accountId, guildId, roles) => {
      set((s) => {
        if (!s.cache.guildRoles) s.cache.guildRoles = {};
        if (!s.cache.guildRoles[accountId]) s.cache.guildRoles[accountId] = {};
        s.cache.guildRoles[accountId][guildId] = roles;
      });
    },

    updatePresence: (accountId, presence) => {
      set((s) => {
        if (!s.cache.presences[accountId]) {
          s.cache.presences[accountId] = {};
        }
        s.cache.presences[accountId][presence.user.id] = presence;
      });
    },

    updatePresences: (accountId, presences) => {
      set((s) => {
        if (!s.cache.presences[accountId]) {
          s.cache.presences[accountId] = {};
        }
        for (const presence of presences) {
          s.cache.presences[accountId][presence.user.id] = presence;
        }
      });
    },

    incrementUnread: (accountId, channelId, hasMention, guildId) => {
      set((s) => {
        if (!s.cache.unreads[accountId]) {
          s.cache.unreads[accountId] = {};
        }
        if (!s.cache.unreads[accountId][channelId]) {
          s.cache.unreads[accountId][channelId] = { count: 0, mentions: 0, guildId };
        }
        s.cache.unreads[accountId][channelId].count += 1;
        if (hasMention) {
          s.cache.unreads[accountId][channelId].mentions += 1;
        }
      });
    },

    clearUnread: (accountId, channelId) => {
      set((s) => {
        if (s.cache.unreads[accountId] && s.cache.unreads[accountId][channelId]) {
          s.cache.unreads[accountId][channelId].count = 0;
          s.cache.unreads[accountId][channelId].mentions = 0;
        }
      });
    },

    addTypingUser: (channelId, userId, timestamp, member) => {
      set((s) => {
        if (!s.cache.typingUsers[channelId]) {
          s.cache.typingUsers[channelId] = [];
        }
        
        const existing = s.cache.typingUsers[channelId].find(u => u.userId === userId);
        if (existing) {
          existing.timestamp = timestamp;
          if (member) existing.member = member;
        } else {
          s.cache.typingUsers[channelId].push({ userId, timestamp, member });
        }

        // Limpa usuários que não digitam há mais de 10 segundos
        const now = Date.now();
        s.cache.typingUsers[channelId] = s.cache.typingUsers[channelId].filter(
          (u) => now - u.timestamp < 10000
        );
      });
    },

    clearCache: (accountId) => {
      set((s) => {
        delete s.cache.guilds[accountId];
        delete s.cache.dms[accountId];
      });
    },
  }))
);
