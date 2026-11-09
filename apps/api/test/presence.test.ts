import { describe, expect, it } from 'vitest';
import { CHAT_BURST, CHAT_RADIUS, CHAT_REFILL_MS, INTEREST_MAX, INTEREST_RADIUS, MAX_CHAT_LENGTH, type PlayerRef, type ServerMsg } from '@meetspace/venue';
import { PresenceHub, type Conn } from '../src/presence';

class FakeConn implements Conn {
  got: ServerMsg[] = [];
  closed: { code: number; reason: string } | null = null;
  throwOnSend = false;
  send(msg: ServerMsg) {
    if (this.throwOnSend) throw new Error('socket is dead');
    this.got.push(msg);
  }
  close(code: number, reason: string) {
    this.closed = { code, reason };
  }
  of<T extends ServerMsg['t']>(t: T) {
    return this.got.filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t);
  }
}

/** The pid behind each numeric id, as a client learns it from welcome/join frames. */
function numbers(c: FakeConn): Map<number, string> {
  const m = new Map<number, string>();
  for (const f of c.got) {
    if (f.t === 'welcome') {
      m.set(f.you.n, f.you.pid);
      for (const r of f.roster) m.set(r.n, r.pid);
    }
    if (f.t === 'join') m.set(f.p.n, f.p.pid);
  }
  return m;
}
/** Latest snapshot as [pid, x, z, h, m] rows. */
function lastSnap(c: FakeConn): [string, number, number, number, number][] {
  const names = numbers(c);
  return c.of('snap').at(-1)!.p.map(([n, x, z, h, m]) => [names.get(n) ?? `?${n}`, x, z, h, m]);
}

function setup() {
  let now = 1_000_000;
  const hub = new PresenceHub(() => now);
  const advance = (ms: number) => (now += ms);
  const ref = (pid: string): PlayerRef => ({ pid, name: pid.toUpperCase(), color: '#22d3ee' });
  const add = (pid: string, at?: [number, number]) => {
    const conn = new FakeConn();
    hub.join(ref(pid), conn);
    if (at) {
      advance(50);
      hub.handle(pid, conn, { t: 'pos', x: at[0], z: at[1], h: 0, m: 0 });
    }
    return conn;
  };
  return { hub, advance, add };
}

describe('joining and leaving', () => {
  it('welcomes the newcomer with the roster and tells everyone else', () => {
    const { hub, add } = setup();
    const a = add('a');
    const b = add('b');
    expect(a.of('welcome')[0]!.roster).toEqual([]);
    expect(b.of('welcome')[0]!.roster.map((p) => p.pid)).toEqual(['a']);
    expect(b.of('welcome')[0]!.you.pid).toBe('b');
    expect(a.of('join').map((m) => m.p.pid)).toEqual(['b']);
    expect(b.of('join')).toHaveLength(0);
    expect(hub.size).toBe(2);
  });

  it('announces a leave, and only for the current connection', () => {
    const { hub, add } = setup();
    const a = add('a');
    const b = add('b');
    hub.leave('b', b);
    expect(a.of('leave').map((m) => m.pid)).toEqual(['b']);
    expect(hub.has('b')).toBe(false);
  });

  it('replaces an older connection for the same player without a duplicate join', () => {
    const { hub, add } = setup();
    const a = add('a');
    const b1 = add('b');
    const b2 = new FakeConn();
    hub.join({ pid: 'b', name: 'B', color: '#22d3ee' }, b2);
    expect(b1.closed?.code).toBe(4002);
    expect(a.of('join')).toHaveLength(1); // only the first join was announced
    // The old socket closing later must not remove the new connection.
    hub.leave('b', b1);
    expect(hub.has('b')).toBe(true);
    expect(a.of('leave')).toHaveLength(0);
  });

  it('ignores messages from a stale connection', () => {
    const { hub, add } = setup();
    const b1 = add('b');
    add('a');
    hub.join({ pid: 'b', name: 'B', color: '#22d3ee' }, new FakeConn());
    hub.handle('b', b1, { t: 'say', text: 'ghost' });
    expect(b1.of('say')).toHaveLength(0);
  });
});

