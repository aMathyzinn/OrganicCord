interface IncomingDmCallDecision {
  currentUserId: string | null | undefined;
  ringingUserIds: readonly string[];
  activeCallChannelId: string | null;
  channelId: string;
}

/**
 * A DM recipient is not proof that they initiated a call. Discord marks the
 * receiving account in `ringing`; outgoing calls can contain the same recipient.
 */
export function shouldShowIncomingDmCall({
  currentUserId,
  ringingUserIds,
  activeCallChannelId,
  channelId,
}: IncomingDmCallDecision): boolean {
  return Boolean(
    currentUserId
      && ringingUserIds.includes(currentUserId)
      && activeCallChannelId !== channelId,
  );
}
