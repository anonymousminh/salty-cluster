/**
 * Load test for presence + chat: N simulated players join, random-walk the park sending
 * their position at 10 Hz, while a few probe pairs measure chat latency.
 *
 *   pnpm --filter @meetspace/api dev:memory                       # in one terminal
 *   N=800 SECONDS=20 pnpm --filter @meetspace/api loadtest:realtime
 *
 * Env: URL (default http://localhost:8080), N (800), SECONDS (20), PROBES (20).
 * Run the server and this script on separate machines for numbers you can trust: on one laptop
 * they compete for the same CPU.
 */
import { WebSocket } from 'ws';
import { INTEREST_MAX, POSITION_HZ, REALTIME_PATH, WORLD, type ServerMsg } from '@meetspace/venue';

const URL_ = process.env.URL ?? 'http://localhost:8080';
const N = Number(process.env.N ?? 800);
const SECONDS = Number(process.env.SECONDS ?? 20);
const PROBES = Number(process.env.PROBES ?? 20);
const WS_URL = URL_.replace(/^http/, 'ws') + REALTIME_PATH;

interface Bot {
  ws: WebSocket;
  pid: string;
  x: number;
  z: number;
  dir: number;
  snaps: number;
  bytes: number;
  maxBytes: number;
  neighbours: number;
  errors: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]! : NaN);

async function joinOne(i: number): Promise<string> {
  const res = await fetch(`${URL_}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `bot${i}`, color: '#22d3ee' }) });
  if (!res.ok) throw new Error(`join failed: ${res.status}`);
  return ((await res.json()) as { sessionId: string }).sessionId;
}

function connect(session: string, x: number, z: number, onMsg?: (m: ServerMsg, bot: Bot) => void): Promise<Bot> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const bot: Bot = { ws, pid: '', x, z, dir: Math.random() * Math.PI * 2, snaps: 0, bytes: 0, maxBytes: 0, neighbours: 0, errors: 0 };
    const timer = setTimeout(() => reject(new Error('welcome timeout')), 15_000);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', session })));
    ws.on('message', (data) => {
      const text = data.toString();
      const m = JSON.parse(text) as ServerMsg;
      if (m.t === 'welcome') {
        bot.pid = m.you.pid;
        clearTimeout(timer);
        resolve(bot);
      } else if (m.t === 'snap') {
        bot.snaps++;
        bot.bytes += text.length;
        bot.maxBytes = Math.max(bot.maxBytes, text.length);
        bot.neighbours += m.p.length;
      } else if (m.t === 'err') bot.errors++;
      onMsg?.(m, bot);
    });
    ws.on('error', reject);
  });
}

async function main() {
  console.log(`Joining ${N} players against ${URL_} …`);
  const t0 = Date.now();
  const sessions: string[] = [];
  for (let i = 0; i < N; i += 50) sessions.push(...(await Promise.all(Array.from({ length: Math.min(50, N - i) }, (_, k) => joinOne(i + k)))));
  console.log(`  joined in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const half = WORLD.size[0] / 2 - 3;
  const rand = (lim: number) => (Math.random() * 2 - 1) * lim;
  const bots: Bot[] = [];
  const probeLatency: number[] = [];
  const pending = new Map<string, number>();
  const t1 = Date.now();
  for (let i = 0; i < N; i += 50) {
    const batch = await Promise.all(
      sessions.slice(i, i + 50).map((s) =>
        connect(s, rand(half), rand(half), (m) => {
          if (m.t === 'say' && pending.has(m.text)) {
            probeLatency.push(Date.now() - pending.get(m.text)!);
            pending.delete(m.text);
          }
        }),
      ),
    );
    bots.push(...batch);
  }
  console.log(`  ${bots.length} sockets welcomed in ${((Date.now() - t1) / 1000).toFixed(1)} s`);

  // Everyone random-walks and reports position at 10 Hz.
  const walk = setInterval(() => {
    for (const b of bots) {
      if (Math.random() < 0.05) b.dir += (Math.random() - 0.5) * 2;
      b.x = Math.max(-half, Math.min(half, b.x + Math.cos(b.dir) * 0.3));
      b.z = Math.max(-half, Math.min(half, b.z + Math.sin(b.dir) * 0.3));
      if (b.x === half || b.x === -half || b.z === half || b.z === -half) b.dir += Math.PI / 2;
      if (b.ws.readyState === WebSocket.OPEN) b.ws.send(JSON.stringify({ t: 'pos', x: b.x, z: b.z, h: (b.dir * 180) / Math.PI, m: 1 }));
    }
  }, 1000 / POSITION_HZ);

  // Chat probes: one player speaks, another one a few meters away must receive it.
  const probes = setInterval(() => {
    for (let i = 0; i < PROBES; i++) {
      const a = bots[(i * 2) % bots.length]!;
      const text = `probe-${Date.now()}-${i}`;
      pending.set(text, Date.now());
      a.ws.send(JSON.stringify({ t: 'say', text }));
    }
  }, 4000);

  console.log(`Running ${SECONDS} s …`);
  const startSnaps = bots.map((b) => b.snaps);
  const start = Date.now();
  await sleep(SECONDS * 1000);
  const secs = (Date.now() - start) / 1000;
  clearInterval(walk);
  clearInterval(probes);

  const snaps = bots.map((b, i) => (b.snaps - startSnaps[i]!) / secs);
  const avgBytes = bots.reduce((a, b) => a + b.bytes, 0) / Math.max(1, bots.reduce((a, b) => a + b.snaps, 0));
  const avgNeighbours = bots.reduce((a, b) => a + b.neighbours, 0) / Math.max(1, bots.reduce((a, b) => a + b.snaps, 0));
  const totalBytesPerSec = (avgBytes * snaps.reduce((a, b) => a + b, 0));
  console.log('\n=== Results ===');
  console.log(`players online:            ${bots.length}`);
  console.log(`snapshots/s per player:    avg ${(snaps.reduce((a, b) => a + b, 0) / snaps.length).toFixed(2)}  min ${Math.min(...snaps).toFixed(2)}  (target 5)`);
  console.log(`players per snapshot:      avg ${avgNeighbours.toFixed(1)}  (cap ${INTEREST_MAX})`);
  console.log(`snapshot size:             avg ${avgBytes.toFixed(0)} B  max ${Math.max(...bots.map((b) => b.maxBytes))} B`);
  console.log(`server → clients:          ${(totalBytesPerSec / 1024).toFixed(0)} KB/s total  (${(totalBytesPerSec / bots.length / 1024).toFixed(2)} KB/s per player)`);
  console.log(`chat probe latency:        p50 ${pct(probeLatency, 50)} ms  p95 ${pct(probeLatency, 95)} ms  max ${Math.max(...probeLatency)} ms  (${probeLatency.length} delivered)`);
  console.log(`chat errors:               ${bots.reduce((a, b) => a + b.errors, 0)}`);
  console.log(`sockets still open:        ${bots.filter((b) => b.ws.readyState === WebSocket.OPEN).length}/${bots.length}`);
  for (const b of bots) b.ws.close();
  await sleep(500);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