describe('nearby chat', () => {
  it('reaches players within the chat radius, including the speaker, and nobody farther', () => {
    const { hub, add } = setup();
    const a = add('a', [0, 0]);
    const near = add('near', [CHAT_RADIUS - 1, 0]);
    const far = add('far', [CHAT_RADIUS + 1, 0]);
    hub.handle('a', a, { t: 'say', text: 'hello hall' });
    expect(a.of('say')[0]).toMatchObject({ from: 'a', name: 'A', text: 'hello hall' });
    expect(near.of('say')[0]).toMatchObject({ from: 'a', text: 'hello hall' });
    expect(far.of('say')).toHaveLength(0);
  });

  it('cleans text and rejects empty or oversized messages', () => {
    const { hub, add } = setup();
    const a = add('a');
    hub.handle('a', a, { t: 'say', text: '  hi \n\n there ' });
    expect(a.of('say')[0]!.text).toBe('hi there');
    hub.handle('a', a, { t: 'say', text: '   ' });
    hub.handle('a', a, { t: 'say', text: 'x'.repeat(MAX_CHAT_LENGTH + 1) });
    hub.handle('a', a, { t: 'say', text: 123 });
    expect(a.of('err').map((e) => e.code)).toEqual(['empty', 'too_long', 'bad_message']);
    expect(a.of('say')).toHaveLength(1);
  });

  it('rate limits bursts and refills over time', () => {
    const { hub, add, advance } = setup();
    const a = add('a');
    for (let i = 0; i < CHAT_BURST; i++) hub.handle('a', a, { t: 'say', text: `m${i}` });
    expect(a.of('say')).toHaveLength(CHAT_BURST);
    hub.handle('a', a, { t: 'say', text: 'too fast' });
    expect(a.of('err').at(-1)!.code).toBe('rate_limited');
    advance(CHAT_REFILL_MS);
    hub.handle('a', a, { t: 'say', text: 'after a pause' });
    expect(a.of('say').at(-1)!.text).toBe('after a pause');
  });

  it('gives each message a unique id', () => {
    const { hub, add } = setup();
    const a = add('a');
    hub.handle('a', a, { t: 'say', text: 'one' });
    hub.handle('a', a, { t: 'say', text: 'two' });
    const ids = a.of('say').map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('direct messages', () => {
  it('goes to the target wherever they are, echoes to the sender, and to nobody else', () => {
    const { hub, add } = setup();
    const a = add('a', [-40, 0]);
    const b = add('b', [40, 0]);
    const c = add('c', [-39, 0]);
    hub.handle('a', a, { t: 'dm', to: 'b', text: 'psst' });
    expect(b.of('dm')[0]).toMatchObject({ from: 'a', to: 'b', name: 'A', text: 'psst' });
    expect(a.of('dm')).toHaveLength(1);
    expect(c.of('dm')).toHaveLength(0);
    expect(c.of('say')).toHaveLength(0);
  });

  it('refuses unknown targets and messaging yourself', () => {
    const { hub, add } = setup();
    const a = add('a');
    hub.handle('a', a, { t: 'dm', to: 'ghost', text: 'hello?' });
    hub.handle('a', a, { t: 'dm', to: 'a', text: 'me' });
    expect(a.of('err').map((e) => e.code)).toEqual(['unknown_player', 'self']);
  });

  it('shares the rate limit with public chat', () => {
    const { hub, add } = setup();
    const a = add('a');
    add('b');
    for (let i = 0; i < CHAT_BURST; i++) hub.handle('a', a, { t: 'say', text: 'x' });
    hub.handle('a', a, { t: 'dm', to: 'b', text: 'y' });
    expect(a.of('err').at(-1)!.code).toBe('rate_limited');
  });
});

describe('positions', () => {
  it('clamps to the park and ignores junk', () => {
    const { hub, add, advance } = setup();
    const a = add('a');
    const b = add('b');
    advance(50);
    hub.handle('a', a, { t: 'pos', x: 9999, z: -9999, h: 370, m: 2 });
    advance(50);
    hub.handle('a', a, { t: 'pos', x: Number.NaN, z: 1, h: 0, m: 0 });
    hub.tick();
    const snap = b.of('snap').at(-1)!.p;
    // Clamped to the boundary → far from b's spawn position, so out of interest range.
    expect(snap).toHaveLength(0);
  });

  it('drops position updates that arrive too fast', () => {
    const { hub, add, advance } = setup();
    const a = add('a');
    const b = add('b', [0, 0]);
    advance(100);
    hub.handle('a', a, { t: 'pos', x: 1, z: 0, h: 0, m: 1 });
    hub.handle('a', a, { t: 'pos', x: 2, z: 0, h: 0, m: 1 }); // same instant: dropped
    hub.tick();
    expect(lastSnap(b)[0]).toEqual(['a', 1, 0, 0, 1]);
  });

  it('normalises the heading', () => {
    const { hub, add, advance } = setup();
    const a = add('a');
    const b = add('b', [0, 0]);
    advance(100);
    hub.handle('a', a, { t: 'pos', x: 1, z: 0, h: -90, m: 0 });
    hub.tick();
    expect(lastSnap(b)[0]![3]).toBe(270);
  });
});

describe('snapshots (interest management)', () => {
  it('sends only players within the interest radius', () => {
    const { hub, add } = setup();
    const a = add('a', [0, 0]);
    add('near', [INTEREST_RADIUS - 5, 0]);
    add('far', [INTEREST_RADIUS + 5, 0]);
    hub.tick();
    expect(lastSnap(a).map((p) => p[0])).toEqual(['near']);
  });

  it('caps the snapshot at the nearest INTEREST_MAX players', () => {
    const { hub, add } = setup();
    const a = add('a', [0, 0]);
    for (let i = 0; i < INTEREST_MAX + 15; i++) add(`p${i}`, [1 + i * 0.5, 0]);
    hub.tick();
    const snap = lastSnap(a);
    expect(snap).toHaveLength(INTEREST_MAX);
    // The nearest ones are kept: p0 is the closest, p54 the farthest.
    expect(snap.some((p) => p[0] === 'p0')).toBe(true);
    expect(snap.some((p) => p[0] === `p${INTEREST_MAX + 14}`)).toBe(false);
  });

  it('sends one empty snapshot when alone, then stays quiet', () => {
    const { hub, add } = setup();
    const a = add('a', [0, 0]);
    hub.tick();
    hub.tick();
    hub.tick();
    expect(a.of('snap')).toHaveLength(1);
    expect(a.of('snap')[0]!.p).toEqual([]);
  });

  it('copes with 800 players in one tick', () => {
    const { hub, add } = setup();
    const conns: FakeConn[] = [];
    for (let i = 0; i < 800; i++) conns.push(add(`p${i}`, [((i * 7) % 90) - 45, ((i * 13) % 90) - 45]));
    hub.tick();
    expect(hub.lastTickMs).toBeLessThan(250); // generous: a real run is a few ms; the budget is 200 ms at 5 Hz
    for (const c of conns) expect(c.of('snap').at(-1)!.p.length).toBeLessThanOrEqual(INTEREST_MAX);
  });
});

describe('robustness', () => {
  it('survives a dead socket and keeps serving everyone else', () => {
    const { hub, add } = setup();
    const a = add('a', [0, 0]);
    const dead = add('dead', [1, 0]);
    const c = add('c', [2, 0]);
    dead.throwOnSend = true;
    hub.handle('a', a, { t: 'say', text: 'still works' });
    hub.tick();
    expect(c.of('say')).toHaveLength(1);
    expect(c.of('snap').length).toBeGreaterThan(0);
  });

  it('answers unknown or malformed frames with an error', () => {
    const { hub, add } = setup();
    const a = add('a');
    hub.handle('a', a, { t: 'teleport' });
    hub.handle('a', a, null);
    hub.handle('a', a, 'text');
    expect(a.of('err').map((e) => e.code)).toEqual(['bad_message', 'bad_message', 'bad_message']);
  });

  it('closeAll disconnects everyone', () => {
    const { hub, add } = setup();
    const a = add('a');
    hub.closeAll();
    expect(a.closed?.code).toBe(1001);
    expect(hub.size).toBe(0);
  });
});

describe('numeric ids', () => {
  it('gives each player a distinct small number, kept across a reconnect', () => {
    const { hub, add } = setup();
    const a = add('a');
    const b = add('b');
    const ns = [a.of('welcome')[0]!.you.n, b.of('welcome')[0]!.you.n];
    expect(new Set(ns).size).toBe(2);
    expect(Math.max(...ns)).toBeLessThan(100);
    const b2 = new FakeConn();
    hub.join({ pid: 'b', name: 'B', color: '#22d3ee' }, b2);
    expect(b2.of('welcome')[0]!.you.n).toBe(ns[1]);
  });

  it('keeps snapshots compact', () => {
    const { hub, add } = setup();
    const a = add('a', [0, 0]);
    for (let i = 0; i < INTEREST_MAX; i++) add(`p${i}`, [i * 0.7, 3.14159]);
    hub.tick();
    const bytes = JSON.stringify(a.of('snap').at(-1)).length;
    expect(bytes / INTEREST_MAX).toBeLessThan(28); // was ~39 B per player with string ids and 2-decimal positions
  });

  it('rounds positions to 0.1 m', () => {
    const { hub, add, advance } = setup();
    const a = add('a');
    const b = add('b', [0, 0]);
    advance(100);
    hub.handle('a', a, { t: 'pos', x: 1.2345, z: -6.7891, h: 10.6, m: 0 });
    hub.tick();
    expect(lastSnap(b)[0]).toEqual(['a', 1.2, -6.8, 11, 0]);
  });
});
