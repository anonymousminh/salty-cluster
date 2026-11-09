import {
  CHAT_BURST,
  CHAT_RADIUS,
  CHAT_REFILL_MS,
  INTEREST_MAX,
  INTEREST_RADIUS,
  WORLD,
  cleanChatText,
  type MotionCode,
  type PlayerRef,
  type RealtimeErrorCode,
  type ServerMsg,
  type SnapPlayer,
  type WireRef,
} from '@meetspace/venue';

/** One end of a player's connection. The WebSocket layer implements this; tests use a fake. */
export interface Conn {
  send(msg: ServerMsg): void;
  close(code: number, reason: string): void;
}

interface Online {
  ref: WireRef;
  conn: Conn;
  x: number;
  z: number;
  h: number;
  m: MotionCode;
  lastPosAt: number;
  tokens: number;
  tokensAt: number;
  /** Last snapshot was empty, so an empty one is not worth sending again. */
  sentEmpty: boolean;
}

/** Positions are clamped to the park plus a small margin. */
const BOUND = Math.max(WORLD.size[0], WORLD.size[1]) / 2 + 2;
/** Position updates faster than this are ignored (the client sends 10 Hz; 25 Hz is the ceiling). */
const MIN_POS_INTERVAL_MS = 40;

/** Positions go out to 0.1 m: invisible on screen, and it keeps snapshots small. */
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lim: number) => Math.max(-lim, Math.min(lim, n));
const motion = (m: unknown): MotionCode => (m === 1 || m === 2 || m === 3 ? m : 0);

/**
 * In-memory presence and chat for one event. Ephemeral by design: no persistence, no history.
 * Single process: every player must connect to the same hub (see docs, "Realtime deployment").
 *
 *  - snapshots: each player receives the nearest INTEREST_MAX others within INTEREST_RADIUS
 *  - chat: public messages reach players within CHAT_RADIUS of the speaker; DMs go to one player
 *  - abuse limits: token bucket per player, cleaned and length-limited text, clamped positions
 */
export class PresenceHub {
  private players = new Map<string, Online>();
  private seq = 0;
  private nextN = 1;
  /** Duration of the last tick, for metrics. */
  lastTickMs = 0;

  constructor(
    private now: () => number = Date.now,
    private hooks: { onReject?: (code: RealtimeErrorCode) => void } = {},
  ) {}

  get size(): number {
    return this.players.size;
  }

  roster(): WireRef[] {
    return [...this.players.values()].map((p) => p.ref);
  }

  has(pid: string): boolean {
    return this.players.has(pid);
  }

  /** Add a player (or replace their previous connection, e.g. after a tab refresh). */
  join(ref: PlayerRef, conn: Conn): void {
    const old = this.players.get(ref.pid);
    if (old) {
      this.players.delete(ref.pid);
      old.conn.close(4002, 'replaced by a newer connection');
    }
    const t = this.now();
    // A reconnecting player keeps their number, so neighbours' snapshots stay consistent.
    const wire: WireRef = { ...ref, n: old?.ref.n ?? this.nextN++ };
    const online: Online = {
      ref: wire,
      conn,
      x: WORLD.spawn.at[0],
      z: WORLD.spawn.at[1],
      h: 0,
      m: 0,
      lastPosAt: 0,
      tokens: CHAT_BURST,
      tokensAt: t,
      sentEmpty: false,
    };
    // Tell the newcomer who is here, then tell everyone else about them.
    this.safeSend(online, { t: 'welcome', you: wire, roster: this.roster(), chatRadius: CHAT_RADIUS });
    this.players.set(ref.pid, online);
    if (!old) this.broadcast({ t: 'join', p: wire }, ref.pid);
  }

  /** Remove a player, but only if `conn` is still their current connection. */
  leave(pid: string, conn: Conn): void {
    const p = this.players.get(pid);
    if (!p || p.conn !== conn) return;
    this.players.delete(pid);
    this.broadcast({ t: 'leave', pid });
  }

  /** Handle one parsed frame from an authenticated player. Never throws on bad input. */
  handle(pid: string, conn: Conn, msg: unknown): void {
    const p = this.players.get(pid);
    if (!p || p.conn !== conn) return;
    if (typeof msg !== 'object' || msg === null) return this.fail(p, 'bad_message', 'Unreadable message.');
    const m = msg as Record<string, unknown>;
    switch (m.t) {
      case 'pos':
        return this.onPos(p, m);
      case 'say':
        return this.onSay(p, m);
      case 'dm':
        return this.onDm(p, m);
      default:
        return this.fail(p, 'bad_message', 'Unknown message type.');
    }
  }

