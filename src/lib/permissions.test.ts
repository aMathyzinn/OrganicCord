import { describe, expect, it } from "vitest";
import { ChannelType, type DiscordChannel, type DiscordGuild } from "@/types";
import { getChannelPermissions, PERMISSIONS } from "@/lib/permissions";

const GUILD_ID = "guild-1";

function guild(permissions: bigint, owner = false): DiscordGuild {
  return {
    id: GUILD_ID,
    name: "Guild",
    icon: null,
    owner,
    permissions: permissions.toString(),
  };
}

function channel(overwrites: DiscordChannel["permission_overwrites"] = []): DiscordChannel {
  return {
    id: "channel-1",
    name: "general",
    channel_type: ChannelType.GUILD_TEXT,
    position: 0,
    parent_id: null,
    topic: null,
    nsfw: false,
    permission_overwrites: overwrites,
  };
}

describe("getChannelPermissions", () => {
  it("allows direct messages without guild permission data", () => {
    expect(getChannelPermissions(null, null).canSend).toBe(true);
  });

  it("fails closed when guild data is missing or malformed", () => {
    expect(getChannelPermissions(GUILD_ID, null).canView).toBe(false);
    expect(getChannelPermissions(GUILD_ID, [{ ...guild(0n), permissions: "invalid" }]).canView).toBe(false);
  });

  it("grants all channel actions to owners and administrators", () => {
    const deniedChannel = channel([{
      id: GUILD_ID,
      overwrite_type: 0,
      allow: "0",
      deny: ((1n << 63n) - 1n).toString(),
    }]);

    expect(getChannelPermissions(GUILD_ID, [guild(0n, true)], false, { channel: deniedChannel }).isOwner).toBe(true);
    expect(getChannelPermissions(GUILD_ID, [guild(PERMISSIONS.ADMINISTRATOR)], false, { channel: deniedChannel }).isAdmin).toBe(true);
  });

  it("applies everyone, combined role and member overwrites in Discord order", () => {
    const base = PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.SEND_MESSAGES | PERMISSIONS.ATTACH_FILES;
    const target = channel([
      { id: GUILD_ID, overwrite_type: 0, allow: "0", deny: PERMISSIONS.SEND_MESSAGES.toString() },
      { id: "role-allow", overwrite_type: 0, allow: PERMISSIONS.SEND_MESSAGES.toString(), deny: "0" },
      { id: "role-deny", overwrite_type: 0, allow: "0", deny: PERMISSIONS.ATTACH_FILES.toString() },
      { id: "member-1", overwrite_type: 1, allow: PERMISSIONS.ATTACH_FILES.toString(), deny: PERMISSIONS.SEND_MESSAGES.toString() },
    ]);

    const effective = getChannelPermissions(GUILD_ID, [guild(base)], false, {
      channel: target,
      memberRoleIds: ["role-allow", "role-deny"],
      currentUserId: "member-1",
    });

    expect(effective.canView).toBe(true);
    expect(effective.canSend).toBe(false);
    expect(effective.canAttach).toBe(false);
  });

  it("combines all matching role overwrites before applying their result", () => {
    const base = PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.SEND_MESSAGES | PERMISSIONS.ATTACH_FILES;
    const target = channel([
      { id: "role-deny", overwrite_type: 0, allow: "0", deny: PERMISSIONS.ATTACH_FILES.toString() },
      { id: "role-allow", overwrite_type: 0, allow: PERMISSIONS.ATTACH_FILES.toString(), deny: "0" },
    ]);

    const effective = getChannelPermissions(GUILD_ID, [guild(base)], false, {
      channel: target,
      memberRoleIds: ["role-deny", "role-allow"],
    });

    expect(effective.canAttach).toBe(true);
  });

  it("uses the thread-specific send permission", () => {
    const base = PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.SEND_MESSAGES;
    expect(getChannelPermissions(GUILD_ID, [guild(base)], true).canSend).toBe(false);

    const withThreadSend = base | PERMISSIONS.SEND_MESSAGES_IN_THREADS;
    expect(getChannelPermissions(GUILD_ID, [guild(withThreadSend)], true).canSend).toBe(true);
  });

  it("fails closed when required role or member context is absent", () => {
    const base = PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.SEND_MESSAGES;
    const roleTarget = channel([
      { id: "role-1", overwrite_type: 0, allow: PERMISSIONS.SEND_MESSAGES.toString(), deny: "0" },
    ]);
    const memberTarget = channel([
      { id: "member-1", overwrite_type: 1, allow: PERMISSIONS.SEND_MESSAGES.toString(), deny: "0" },
    ]);

    expect(getChannelPermissions(GUILD_ID, [guild(base)], false, { channel: roleTarget }).canView).toBe(false);
    expect(getChannelPermissions(GUILD_ID, [guild(base)], false, { channel: memberTarget }).canView).toBe(false);
  });
});
