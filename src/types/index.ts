// ============================================================
// Tipos principais do OrganicCord
// ============================================================

export type SessionStatus =
  | "Disconnected"
  | "Connecting"
  | "Connected"
  | { Error: string };

export interface StoredAccount {
  id: string;
  token_encrypted: string;
  username: string;
  discriminator: string;
  user_id: string;
  avatar: string | null;
  global_name?: string | null;
  banner?: string | null;
  accent_color?: number | null;
  bio?: string | null;
  premium_type?: number | null;
  added_at: string;
  last_used: string | null;
  color: string;
}

export interface AccountSession {
  account_id: string;
  user_id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  status: SessionStatus;
  connected_at: string | null;
  token_last_four: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface DiscordChannel {
  id: string;
  name: string | null;
  channel_type: ChannelType;
  position: number | null;
  parent_id: string | null;
  topic: string | null;
  nsfw: boolean | null;
  available_tags?: DiscordForumTag[];
  last_message_id?: string | null;
}

export interface DiscordForumTag {
  id: string;
  name: string;
  moderated: boolean;
  emoji_id: string | null;
  emoji_name: string | null;
}

export enum ChannelType {
  GUILD_TEXT = 0,
  DM = 1,
  GUILD_VOICE = 2,
  GROUP_DM = 3,
  GUILD_CATEGORY = 4,
  GUILD_ANNOUNCEMENT = 5,
  GUILD_PUBLIC_THREAD = 11,
  GUILD_STAGE_VOICE = 13,
  GUILD_FORUM = 15,
}

export interface DiscordThreadMetadata {
  archived: boolean;
  auto_archive_duration: number;
  archive_timestamp: string;
  locked: boolean;
  invitable?: boolean;
  create_timestamp?: string | null;
}

export interface DiscordThread extends DiscordChannel {
  message_count: number;
  member_count: number;
  owner_id: string;
  total_message_sent?: number;
  applied_tags?: string[];
  thread_metadata?: DiscordThreadMetadata;
  last_message_id?: string | null;
  message?: DiscordMessage; // Starter message
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot?: boolean;
  global_name?: string | null;
  bio?: string | null;
  banner?: string | null;
  accent_color?: number | null;
  avatar_decoration_data?: { asset: string; sku_id: string } | null;
  premium_type?: number | null;
  premium_since?: string | null;
}

export interface DiscordRelationship {
  id: string;
  relationship_type: number;
  user: DiscordUser;
  nickname: string | null;
}

export interface DiscordActivity {
  id?: string;
  name: string;
  type: number;
  state?: string;
  details?: string;
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  timestamps?: {
    start?: number;
    end?: number;
  };
  application_id?: string;
}

export interface DiscordPresence {
  user: { id: string; username?: string; discriminator?: string; avatar?: string | null };
  status: string;
  activities: DiscordActivity[];
  client_status: {
    desktop?: string;
    mobile?: string;
    web?: string;
  };
}

export interface DiscordMessage {
  id: string;
  channel_id?: string;
  guild_id?: string;
  content: string;
  author: DiscordUser;
  timestamp: string;
  edited_timestamp: string | null;
  attachments: Attachment[];
  embeds: Embed[];
  reactions?: Reaction[];
  referenced_message?: DiscordMessage | null;
  pinned?: boolean;
  type?: number;
  call?: {
    participants: string[];
    ended_timestamp?: string | null;
  };
  poll?: DiscordPoll;
  components?: Record<string, unknown>[];
  flags?: number;
}

export interface Attachment {
  id: string;
  filename: string;
  size: number;
  url: string;
  proxy_url: string;
  content_type?: string;
  width?: number;
  height?: number;
  duration_secs?: number;
  waveform?: string;
}

export interface Embed {
  title?: string;
  type?: string;
  description?: string;
  url?: string;
  color?: number;
  thumbnail?: { url: string; width?: number; height?: number };
  image?: { url: string; width?: number; height?: number };
  video?: { url?: string; width?: number; height?: number };
  provider?: { name: string; url?: string };
  footer?: { text: string; icon_url?: string };
  author?: { name: string; url?: string; icon_url?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
}

export interface Reaction {
  count: number;
  me: boolean;
  emoji: { id: string | null; name: string };
}

export interface DiscordDM {
  id: string;
  channel_type: ChannelType;
  recipients: DiscordUser[];
  last_message_id: string | null;
}

// Estado de navegação da UI
export interface NavigationState {
  activeAccountId: string | null;
  activeGuildId: string | null;
  activeChannelId: string | null;
  view: "guilds" | "dms" | "settings";
  focusedImage: string | null;
}

// Notificação interna
export interface AppNotification {
  id: string;
  accountId: string;
  channelId: string;
  guildId?: string;
  message: string;
  timestamp: string;
  read: boolean;
}


export interface DiscordPollAnswer {
  answer_id: number;
  poll_media: {
    text?: string;
    emoji?: {
      id: string | null;
      name: string;
    };
  };
}

export interface DiscordPollResult {
  answer_counts: { id: number; count: number; me_voted: boolean }[];
  is_finalized: boolean;
}

export interface DiscordPoll {
  question: { text: string };
  answers: DiscordPollAnswer[];
  expiry: string;
  allow_multiselect: boolean;
  layout_type: number;
  results?: DiscordPollResult;
}

export type UserStatus = "online" | "idle" | "dnd" | "invisible";

export interface DiscordEmoji {
  id: string | null;
  name: string | null;
  roles?: string[];
  user?: DiscordUser;
  require_colons?: boolean;
  managed?: boolean;
  animated?: boolean;
  available?: boolean;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  icon?: string | null;
  unicode_emoji?: string | null;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
}

export interface DiscordMember {
  user?: DiscordUser;
  nick?: string | null;
  avatar?: string | null;
  roles: string[];
  joined_at: string;
  premium_since?: string | null;
  deaf: boolean;
  mute: boolean;
  pending?: boolean;
  permissions?: string;
  communication_disabled_until?: string | null;
}