  private onPos(p: Online, m: Record<string, unknown>) {
    const t = this.now();
    if (t - p.lastPosAt < MIN_POS_INTERVAL_MS) return;
    const { x, z, h } = m as { x: unknown; z: unknown; h: unknown };
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return;
    p.lastPosAt = t;
    p.x = clamp(x, BOUND);
    p.z = clamp(z, BOUND);
    p.h = typeof h === 'number' && Number.isFinite(h) ? ((h % 360) + 360) % 360 : p.h;
    p.m = motion(m.m);
  }

  /** Spend one token; false when the player is sending too fast. */
  private spend(p: Online): boolean {
    const t = this.now();
    p.tokens = Math.min(CHAT_BURST, p.tokens + (t - p.tokensAt) / CHAT_REFILL_MS);
    p.tokensAt = t;
    if (p.tokens < 1) return false;
    p.tokens -= 1;
    return true;
  }

  private onSay(p: Online, m: Record<string, unknown>) {
    const clean = cleanChatText(m.text);
    if (!clean.ok) return this.fail(p, clean.code, clean.message);
    if (!this.spend(p)) return this.fail(p, 'rate_limited', 'Slow down a little.');
    const msg: ServerMsg = { t: 'say', id: this.nextId(), from: p.ref.pid, name: p.ref.name, text: clean.text, at: this.now() };
    // The speaker always sees their own message; everyone within hearing distance does too.
    for (const q of this.players.values()) {
      if (q === p || dist2(p, q) <= CHAT_RADIUS * CHAT_RADIUS) this.safeSend(q, msg);
    }
  }

  private onDm(p: Online, m: Record<string, unknown>) {
    const to = typeof m.to === 'string' ? m.to : '';
    if (to === p.ref.pid) return this.fail(p, 'self', "You can't message yourself.");
    const target = this.players.get(to);
    if (!target) return this.fail(p, 'unknown_player', 'That player is not online.');
    const clean = cleanChatText(m.text);
    if (!clean.ok) return this.fail(p, clean.code, clean.message);
    if (!this.spend(p)) return this.fail(p, 'rate_limited', 'Slow down a little.');
    const msg: ServerMsg = { t: 'dm', id: this.nextId(), from: p.ref.pid, to, name: p.ref.name, text: clean.text, at: this.now() };
    this.safeSend(target, msg);
    this.safeSend(p, msg);
  }

  /** Send every player their nearby neighbours. Call at SNAPSHOT_HZ. */
  tick(): void {
    const start = performance.now();
    const all = [...this.players.values()];
    const r2 = INTEREST_RADIUS * INTEREST_RADIUS;
    for (const p of all) {
      const near: { d: number; q: Online }[] = [];
      for (const q of all) {
        if (q === p) continue;
        const d = dist2(p, q);
        if (d <= r2) near.push({ d, q });
      }
      if (near.length === 0) {
        if (p.sentEmpty) continue;
        p.sentEmpty = true;
        this.safeSend(p, { t: 'snap', p: [] });
        continue;
      }
      p.sentEmpty = false;
      if (near.length > INTEREST_MAX) {
        near.sort((a, b) => a.d - b.d);
        near.length = INTEREST_MAX;
      }
      const snap: SnapPlayer[] = near.map(({ q }) => [q.ref.n, round1(q.x), round1(q.z), Math.round(q.h), q.m]);
      this.safeSend(p, { t: 'snap', p: snap });
    }
    this.lastTickMs = performance.now() - start;
  }

  /** Close every connection (server shutdown). */
  closeAll(): void {
    for (const p of this.players.values()) p.conn.close(1001, 'server shutting down');
    this.players.clear();
  }

  private nextId(): string {
    return `${this.now().toString(36)}-${(++this.seq).toString(36)}`;
  }

  private fail(p: Online, code: RealtimeErrorCode, message: string) {
    this.hooks.onReject?.(code);
    this.safeSend(p, { t: 'err', code, message });
  }

  private broadcast(msg: ServerMsg, exceptPid?: string) {
    for (const q of this.players.values()) if (q.ref.pid !== exceptPid) this.safeSend(q, msg);
  }

  /** A broken socket must never take the hub down. */
  private safeSend(p: Online, msg: ServerMsg) {
    try {
      p.conn.send(msg);
    } catch {
      // The connection layer will notice the dead socket and call leave().
    }
  }
}

function dist2(a: Online, b: Online): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}
