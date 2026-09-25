import type { DiscordChannel, DiscordGuild } from "@/types";

export const PERMISSIONS = {
  ADMINISTRATOR: 1n << 3n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
} as const;

export interface ChannelPermissions {
  canView: boolean;
  canSend: boolean;
  canAttach: boolean;
  canReact: boolean;
  canConnect: boolean;
  isOwner: boolean;
  isAdmin: boolean;
}

export interface PermissionContext {
  channel?: DiscordChannel | null;
  memberRoleIds?: string[];
  currentUserId?: string | null;
}

const DENIED: ChannelPermissions = {
  canView: false,
  canSend: false,
  canAttach: false,
  canReact: false,
  canConnect: false,
  isOwner: false,
  isAdmin: false,
};

const ALLOWED: ChannelPermissions = {
  canView: true,
  canSend: true,
  canAttach: true,
  canReact: true,
  canConnect: true,
  isOwner: false,
  isAdmin: false,
};

function parseBitfield(value: string | undefined): bigint | null {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function applyOverwrite(permissions: bigint, allow: string, deny: string): bigint | null {
  const allowBits = parseBitfield(allow);
  const denyBits = parseBitfield(deny);
  if (allowBits === null || denyBits === null) return null;
  return (permissions & ~denyBits) | allowBits;
}

/**
 * Computes effective channel permissions in Discord's documented overwrite
 * order: @everyone, combined roles, then the member-specific overwrite.
 * Missing guild data fails closed so the UI never advertises an unsafe action.
 */
export function getChannelPermissions(
  guildId?: string | null,
  guilds?: DiscordGuild[] | null,
  isThread = false,
  context: PermissionContext = {}
): ChannelPermissions {
  if (!guildId) return { ...ALLOWED };

  const guild = guilds?.find((item) => item.id === guildId);
  if (!guild) return { ...DENIED };

  if (guild.owner) {
    return { ...ALLOWED, isOwner: true, isAdmin: true };
  }

  let permissions = parseBitfield(guild.permissions);
  if (permissions === null) return { ...DENIED };

  if ((permissions & PERMISSIONS.ADMINISTRATOR) !== 0n) {
    return { ...ALLOWED, isAdmin: true };
  }

  const overwrites = context.channel?.permission_overwrites ?? [];
  const everyone = overwrites.find(
    (overwrite) => overwrite.overwrite_type === 0 && overwrite.id === guildId
  );
  if (everyone) {
    permissions = applyOverwrite(permissions, everyone.allow, everyone.deny);
    if (permissions === null) return { ...DENIED };
  }

  const roleOverwrites = overwrites.filter(
    (overwrite) => overwrite.overwrite_type === 0 && overwrite.id !== guildId
  );
  if (roleOverwrites.length > 0 && !context.memberRoleIds) {
    return { ...DENIED };
  }

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const overwrite of roleOverwrites) {
    if (!context.memberRoleIds?.includes(overwrite.id)) continue;
    const allow = parseBitfield(overwrite.allow);
    const deny = parseBitfield(overwrite.deny);
    if (allow === null || deny === null) return { ...DENIED };
    roleAllow |= allow;
    roleDeny |= deny;
  }
  permissions = (permissions & ~roleDeny) | roleAllow;

  const memberOverwrites = overwrites.filter(
    (overwrite) => overwrite.overwrite_type === 1
  );
  if (memberOverwrites.length > 0 && !context.currentUserId) {
    return { ...DENIED };
  }
  const member = memberOverwrites.find(
    (overwrite) => overwrite.id === context.currentUserId
  );
  if (member) {
    permissions = applyOverwrite(permissions, member.allow, member.deny);
    if (permissions === null) return { ...DENIED };
  }

  const canView = (permissions & PERMISSIONS.VIEW_CHANNEL) !== 0n;
  const sendPermission = isThread
    ? PERMISSIONS.SEND_MESSAGES_IN_THREADS
    : PERMISSIONS.SEND_MESSAGES;
  const canSend = canView && (permissions & sendPermission) !== 0n;

  return {
    canView,
    canSend,
    canAttach: canSend && (permissions & PERMISSIONS.ATTACH_FILES) !== 0n,
    canReact: canView && (permissions & PERMISSIONS.ADD_REACTIONS) !== 0n,
    canConnect: canView && (permissions & PERMISSIONS.CONNECT) !== 0n,
    isOwner: false,
    isAdmin: false,
  };
}

export function canUserAttachFiles(
  guildId?: string | null,
  guilds?: DiscordGuild[] | null,
  context?: PermissionContext
): boolean {
  return getChannelPermissions(guildId, guilds, false, context).canAttach;
}

export function canUserSendMessages(
  guildId?: string | null,
  guilds?: DiscordGuild[] | null,
  isThread = false,
  context?: PermissionContext
): boolean {
  return getChannelPermissions(guildId, guilds, isThread, context).canSend;
}

export function canUserViewChannel(
  guildId?: string | null,
  guilds?: DiscordGuild[] | null,
  context?: PermissionContext
): boolean {
  return getChannelPermissions(guildId, guilds, false, context).canView;
}
