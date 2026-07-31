/**
 * Client-side rate limiting utilities for Discord API calls.
 *
 * These work in tandem with server-side rate limiting in Rust to provide
 * two layers of protection. The client-side layer prevents even sending
 * requests that would hit rate limits, while the server-side layer
 * handles any edge cases with the actual Retry-After headers.
 */

/**
 * A simple per-key throttle tracker.
 * Ensures at most `limit` calls every `windowMs` milliseconds.
 */
class ChannelRateLimiter {
  private windows: Map<string, number[]> = new Map();

  /**
   * Returns true if the action is allowed, false if it should be blocked.
   * Automatically records this attempt if allowed.
   */
  canProceed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = this.windows.get(key) || [];

    // Remove timestamps outside the window
    const relevant = timestamps.filter(t => now - t < windowMs);

    if (relevant.length >= limit) {
      this.windows.set(key, relevant);
      return false;
    }

    relevant.push(now);
    this.windows.set(key, relevant);
    return true;
  }

  /**
   * Returns milliseconds to wait before next allowed call.
   * Returns 0 if the action is already allowed.
   */
  msUntilAllowed(key: string, limit: number, windowMs: number): number {
    const now = Date.now();
    const timestamps = this.windows.get(key) || [];
    const relevant = timestamps.filter(t => now - t < windowMs);

    if (relevant.length < limit) return 0;

    // The oldest timestamp in the window determines when the window slides
    const oldest = relevant.sort((a, b) => a - b)[0];
    return Math.max(0, windowMs - (now - oldest));
  }

  clear(key: string) {
    this.windows.delete(key);
  }
}

// Singleton instance
export const clientRateLimiter = new ChannelRateLimiter();

// Discord-accurate client-side limits (conservative — server-side is stricter)
export const CLIENT_LIMITS = {
  /** Max 5 messages per 5s per channel */
  MESSAGE_SEND: { limit: 5, windowMs: 5000 },
  /** Max 5 edits per 5s per channel */
  MESSAGE_EDIT: { limit: 5, windowMs: 5000 },
  /** Max 4 deletes per 2s per channel */
  MESSAGE_DELETE: { limit: 4, windowMs: 2000 },
  /** Typing indicator: 1 per 8s per channel */
  TYPING: { limit: 1, windowMs: 8000 },
  /** Reactions: 3 per second per message */
  REACTION: { limit: 3, windowMs: 1000 },
  /** DM create: 5 per 5s */
  DM_CREATE: { limit: 5, windowMs: 5000 },
} as const;

/**
 * Creates a debounced function that delays invoking `fn` until after
 * `delayMs` milliseconds have passed since the last call.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delayMs);
  };
}

/**
 * Creates a throttled function that fires at most once per `intervalMs`.
 * Returns the last call's arguments when it fires.
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  intervalMs: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = intervalMs - (now - lastCall);

    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      lastCall = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };
}

/**
 * Check if sending a message to a channel would exceed rate limits.
 * Returns an error message if blocked, or null if allowed.
 */
export function checkMessageSendLimit(channelId: string): string | null {
  const { limit, windowMs } = CLIENT_LIMITS.MESSAGE_SEND;
  if (!clientRateLimiter.canProceed(`msg:${channelId}`, limit, windowMs)) {
    const ms = clientRateLimiter.msUntilAllowed(`msg:${channelId}`, limit, windowMs);
    return `Você está enviando mensagens muito rápido. Aguarde ${Math.ceil(ms / 1000)}s.`;
  }
  return null;
}

/**
 * Check if deleting a message would exceed rate limits.
 */
export function checkMessageDeleteLimit(channelId: string): string | null {
  const { limit, windowMs } = CLIENT_LIMITS.MESSAGE_DELETE;
  if (!clientRateLimiter.canProceed(`del:${channelId}`, limit, windowMs)) {
    const ms = clientRateLimiter.msUntilAllowed(`del:${channelId}`, limit, windowMs);
    return `Muitas deleções. Aguarde ${Math.ceil(ms / 1000)}s.`;
  }
  return null;
}

/**
 * Check if a reaction would exceed rate limits.
 */
export function checkReactionLimit(messageId: string): string | null {
  const { limit, windowMs } = CLIENT_LIMITS.REACTION;
  if (!clientRateLimiter.canProceed(`rxn:${messageId}`, limit, windowMs)) {
    return `Muitas reações. Aguarde um momento.`;
  }
  return null;
}
