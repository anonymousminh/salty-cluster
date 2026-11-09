/**
 * Realtime presence + chat protocol, shared by the API hub (apps/api/src/presence.ts)
 * and the game client (apps/web/src/game/net).
 *
 * Transport: one WebSocket at REALTIME_PATH carrying JSON text frames.
 *   client → server: hello, pos, say, dm
 *   server → client: welcome, join, leave, snap, say, dm, err
 *
 * The first frame must be `hello` (the session id never appears in a URL or a log).
 * Everything here is ephemeral: the server keeps no chat history and no position history.
 */

export const REALTIME_PATH = '/api/realtime';

/** Public chat reaches players within this distance of the speaker (meters), like talking in a hall. */
export const CHAT_RADIUS = 15;
/** Players farther than this are not sent to you. */
export const INTEREST_RADIUS = 45;
/** At most this many other players are sent per snapshot (nearest first). */
export const INTEREST_MAX = 40;
/** Server → client snapshots per second. */
export const SNAPSHOT_HZ = 5;
/** Client → server position updates per second. */
export const POSITION_HZ = 10;
export const MAX_CHAT_LENGTH = 200;
/** A player can send this many messages in a burst, then one more every CHAT_REFILL_MS. */
export const CHAT_BURST = 5;
export const CHAT_REFILL_MS = 2000;
/** Unauthenticated sockets are closed after this long. */
export const HELLO_TIMEOUT_MS = 5000;

/** What a character is doing, for animation: standing, walking, running, in the air. */
export type MotionCode = 0 | 1 | 2 | 3;

/** Public identity of an online player. `pid` is a stable hash, never the session id. */
export interface PlayerRef {
  pid: string;
  name: string;
  /** Avatar color, `#rrggbb`. */
  color: string;
}

export type ClientMsg =
  | { t: 'hello'; session: string }
  | { t: 'pos'; x: number; z: number; h: number; m: MotionCode }
  | { t: 'say'; text: string }
  | { t: 'dm'; to: string; text: string };

/**
 * A player as the wire shows them. `n` is a small number the server assigns for the life of the
 * connection, used in snapshots instead of the 16-character `pid` to keep them compact.
 */
export interface WireRef extends PlayerRef {
  n: number;
}

/** One player in a snapshot: [n, x, z, heading°, motion] (x and z to 0.1 m). */
export type SnapPlayer = [n: number, x: number, z: number, h: number, m: MotionCode];

export type RealtimeErrorCode = 'rate_limited' | 'empty' | 'too_long' | 'unknown_player' | 'bad_message' | 'self' | 'replaced';

export type ServerMsg =
  | { t: 'welcome'; you: WireRef; roster: WireRef[]; chatRadius: number }
  | { t: 'join'; p: WireRef }
  | { t: 'leave'; pid: string }
  | { t: 'snap'; p: SnapPlayer[] }
  | { t: 'say'; id: string; from: string; name: string; text: string; at: number }
  | { t: 'dm'; id: string; from: string; to: string; name: string; text: string; at: number }
  | { t: 'err'; code: RealtimeErrorCode; message: string };

export type CleanChat = { ok: true; text: string } | { ok: false; code: 'empty' | 'too_long' | 'bad_message'; message: string };

/**
 * Normalise a chat message: must be a string, control characters removed, whitespace
 * collapsed, trimmed, 1..MAX_CHAT_LENGTH characters. Rendering must still escape it
 * (React does); this only removes characters that have no business in chat.
 */
export function cleanChatText(raw: unknown): CleanChat {
  if (typeof raw !== 'string') return { ok: false, code: 'bad_message', message: 'Messages are text.' };
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, code: 'empty', message: 'Say something first.' };
  if ([...text].length > MAX_CHAT_LENGTH) return { ok: false, code: 'too_long', message: `Keep it under ${MAX_CHAT_LENGTH} characters.` };
  return { ok: true, text };
}

export function motionFor(gait: number, airborne: boolean): MotionCode {
  if (airborne) return 3;
  if (gait < 0.1) return 0;
  return gait > 1.4 ? 2 : 1;
}
