/**
 * Simulated attendees for demos and load tests. Talks to a running API over HTTP, so
 * traces/metrics reach Dash0 and the api HPA sees real load in Radar.
 *
 *   API_URL=http://localhost:8080 pnpm --filter @meetspace/api simulate -- --players 60 --seconds 90
 *
 *   --players N   bots to create (default 40)
 *   --seconds S   how long to run (default 60)
 *   --rate R      check-in attempts per second (default 4)
 *   --follow F    0..1, how often a bot heads for the best underdog bonus instead of a
 *                 popular booth (default 0.7)
 *   --correct C   0..1, chance of answering the quiz right (default 0.8)
 *
 * Compare --follow 0 with --follow 0.8: the printed "spread" shows how the underdog
 * bonus evens out traffic across booths.
 */
import { DWELL_SECONDS, boothQuiz, type Booth, type BoothStats, type GameView } from '@meetspace/venue';

const argv = process.argv.slice(2);
const opt = (name: string, dflt: number) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : dflt;
};
const API = process.env.API_URL ?? 'http://localhost:8080';
const players = opt('players', 40);
const seconds = opt('seconds', 60);
const rate = opt('rate', 4);
const follow = opt('follow', 0.7);
const correctRate = opt('correct', 0.8);

async function call<T>(method: string, path: string, body?: unknown, session?: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(session ? { authorization: `Bearer ${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => undefined)) as T };
}

/** Coefficient of variation of visits: lower = traffic spread more evenly. */
function spread(stats: BoothStats): number {
  const v = Object.values(stats).map((s) => s.visits);
  const mean = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  if (!mean) return 0;
  return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) / mean;
}

async function main() {
  const booths = (await call<Booth[]>('GET', '/api/booths')).body;
  if (!booths?.length) throw new Error(`no booths at ${API}. Run es:setup and seed first.`);
  // Without the bonus, people crowd the "famous" booths (same weights as the game's offline mode).
  const popularity = booths.map((_, i) => (i % 7 === 0 ? 8 : i % 3 === 0 ? 3 : 1));

  console.log(`Creating ${players} bots at ${API}…`);
  const sessions: string[] = [];
  for (let i = 0; i < players; i++) {
    const r = await call<{ sessionId: string }>('POST', '/api/join', { name: `Bot ${String(i + 1).padStart(3, '0')}` });
    if (r.status === 201) sessions.push(r.body.sessionId);
  }
  const visited = new Map(sessions.map((s) => [s, new Set<string>()]));
  const outcome: Record<string, number> = {};

  const pickPopular = (options: Booth[]) => {
    const w = options.map((b) => popularity[booths.indexOf(b)] ?? 1);
    let r = Math.random() * w.reduce((a, x) => a + x, 0);
    for (let i = 0; i < options.length; i++) if ((r -= w[i]!) <= 0) return options[i]!;
    return options[0]!;
  };

  const end = Date.now() + seconds * 1000;
  let tick = 0;
  while (Date.now() < end) {
    const view = (await call<GameView>('GET', '/api/game')).body;
    if (view?.state.status !== 'live') {
      if (tick++ % 5 === 0) console.log(`Game is ${view?.state.status ?? 'unreachable'}. Waiting for the organizer to press Start…`);
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    const stats = (await call<BoothStats>('GET', '/api/booths/stats')).body;
    const zone = new Set(view.inZoneBoothIds);
    await Promise.all(
      Array.from({ length: rate }, async () => {
        const s = sessions[Math.floor(Math.random() * sessions.length)]!;
        const seen = visited.get(s)!;
        const options = booths.filter((b) => !seen.has(b.id) && zone.has(b.id));
        if (!options.length) return;
        const booth =
          Math.random() < follow ? [...options].sort((a, b) => (stats[b.id]?.bonus ?? 0) - (stats[a.id]?.bonus ?? 0))[Math.floor(Math.random() * Math.min(3, options.length))]! : pickPopular(options);
        const quiz = boothQuiz(booth, booths);
        const quizAnswer = Math.random() < correctRate ? quiz.answerIndex : (quiz.answerIndex + 1) % quiz.options.length;
        const r = await call<{ error?: string; reason?: string }>('POST', `/api/booths/${booth.id}/checkin`, { dwellMs: DWELL_SECONDS * 1000, quizAnswer }, s);
        const key = r.status === 200 ? 'scored' : (r.body?.reason ?? r.body?.error ?? `http_${r.status}`);
        outcome[key] = (outcome[key] ?? 0) + 1;
        if (r.status === 200 || r.status === 409) seen.add(booth.id);
      }),
    );
    await new Promise((r) => setTimeout(r, 1000));
  }

  const stats = (await call<BoothStats>('GET', '/api/booths/stats')).body;
  const lb = (await call<{ entries: { rank: number; name: string; xp: number }[] }>('GET', '/api/leaderboard?limit=3')).body;
  console.log('\nOutcomes:', outcome);
  console.log('Visits per booth:', Object.fromEntries(Object.entries(stats).map(([k, v]) => [k.replace('booth-', ''), v.visits])));
  console.log(`Spread (coefficient of variation, lower = more even): ${spread(stats).toFixed(2)}`);
  console.log('Top 3:', lb.entries.map((e) => `${e.rank}. ${e.name} ${e.xp} XP`).join('  '));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
