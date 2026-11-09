import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { CHAT_RADIUS, REALTIME_PATH, type ClientMsg, type ServerMsg } from '@meetspace/venue';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { memoryEs } from '../src/dev/memory-es';

const config = { ...loadConfig({}), organizerToken: 'org-secret' };

/** A WebSocket test client that records every server frame. */
class Client {
  frames: ServerMsg[] = [];
  closed: { code: number; reason: string } | null = null;
  private constructor(public ws: WebSocket) {
    ws.on('message', (d) => this.frames.push(JSON.parse(d.toString())));
    ws.on('close', (code, reason) => (this.closed = { code, reason: reason.toString() }));
  }
  static open(port: number): Promise<Client> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}${REALTIME_PATH}`);
      const c = new Client(ws);
      ws.once('open', () => resolve(c));
      ws.once('error', reject);
    });
  }
  send(m: ClientMsg | string) {
    this.ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  }
  async waitFor<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 3000): Promise<Extract<ServerMsg, { t: T }>> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = this.frames.find((m): m is Extract<ServerMsg, { t: T }> => m.t === t && pred(m as Extract<ServerMsg, { t: T }>));
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error(`timed out waiting for ${t}; got ${JSON.stringify(this.frames.map((f) => f.t))}`);
  }
  async waitClosed(ms = 3000) {
    const end = Date.now() + ms;
    while (!this.closed && Date.now() < end) await new Promise((r) => setTimeout(r, 15));
    if (!this.closed) throw new Error('socket did not close');
    return this.closed;
  }
}

const open: Client[] = [];
let app: ReturnType<typeof buildApp> | null = null;

async function boot() {
  const f = memoryEs({ booths: {} });
  app = buildApp({ es: f.es, config, logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  const joinPlayer = async (name: string, color = '#f472b6') => (await app!.inject({ method: 'POST', url: '/api/join', payload: { name, color } })).json().sessionId as string;
  const connect = async (name: string, at?: [number, number]) => {
    const session = await joinPlayer(name);
    const c = await Client.open(port);
    open.push(c);
    c.send({ t: 'hello', session });
    const welcome = await c.waitFor('welcome');
    if (at) c.send({ t: 'pos', x: at[0], z: at[1], h: 0, m: 0 });
    return { c, welcome, session };
  };
  return { port, connect, joinPlayer };
}

afterEach(async () => {
  for (const c of open.splice(0)) c.ws.terminate();
  await app?.close();
  app = null;
});

describe('realtime over a real WebSocket', () => {
  it('authenticates with a hello frame and receives a welcome', async () => {
    const { connect } = await boot();
    const { welcome } = await connect('Priya');
    expect(welcome.you).toMatchObject({ name: 'Priya', color: '#f472b6' });
    expect(welcome.you.pid).toMatch(/^[0-9a-f]{16}$/);
    expect(welcome.chatRadius).toBe(CHAT_RADIUS);
  });

  it('never exposes the session id or the stored document id to other players', async () => {
    const { connect } = await boot();
    const a = await connect('Ana');
    const b = await connect('Ben');
    const seen = JSON.stringify(b.c.frames) + JSON.stringify(a.c.frames);
    expect(seen).not.toContain(a.session);
    expect(seen).not.toContain(b.session);
  });

  it('delivers nearby chat to a player in range and not to one far away', async () => {
    const { connect } = await boot();
    const a = await connect('Ana', [0, 0]);
    const near = await connect('Ben', [5, 0]);
    const far = await connect('Cleo', [40, 40]);
    await new Promise((r) => setTimeout(r, 80)); // let the position frames land
    a.c.send({ t: 'say', text: 'hello <b>hall</b>' });
    expect((await near.c.waitFor('say')).text).toBe('hello <b>hall</b>');
    expect((await a.c.waitFor('say')).from).toBe(a.welcome.you.pid);
    await new Promise((r) => setTimeout(r, 150));
    expect(far.c.frames.filter((f) => f.t === 'say')).toHaveLength(0);
  });

  it('delivers a DM to the target only', async () => {
    const { connect } = await boot();
    const a = await connect('Ana', [-30, 0]);
    const b = await connect('Ben', [30, 0]);
    const c = await connect('Cleo', [-29, 0]);
    await new Promise((r) => setTimeout(r, 80));
    a.c.send({ t: 'dm', to: b.welcome.you.pid, text: 'private' });
    expect((await b.c.waitFor('dm')).text).toBe('private');
    await a.c.waitFor('dm'); // sender echo
    await new Promise((r) => setTimeout(r, 150));
    expect(c.c.frames.filter((f) => f.t === 'dm' || f.t === 'say')).toHaveLength(0);
  });

  it('streams snapshots of nearby players and announces joins and leaves', async () => {
    const { connect } = await boot();
    const a = await connect('Ana', [0, 0]);
    const b = await connect('Ben', [4, 3]);
    await a.c.waitFor('join', (m) => m.p.name === 'Ben');
    // Snapshots name players by their small numeric id, which `welcome`/`join` map to the pid.
    const benN = b.welcome.you.n;
    const snap = await a.c.waitFor('snap', (m) => m.p.some((p) => p[0] === benN));
    const [, x, z] = snap.p.find((p) => p[0] === benN)!;
    expect([x, z]).toEqual([4, 3]);
    b.c.ws.close();
    expect((await a.c.waitFor('leave')).pid).toBe(b.welcome.you.pid);
  });

  it('closes a socket whose session is unknown', async () => {
    const { port } = await boot();
    const c = await Client.open(port);
    c.send({ t: 'hello', session: 'not-a-real-session' });
    expect((await c.waitClosed()).code).toBe(4004);
  });

  it('closes a socket that sends anything but hello first', async () => {
    const { port } = await boot();
    const c = await Client.open(port);
    c.send({ t: 'say', text: 'hi' });
    expect((await c.waitClosed()).code).toBe(4003);
  });

  it('closes a socket that sends invalid JSON or an oversized frame', async () => {
    const { port } = await boot();
    const bad = await Client.open(port);
    bad.send('{not json');
    expect((await bad.waitClosed()).code).toBe(1007);
    const big = await Client.open(port);
    big.send('x'.repeat(5000));
    expect((await big.waitClosed()).code).toBe(1009);
  });

  it('replaces the old connection when the same player reconnects', async () => {
    const { connect, port } = await boot();
    const first = await connect('Ana');
    const second = await Client.open(port);
    open.push(second);
    second.send({ t: 'hello', session: first.session });
    await second.waitFor('welcome');
    expect((await first.c.waitClosed()).code).toBe(4002);
  });

  it('does not upgrade other paths', async () => {
    const { port } = await boot();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/somewhere-else`);
    const outcome = await new Promise<string>((resolve) => {
      ws.once('open', () => resolve('open'));
      ws.once('error', () => resolve('error'));
      ws.once('close', () => resolve('closed'));
      setTimeout(() => resolve('hang'), 1500);
    });
    ws.terminate();
    expect(outcome).not.toBe('open');
  });
});
