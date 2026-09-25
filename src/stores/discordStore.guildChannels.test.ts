import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelType, type DiscordChannel, type DiscordGatewayGuild } from "@/types";

const apiMocks = vi.hoisted(() => ({
  getChannels: vi.fn(),
  getCurrentGuildMember: vi.fn(),
  subscribeGuild: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/lib/tauri", () => apiMocks);

import { useDiscordStore } from "@/stores/discordStore";

function channel(id: string): DiscordChannel {
  return {
    id,
    name: id,
    channel_type: ChannelType.GUILD_TEXT,
    position: 0,
    parent_id: null,
    topic: null,
    nsfw: false,
  };
}

function gatewayGuild(guildId: string, channels: DiscordChannel[]): DiscordGatewayGuild {
  return {
    id: guildId,
    name: guildId,
    icon: null,
    owner: false,
    permissions: "0",
    channels,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => { resolve = resolver; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getCurrentGuildMember.mockResolvedValue(null);
  apiMocks.subscribeGuild.mockResolvedValue(undefined);
  apiMocks.invoke.mockResolvedValue({});
  useDiscordStore.setState({
    cache: {
      guilds: {},
      channels: {},
      messages: {},
      dms: {},
      guildEmojis: {},
      guildRoles: {},
      guildMembers: {},
      session_ids: {},
      relationships: {},
      presences: {},
      threads: {},
      pinnedMessages: {},
      unreads: {},
      typingUsers: {},
    },
    loading: { guilds: {}, messages: {}, threads: {} },
    channelLoads: {},
    errors: {},
  });
});

describe("guild channel hydration", () => {
  it("isolates the same guild between different accounts", async () => {
    apiMocks.getChannels.mockImplementation(async (accountId: string) => [channel(`${accountId}-general`)]);

    await Promise.all([
      useDiscordStore.getState().fetchChannels("account-a", "guild-shared"),
      useDiscordStore.getState().fetchChannels("account-b", "guild-shared"),
    ]);

    expect(useDiscordStore.getState().cache.channels["account-a"]["guild-shared"][0].id)
      .toBe("account-a-general");
    expect(useDiscordStore.getState().cache.channels["account-b"]["guild-shared"][0].id)
      .toBe("account-b-general");
  });

  it("allows an empty first response to be retried", async () => {
    apiMocks.getChannels
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([channel("general")]);

    await useDiscordStore.getState().fetchChannels("account", "guild");
    expect(useDiscordStore.getState().channelLoads.account.guild.status).toBe("empty");

    await useDiscordStore.getState().fetchChannels("account", "guild");
    expect(useDiscordStore.getState().channelLoads.account.guild.status).toBe("ready");
    expect(useDiscordStore.getState().cache.channels.account.guild).toEqual([channel("general")]);
  });

  it("does not let an obsolete response overwrite a newer selection request", async () => {
    const oldResponse = deferred<DiscordChannel[]>();
    apiMocks.getChannels
      .mockReturnValueOnce(oldResponse.promise)
      .mockResolvedValueOnce([channel("new")]);

    const first = useDiscordStore.getState().fetchChannels("account", "guild");
    const second = useDiscordStore.getState().fetchChannels("account", "guild", true);
    await second;
    oldResponse.resolve([channel("old")]);
    await first;

    expect(useDiscordStore.getState().cache.channels.account.guild).toEqual([channel("new")]);
  });

  it("keeps Gateway channels when REST temporarily returns an empty list", async () => {
    useDiscordStore.getState().hydrateGuildFromGateway(
      "account",
      gatewayGuild("guild", [channel("gateway-channel")]),
    );
    apiMocks.getChannels.mockResolvedValueOnce([]);

    await useDiscordStore.getState().fetchChannels("account", "guild");

    expect(useDiscordStore.getState().cache.channels.account.guild)
      .toEqual([channel("gateway-channel")]);
    expect(useDiscordStore.getState().channelLoads.account.guild.status).toBe("ready");
  });

  it("normalizes the Gateway channel type field", () => {
    const rawGatewayGuild = {
      ...gatewayGuild("guild", []),
      channels: [{
        id: "gateway-raw",
        name: "general",
        type: ChannelType.GUILD_TEXT,
        position: 0,
        parent_id: null,
        topic: null,
        nsfw: false,
      }],
    } as unknown as DiscordGatewayGuild;

    useDiscordStore.getState().hydrateGuildFromGateway("account", rawGatewayGuild);

    expect(useDiscordStore.getState().cache.channels.account.guild[0]).toMatchObject({
      id: "gateway-raw",
      channel_type: ChannelType.GUILD_TEXT,
    });
  });

  it("keeps a failed load recoverable and clears the error after retry", async () => {
    apiMocks.getChannels
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce([channel("general")]);

    await useDiscordStore.getState().fetchChannels("account", "guild");
    expect(useDiscordStore.getState().channelLoads.account.guild.status).toBe("error");
    expect(useDiscordStore.getState().errors["channels-account-guild"]).toContain("network unavailable");

    await useDiscordStore.getState().fetchChannels("account", "guild");
    expect(useDiscordStore.getState().channelLoads.account.guild.status).toBe("ready");
    expect(useDiscordStore.getState().errors["channels-account-guild"]).toBeUndefined();
  });

  it("applies incremental Gateway channel updates without replacing the guild cache", () => {
    useDiscordStore.getState().hydrateGuildFromGateway(
      "account",
      gatewayGuild("guild", [channel("general")]),
    );

    useDiscordStore.getState().applyGuildChannelEvent(
      "account",
      "guild",
      { ...channel("announcements"), position: 1 },
      false,
    );
    useDiscordStore.getState().applyGuildChannelEvent(
      "account",
      "guild",
      channel("general"),
      true,
    );

    expect(useDiscordStore.getState().cache.channels.account.guild.map((item) => item.id))
      .toEqual(["announcements"]);
  });
});
