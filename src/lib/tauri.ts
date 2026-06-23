import { invoke } from "@tauri-apps/api/core";
import type {
  StoredAccount,
  AccountSession,
  DiscordGuild,
  DiscordChannel,
  DiscordMessage,
  DiscordDM,
  DiscordUser,
  DiscordRelationship,
} from "@/types";

// --- Account commands ---

export const addAccount = (token: string) =>
  invoke<{ account: StoredAccount }>("add_account", { payload: { token } });

export const removeAccount = (accountId: string) =>
  invoke<void>("remove_account", { accountId });

export const listAccounts = () =>
  invoke<StoredAccount[]>("list_accounts");

export const validateToken = (token: string) =>
  invoke<DiscordUser>("validate_token", { token });

export const startDiscordLogin = () =>
  invoke<void>("start_discord_login");

export const getAccountInfo = (accountId: string) =>
  invoke<DiscordUser>("get_account_info", { accountId });

// --- Session commands ---

export const connectAccount = (accountId: string) =>
  invoke<AccountSession>("connect_account", { payload: { account_id: accountId } });

export const disconnectAccount = (accountId: string) =>
  invoke<void>("disconnect_account", { accountId });

export const getSessionStatus = (accountId: string) =>
  invoke<{ account_id: string; status: string; connected_at: string | null }>(
    "get_session_status",
    { accountId }
  );

// --- Discord commands ---

export const getGuilds = (accountId: string) =>
  invoke<DiscordGuild[]>("get_guilds", { accountId });

export const getRelationships = (accountId: string) =>
  invoke<DiscordRelationship[]>("get_relationships", { accountId });

export const getGatewayPresences = (accountId: string) =>
  invoke<any[]>("get_gateway_presences", { accountId });

export const fetchUserProfile = (accountId: string, userId: string) =>
  invoke<any>("fetch_user_profile", { accountId, userId });

export const getChannels = (accountId: string, guildId: string) =>
  invoke<DiscordChannel[]>("get_channels", { accountId, guildId });

export const getForumThreads = (accountId: string, channelId: string, guildId: string) =>
  invoke<any>("get_forum_threads", { accountId, channelId, guildId });

export const searchMessages = (
  accountId: string,
  query: string,
  guildId?: string,
  channelId?: string
) => invoke<any>("search_messages", { accountId, query, guildId: guildId ?? null, channelId: channelId ?? null });


export const getMessages = (
  accountId: string,
  channelId: string,
  before?: string,
  after?: string
) => invoke<DiscordMessage[]>("get_messages", { accountId, channelId, before, after });

export const sendMessage = (
  accountId: string,
  channelId: string,
  content: string,
  replyTo?: string
) => invoke<DiscordMessage>("send_message", { accountId, channelId, content, replyTo });

export const sendInteraction = (
  accountId: string,
  applicationId: string,
  channelId: string,
  guildId: string | undefined,
  messageId: string,
  sessionId: string,
  customId: string,
  componentType: number,
  values?: string[]
) => invoke<void>("send_interaction", { 
  accountId, 
  applicationId, 
  channelId, 
  guildId, 
  messageId, 
  sessionId, 
  customId, 
  componentType, 
  values 
});

export const addReaction = (
  accountId: string,
  channelId: string,
  messageId: string,
  emoji: string
) => invoke<void>("discord_add_reaction", { accountId, channelId, messageId, emoji });

export const removeReaction = (
  accountId: string,
  channelId: string,
  messageId: string,
  emoji: string
) => invoke<void>("discord_remove_reaction", { accountId, channelId, messageId, emoji });

export const sendMessageWithAttachment = (
  accountId: string,
  channelId: string,
  content: string,
  replyTo: string | undefined,
  fileName: string,
  filePath?: string,
  fileData?: Uint8Array
) => invoke<DiscordMessage>("send_message_with_attachment", {
  accountId,
  channelId,
  content,
  replyTo,
  fileName,
  filePath: filePath ?? null,
  fileData: fileData ? Array.from(fileData) : null
});

export const getDMs = (accountId: string) =>
  invoke<DiscordDM[]>("get_dms", { accountId });

export const createDM = (accountId: string, recipientId: string) =>
  invoke<DiscordDM>("create_dm", { accountId, recipientId });

export const closeDM = (accountId: string, channelId: string) =>
  invoke<any>("close_dm", { accountId, channelId });

export const getPinnedMessages = (accountId: string, channelId: string) =>
  invoke<DiscordMessage[]>("get_pinned_messages", { accountId, channelId });

export const pinMessage = (accountId: string, channelId: string, messageId: string) =>
  invoke<void>("pin_message", { accountId, channelId, messageId });

export const unpinMessage = (accountId: string, channelId: string, messageId: string) =>
  invoke<void>("unpin_message", { accountId, channelId, messageId });

export const getUserInfo = (accountId: string) =>
  invoke<DiscordUser>("get_user_info", { accountId });

export const getSelfProfile = (accountId: string) =>
  invoke<DiscordUser>("get_self_profile", { accountId });

export const setStatus = (accountId: string, status: string) =>
  invoke<void>("set_status", { accountId, status });

export const subscribeGuild = (accountId: string, guildId: string) =>
  invoke<void>("discord_subscribe_guild", { accountId, guildId });

export interface CustomStatusParams {
  text: string;
  emojiName?: string;
  emojiId?: string;
  expiresAt?: string;
}

export const setCustomStatus = (accountId: string, params: CustomStatusParams) =>
  invoke<void>("set_custom_status", {
    accountId,
    text: params.text,
    emojiName: params.emojiName,
    emojiId: params.emojiId,
    expiresAt: params.expiresAt,
  });

export const clearCustomStatus = (accountId: string) =>
  invoke<void>("clear_custom_status", { accountId });

// --- Window commands ---

export const minimizeWindow = () => invoke<void>("minimize_window");
export const maximizeWindow = () => invoke<void>("maximize_window");
export const closeWindow = () => invoke<void>("close_window");

// --- Gateway / Presence commands ---

export const gatewayConnect = (accountId: string, status?: string) =>
  invoke<void>("gateway_connect", { accountId, status });

export const gatewaySetStatus = (accountId: string, status: string) =>
  invoke<void>("gateway_set_status", { accountId, status });

export const gatewaySetCustomActivity = (
  accountId: string,
  text?: string,
  emojiName?: string,
  emojiId?: string
) =>
  invoke<void>("gateway_set_custom_activity", {
    accountId,
    text: text ?? null,
    emojiName: emojiName ?? null,
    emojiId: emojiId ?? null,
  });

export const gatewayDisconnect = (accountId: string) =>
  invoke<void>("gateway_disconnect", { accountId });

export const gatewayGetStatus = (accountId: string) =>
  invoke<string | null>("gateway_get_status", { accountId });

// --- QR Login commands ---

export const startQrLogin = () => invoke<void>("start_qr_login");
export const cancelQrLogin = () => invoke<void>("cancel_qr_login");
