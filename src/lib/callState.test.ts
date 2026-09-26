import { describe, expect, it } from "vitest";
import { shouldShowIncomingDmCall } from "./callState";

describe("shouldShowIncomingDmCall", () => {
  const channelId = "dm-channel";

  it("shows an incoming prompt when the local account is ringing", () => {
    expect(shouldShowIncomingDmCall({
      currentUserId: "user-local",
      ringingUserIds: ["user-local"],
      activeCallChannelId: null,
      channelId,
    })).toBe(true);
  });

  it("does not treat an outgoing call's recipient as the caller", () => {
    expect(shouldShowIncomingDmCall({
      currentUserId: "user-local",
      ringingUserIds: ["user-remote"],
      activeCallChannelId: channelId,
      channelId,
    })).toBe(false);
  });

  it("does not show an incoming prompt over an active call in the same DM", () => {
    expect(shouldShowIncomingDmCall({
      currentUserId: "user-local",
      ringingUserIds: ["user-local"],
      activeCallChannelId: channelId,
      channelId,
    })).toBe(false);
  });
});
