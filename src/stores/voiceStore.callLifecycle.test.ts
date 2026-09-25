import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriMocks.listen,
}));

const soundMocks = vi.hoisted(() => ({
  playIncomingRing: vi.fn(),
  stopIncomingRing: vi.fn(),
  playOutgoingRing: vi.fn(),
  stopOutgoingRing: vi.fn(),
  playUserJoined: vi.fn(),
  playUserLeft: vi.fn(),
  playMute: vi.fn(),
  playUnmute: vi.fn(),
  playDeafen: vi.fn(),
  playUndeafen: vi.fn(),
}));

vi.mock("@/lib/soundService", () => ({
  soundService: soundMocks,
}));

import { useVoiceStore } from "./voiceStore";
import { useAccountStore } from "./accountStore";

describe("voiceStore call lifecycle & ringing UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.invoke.mockResolvedValue("attempt-123");

    useAccountStore.setState({
      accounts: [
        {
          id: "account-1",
          user_id: "user-local",
          username: "amathyzin",
          discriminator: "0",
          avatar: null,
          banner: null,
          accent_color: null,
          added_at: "2026-09-25T00:00:00.000Z",
          last_used: null,
          color: "#5865f2",
        },
      ],
    });

    useVoiceStore.setState({
      isConnecting: false,
      isConnected: false,
      isEncrypted: false,
      connectionStage: "Desconectado",
      attemptId: null,
      accountId: null,
      channelId: null,
      guildId: null,
      speakingUsers: new Set<string>(),
      voiceParticipants: new Set<string>(),
      ringingUsers: new Set<string>(),
      incomingCall: null,
    });
  });

  it("initiates outgoing DM call with outgoing ring and only local participant initially", async () => {
    await useVoiceStore.getState().joinCall("account-1", null, "channel-dm-1");

    const state = useVoiceStore.getState();
    expect(state.channelId).toBe("channel-dm-1");
    expect(state.voiceParticipants.has("user-local")).toBe(true);
    expect(state.voiceParticipants.size).toBe(1);
    expect(soundMocks.playOutgoingRing).toHaveBeenCalledTimes(1);
    expect(tauriMocks.invoke).toHaveBeenCalledWith("start_dm_call", {
      accountId: "account-1",
      channelId: "channel-dm-1",
    });
  });

  it("adds recipient and stops outgoing ring when recipient answers via setVoiceParticipant", async () => {
    await useVoiceStore.getState().joinCall("account-1", null, "channel-dm-1");

    // Simula resposta do destinatário
    useVoiceStore.getState().setVoiceParticipant("user-remote", true);

    const state = useVoiceStore.getState();
    expect(state.voiceParticipants.has("user-remote")).toBe(true);
    expect(state.voiceParticipants.size).toBe(2);
    expect(soundMocks.stopOutgoingRing).toHaveBeenCalledTimes(1);
    expect(soundMocks.playUserJoined).toHaveBeenCalledTimes(1);
  });

  it("synchronizes participants and stops ring on CALL_UPDATE", async () => {
    await useVoiceStore.getState().joinCall("account-1", null, "channel-dm-1");

    useVoiceStore.getState().handleCallUpdate(
      "channel-dm-1",
      [{ user_id: "user-local" }, { user_id: "user-remote" }],
      []
    );

    const state = useVoiceStore.getState();
    expect(state.voiceParticipants.has("user-remote")).toBe(true);
    expect(soundMocks.stopOutgoingRing).toHaveBeenCalled();
    expect(soundMocks.playUserJoined).toHaveBeenCalled();
  });

  it("terminates call and plays user left sound if recipient rejects the call (empty ringing and no participants)", async () => {
    await useVoiceStore.getState().joinCall("account-1", null, "channel-dm-1");
    useVoiceStore.setState({ isConnected: true, ringingUsers: new Set(["user-remote"]) });

    useVoiceStore.getState().handleCallUpdate(
      "channel-dm-1",
      [{ user_id: "user-local" }],
      []
    );

    await vi.waitFor(() => {
      expect(useVoiceStore.getState().isConnected).toBe(false);
    });

    expect(soundMocks.stopOutgoingRing).toHaveBeenCalled();
    expect(soundMocks.playUserLeft).toHaveBeenCalled();
  });

  it("accepts incoming call without initiating outgoing ring or start_dm_call", async () => {
    useVoiceStore.setState({
      incomingCall: {
        accountId: "account-1",
        channelId: "channel-dm-2",
        callerId: "user-remote",
        timestamp: Date.now(),
      },
    });

    await useVoiceStore.getState().acceptIncomingCall();

    const state = useVoiceStore.getState();
    expect(state.channelId).toBe("channel-dm-2");
    expect(state.voiceParticipants.has("user-local")).toBe(true);
    expect(state.voiceParticipants.has("user-remote")).toBe(true);
    expect(soundMocks.playOutgoingRing).not.toHaveBeenCalled();
    expect(tauriMocks.invoke).not.toHaveBeenCalledWith("start_dm_call", expect.anything());
  });
});
