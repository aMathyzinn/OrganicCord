import { invoke } from "@tauri-apps/api/core";
export { invoke };
import type {
  StoredAccount,
  AccountSession,
  DiscordGuild,
  DiscordChannel,
  DiscordMessage,
  DiscordDM,
  DiscordUser,
  DiscordRelationship,
  DiscordMember,
  DiscordPresence,
  DiscordUserProfile,
  DiscordInvite,
  DiscordForumThreadsResponse,
  DiscordThread,
  DiscordAuthSession,
  DiscordAuthSessionsResponse,
  DiscordMessageSearchResponse,
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

export const cancelDiscordLogin = () =>
  invoke<void>("cancel_discord_login");

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

export const removeRelationship = (accountId: string, userId: string) =>
  invoke<void>("remove_relationship", { accountId, userId });

export const blockUser = (accountId: string, userId: string) =>
  invoke<void>("block_user", { accountId, userId });

export const setUserNote = (accountId: string, userId: string, note: string) =>
  invoke<void>("set_user_note", { accountId, userId, note });

export const createChannelInvite = (accountId: string, channelId: string) =>
  invoke<DiscordInvite>("create_channel_invite", { accountId, channelId });

export const getGatewayPresences = (accountId: string) =>
  invoke<DiscordPresence[]>("get_gateway_presences", { accountId });

export const fetchUserProfile = (accountId: string, userId: string) =>
  invoke<DiscordUserProfile>("fetch_user_profile", { accountId, userId });

export const getChannels = (accountId: string, guildId: string) =>
  invoke<DiscordChannel[]>("get_channels", { accountId, guildId });

export const getCurrentGuildMember = (accountId: string, guildId: string) =>
  invoke<DiscordMember>("get_current_guild_member", { accountId, guildId });

export const getForumThreads = (accountId: string, channelId: string, guildId: string) =>
  invoke<DiscordForumThreadsResponse>("get_forum_threads", { accountId, channelId, guildId });

export const createForumPost = (
  accountId: string,
  channelId: string,
  title: string,
  content: string,
  appliedTags: string[]
) => invoke<DiscordThread>("create_forum_post", { accountId, channelId, title, content, appliedTags });

export const getRecentMentions = (accountId: string) =>
  invoke<DiscordMessage[]>("get_recent_mentions", { accountId });

export const getAuthSessions = (accountId: string) =>
  invoke<DiscordAuthSessionsResponse | DiscordAuthSession[]>("get_auth_sessions", { accountId });

export const revokeAuthSession = (accountId: string, sessionIdHash: string) =>
  invoke<void>("revoke_auth_session", { accountId, sessionIdHash });

export const searchMessages = (
  accountId: string,
  query: string,
  guildId?: string,
  channelId?: string
) => invoke<DiscordMessageSearchResponse>("search_messages", { accountId, query, guildId: guildId ?? null, channelId: channelId ?? null });


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

export const editMessage = (
  accountId: string,
  channelId: string,
  messageId: string,
  content: string
) => invoke<DiscordMessage>("edit_message", { accountId, channelId, messageId, content });

export const deleteMessage = (
  accountId: string,
  channelId: string,
  messageId: string
) => invoke<void>("delete_message", { accountId, channelId, messageId });

export const sendVoiceMessage = (
  accountId: string,
  channelId: string,
  audioData: number[],
  durationSecs: number,
  waveform: string,
  replyTo?: string
) =>
  invoke<DiscordMessage>("send_voice_message", {
    accountId,
    channelId,
    audioData,
    durationSecs,
    waveform,
    replyTo: replyTo ?? null,
  });

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
  fileHandle?: string,
  fileData?: Uint8Array
) => invoke<DiscordMessage>("send_message_with_attachment", {
  accountId,
  channelId,
  content,
  replyTo,
  fileName,
  fileHandle: fileHandle ?? null,
  fileData: fileData ? Array.from(fileData) : null
});

export interface SelectedAttachment {
  handle: string;
  name: string;
  size: number;
}

export const selectAttachment = () =>
  invoke<SelectedAttachment | null>("select_attachment");

export interface SelectedProfileImage {
  dataUrl: string;
}

export const selectProfileImage = () =>
  invoke<SelectedProfileImage | null>("select_profile_image");

export const getDMs = (accountId: string) =>
  invoke<DiscordDM[]>("get_dms", { accountId });

export const createDM = (accountId: string, recipientId: string) =>
  invoke<DiscordDM>("create_dm", { accountId, recipientId });

export const closeDM = (accountId: string, channelId: string) =>
  invoke<void>("close_dm", { accountId, channelId });

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

export interface UpdateProfileParams {
  global_name?: string | null;
  bio?: string | null;
  avatar?: string | null;
  banner?: string | null;
  accent_color?: number | null;
}

export const updateUserProfile = (accountId: string, payload: UpdateProfileParams) =>
  invoke<DiscordUser>("update_user_profile", { accountId, payload });

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

export const gatewaySetGameActivity = (
  accountId: string,
  game?: { name: string; startedAt: number } | null,
) =>
  invoke<void>("gateway_set_game_activity", {
    accountId,
    name: game?.name ?? null,
    startedAt: game?.startedAt ?? null,
  });

// --- Registered games / local activity detection ---

export interface RegisteredGame {
  id: string;
  executable: string;
  name: string;
  enabled: boolean;
}

export interface GameDetectionSettings {
  enabled: boolean;
  games: RegisteredGame[];
}

export interface DetectedGame {
  id: string;
  name: string;
  executable: string;
  processId: string;
  startedAt: number;
}

export const gameDetectionGetSettings = () =>
  invoke<GameDetectionSettings>("game_detection_get_settings");

export const gameDetectionSetEnabled = (enabled: boolean) =>
  invoke<GameDetectionSettings>("game_detection_set_enabled", { enabled });

export const gameDetectionUpdateGame = (game: RegisteredGame) =>
  invoke<GameDetectionSettings>("game_detection_update_game", { game });

export const gameDetectionRemoveGame = (gameId: string) =>
  invoke<GameDetectionSettings>("game_detection_remove_game", { gameId });

export const gameDetectionScan = () =>
  invoke<DetectedGame | null>("game_detection_scan");

// --- Official Discord desktop Rich Presence (local RPC) ---

export interface DiscordRpcSettings {
  enabled: boolean;
  applicationId: string;
}

export interface DiscordRpcStatus {
  connected: boolean;
  message: string;
}

export const discordRpcGetSettings = () =>
  invoke<DiscordRpcSettings>("discord_rpc_get_settings");

export const discordRpcUpdateSettings = (settings: DiscordRpcSettings) =>
  invoke<DiscordRpcSettings>("discord_rpc_update_settings", { settings });

export const discordRpcPublishGame = (game: { name: string; startedAt: number }) =>
  invoke<DiscordRpcStatus>("discord_rpc_publish_game", {
    name: game.name,
    startedAt: game.startedAt,
  });

export const discordRpcClearGame = () =>
  invoke<void>("discord_rpc_clear_game");

export const discordRpcTest = () =>
  invoke<DiscordRpcStatus>("discord_rpc_test");

// --- QR Login commands ---

export const startQrLogin = () => invoke<void>("start_qr_login");
export const cancelQrLogin = () => invoke<void>("cancel_qr_login");
