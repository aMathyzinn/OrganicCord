import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useAccountStore } from './accountStore';

interface VoiceState {
  isConnecting: boolean;
  isConnected: boolean;
  accountId: string | null;
  channelId: string | null;
  guildId: string | null;
  serverId: string | null; // Usado para Identify (é o guild_id ou channel_id em DMs)
  sessionId: string | null;
  token: string | null;
  endpoint: string | null;
  
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  isMuted: boolean;
  isDeafened: boolean;

  setInputDevice: (id: string | null) => void;
  setOutputDevice: (id: string | null) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  
  joinCall: (accountId: string, guildId: string | null, channelId: string) => Promise<void>;
  leaveCall: () => Promise<void>;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  isConnecting: false,
  isConnected: false,
  accountId: null,
  channelId: null,
  guildId: null,
  serverId: null,
  sessionId: null,
  token: null,
  endpoint: null,
  inputDeviceId: null,
  outputDeviceId: null,
  isMuted: false,
  isDeafened: false,

  setInputDevice: (id) => {
    set({ inputDeviceId: id });
    const s = get();
    if (s.isConnected && s.accountId && s.channelId) {
      s.joinCall(s.accountId, s.guildId, s.channelId);
    }
  },
  setOutputDevice: (id) => set({ outputDeviceId: id }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleDeafen: () => set((s) => ({ isDeafened: !s.isDeafened })),

  joinCall: async (accountId, guildId, channelId) => {
    // Em DMs, o guildId é nulo, portanto o server_id que usamos no Voice Gateway é o próprio channel_id
    const serverId = guildId || channelId;
    
    set({ 
      isConnecting: true, 
      isConnected: false, 
      accountId, 
      guildId, 
      channelId, 
      serverId,
      sessionId: null,
      token: null,
      endpoint: null
    });
    
    console.log(`[Voice] Juntando-se a Call (Account: ${accountId}, Guild: ${guildId}, Channel: ${channelId})`);
    
    // Se for uma DM, precisamos iniciar o "Ring" via HTTP antes de conectar no Voice WS
    if (!guildId) {
      try {
        console.log("[Voice] Iniciando chamada de DM via HTTP...");
        await invoke('start_dm_call', { accountId, channelId });
        console.log("[Voice] Ring enviado, aguardando 1 segundo...");
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error("[Voice] Erro ao iniciar chamada na DM:", err);
        // Mesmo falhando, tentamos o WS se for o caso
      }
    }

    try {
      await invoke('gateway_join_voice', { accountId, guildId, channelId });
    } catch (err) {
      console.error("[Voice] Falha fatal ao comunicar com backend:", err);
      set({ isConnecting: false, isConnected: false });
    }
  },

  leaveCall: async () => {
    const { accountId, guildId } = get();
    if (accountId) {
      try {
        await invoke('gateway_join_voice', { accountId, guildId, channelId: null });
      } catch (err) {
        console.error("[Voice] Erro ao sair da call no backend:", err);
      }
    }
    set({ 
      isConnecting: false, 
      isConnected: false, 
      channelId: null, 
      guildId: null, 
      serverId: null, 
      sessionId: null, 
      token: null, 
      endpoint: null 
    });
  }
}));

// Listener para capturar respostas do Gateway
if (typeof window !== 'undefined') {
  listen('gateway-voice-state', (event: any) => {
    const { account_id, data } = event.payload;
    const store = useVoiceStore.getState();
    console.log("[Voice] Raw VOICE_STATE_UPDATE payload:", event.payload);
    console.log(`[Voice Debug State] store.accountId=${store.accountId} == payload.account_id=${account_id}`);
    console.log(`[Voice Debug State] store.channelId=${store.channelId} == data.channel_id=${data.channel_id}`);
    
    // O Discord emite nossa sessão
    if (store.accountId === account_id && store.channelId === data.channel_id) {
      console.log("[Voice] VOICE_STATE_UPDATE recebido:", data);
      useVoiceStore.setState({ sessionId: data.session_id });
      checkAndConnect();
    }
  });

  listen('gateway-voice-server', (event: any) => {
    const { account_id, data } = event.payload;
    const store = useVoiceStore.getState();
    console.log("[Voice] Raw VOICE_SERVER_UPDATE payload:", event.payload);
    console.log(`[Voice Debug Server] store.accountId=${store.accountId} == payload.account_id=${account_id}`);
    console.log(`[Voice Debug Server] endpoint: ${data.endpoint}`);
    
    if (store.accountId === account_id) {
      console.log("[Voice] VOICE_SERVER_UPDATE recebido:", data);
      useVoiceStore.setState({ token: data.token, endpoint: data.endpoint });
      checkAndConnect();
    }
  });
}

function checkAndConnect() {
  const store = useVoiceStore.getState();
  
  // Só conectamos se tivermos todas as informações
  if (store.isConnecting && store.sessionId && store.token && store.endpoint && store.serverId) {
    console.log("[Voice] Iniciando Handshake com o Servidor de Voz:", store.endpoint);
    
    const accountStore = useAccountStore.getState();
    const account = accountStore.accounts.find(a => a.id === store.accountId);
    
    if (account) {
       console.log("[Voice] Chamando invoke start_voice_connection com userId:", account.user_id);
       invoke('start_voice_connection', {
         accountId: store.accountId,
         serverId: store.serverId,
         channelId: store.channelId,
         sessionId: store.sessionId,
         token: store.token,
         endpoint: store.endpoint,
         userId: account.user_id || account.id,
         inputDeviceId: store.inputDeviceId || null
       }).then(() => {
         console.log("[Voice] invoke start_voice_connection resolveu com sucesso!");
         useVoiceStore.setState({ isConnecting: false, isConnected: true });
       }).catch(err => {
         console.error("[Voice] Erro ao iniciar WS (Promise rejeitada):", err);
         useVoiceStore.setState({ isConnecting: false, isConnected: false });
       });
    } else {
       console.error("[Voice] Conta não encontrada para:", store.accountId);
    }
  }
}
