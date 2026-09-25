import { isPermissionGranted, requestPermission, sendNotification, onAction } from "@tauri-apps/plugin-notification";
import { invoke } from "@tauri-apps/api/core";
import { useDiscordStore } from "@/stores/discordStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { toast } from "@/components/ui/Toast";
import { useSettingsStore } from "@/stores/settingsStore";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import type { DiscordMessage } from "@/types";

interface NotificationNavigation {
  accountId: string;
  guildId?: string | null;
  channelId: string;
}

function isNotificationNavigation(value: unknown): value is NotificationNavigation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.accountId === "string" && typeof candidate.channelId === "string";
}

export async function initNotificationSystem() {
  if (!useSettingsStore.getState().settings.desktopNotifications) return;
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
  } catch (e) {
    console.warn("[Notifications] Permission check error:", e);
  }

  // Registra o ouvinte de clique nas notificações do sistema operacional
  try {
    await onAction((notificationOptions) => {
      const extra = notificationOptions.extra;
      if (isNotificationNavigation(extra)) {
        const { accountId, guildId, channelId } = extra;
          // Foca a janela do aplicativo no OS
          invoke("focus_window").catch(() => {});

          // Navega para a conta, servidor e canal correspondentes
          const nav = useNavigationStore.getState();
          nav.setActiveAccount(accountId);
          if (guildId) {
            nav.setActiveGuild(guildId);
            nav.setView("guilds");
          } else {
            nav.setActiveGuild(null);
            nav.setView("dms");
          }
          nav.setActiveChannel(channelId);
      }
    });
  } catch (e) {
    console.warn("[Notifications] Erro ao registrar ouvinte de ação:", e);
  }
}

export function triggerDesktopNotification(account_id: string, message: DiscordMessage, hasMention: boolean) {
  const settings = useSettingsStore.getState().settings;
  const store = useDiscordStore.getState();
  const authorName = message.author?.global_name || message.author?.username || "Alguém";
  
  // Nome do Servidor
  let guildName = "";
  if (message.guild_id) {
    const guilds = store.cache.guilds[account_id] || [];
    const guild = guilds.find((g) => g.id === message.guild_id);
    guildName = guild?.name || "Servidor";
  }

  // Nome do Canal ou DM
  let channelName = "";
  if (message.guild_id) {
    const channels = store.cache.channels[account_id]?.[message.guild_id] || [];
    const channel = channels.find((c) => c.id === message.channel_id);
    channelName = channel?.name ? `#${channel.name}` : "canal";
  } else {
    const dms = store.cache.dms[account_id] || [];
    const dm = dms.find((d) => d.id === message.channel_id);
    const recipient = dm?.recipients?.[0];
    channelName = recipient ? `@${recipient.global_name || recipient.username}` : "Mensagem Direta";
  }

  // Título da notificação
  let title = "";
  if (message.guild_id) {
    title = `${authorName} (${guildName} › ${channelName})`;
  } else {
    title = `${authorName} (${channelName})`;
  }

  if (hasMention) {
    title = `💬 Mencionou você: ${title}`;
  }

  // Formatação do conteúdo da mensagem
  let rawContent = message.content || "";
  // Limpa tags internas de emoji do discord: <:nome:id> -> :nome:
  rawContent = rawContent.replace(/<a?:([a-zA-Z0-9_]+):[0-9]+>/g, ":$1:");

  let body = rawContent.trim();
  if (!body && message.attachments?.length) {
    const isImage = message.attachments.some((attachment) => attachment.content_type?.startsWith("image/"));
    body = isImage ? "[Imagem enviada]" : "[Arquivo enviado]";
  } else if (!body) {
    body = "[Mensagem sem texto]";
  }

  if (body.length > 120) {
    body = body.substring(0, 117) + "...";
  }

  // Dispara notificação nativa da área de trabalho
  if (settings.desktopNotifications) {
    try {
      sendNotification({
        title,
        body,
        icon: "32x32",
        extra: {
          accountId: account_id,
          guildId: message.guild_id || null,
          channelId: message.channel_id,
          messageId: message.id,
        },
      });
    } catch (e) {
      console.error("[Notifications] Erro ao enviar notificação de desktop:", e);
    }
  }

  if (settings.flashTaskbar && !document.hasFocus()) {
    void getCurrentWindow().requestUserAttention(UserAttentionType.Informational).catch((error) => {
      console.warn("[Notifications] Não foi possível solicitar atenção:", error);
    });
  }

  // Toast in-app caso o usuário esteja com o app aberto e focado e receba uma menção
  if (hasMention && document.hasFocus()) {
    toast.info(`Mencionou você em ${channelName}: "${body}"`);
  }
}
