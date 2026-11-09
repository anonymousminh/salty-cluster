import { describe, expect, it } from 'vitest';
import {
  BASE_XP,
  DEMO_BOOTHS,
  DWELL_SECONDS,
  underdogBonus,
  OPENING_CIRCLE,
  boothQuiz,
  getBoothSlot,
  worldToGeo,
  type Booth,
  type GameState,
} from '@meetspace/venue';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { boothCode } from '../src/lib/ids';
import { memoryEs } from '../src/dev/memory-es';

const config = { ...loadConfig({}), organizerToken: 'org-secret' };
const ORG = { 'x-organizer-token': 'org-secret' };
const live = (over: Partial<GameState> = {}): GameState => ({ status: 'live', round: 1, circle: OPENING_CIRCLE, updatedAt: '2026-11-09T00:00:00Z', ...over });

function setup(state: GameState | null = live()) {
  const booths = Object.fromEntries(
    DEMO_BOOTHS.map((b) => [
      b.id,
      { id: b.id, slot_id: b.slotId, company: b.company, color: b.color, tagline: b.tagline, hiring: b.hiring, tags: b.tags, location: worldToGeo(getBoothSlot(b.slotId)!.anchor), code: boothCode(b.id, 's') },
    ]),
  );
  const f = memoryEs({ booths, ...(state ? { game: { current: { state } } } : {}) });
  const app = buildApp({ es: f.es, config, logger: false });
  return { ...f, app };
}

const join = async (app: ReturnType<typeof setup>['app'], name = 'Priya', extra: object = {}) =>
  (await app.inject({ method: 'POST', url: '/api/join', payload: { name, ...extra } })).json().sessionId as string;

const answerFor = (booth: Booth) => boothQuiz(booth, DEMO_BOOTHS).answerIndex;
const b = (i: number) => DEMO_BOOTHS[i]!;

const checkin = (app: ReturnType<typeof setup>['app'], session: string, booth: Booth, body: object = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/booths/${booth.id}/checkin`,
    headers: { authorization: `Bearer ${session}` },
    payload: { dwellMs: DWELL_SECONDS * 1000, quizAnswer: answerFor(booth), ...body },
  });

describe('booths', () => {
  it('lists booths in slot order without QR codes or locations', async () => {
    const { app } = setup();
    const booths = (await app.inject({ method: 'GET', url: '/api/booths' })).json();
    expect(booths.map((x: Booth) => x.id)).toEqual(DEMO_BOOTHS.map((x) => x.id));
    expect(JSON.stringify(booths)).not.toMatch(/"code"|"location"/);
  });

  it('serves the same quiz the server checks (booth order matches)', async () => {
    const { app } = setup();
    const booths: Booth[] = (await app.inject({ method: 'GET', url: '/api/booths' })).json();
    for (const x of booths) expect(boothQuiz(x, booths).answerIndex).toBe(answerFor(x));
  });
});

describe('check-in', () => {
  it('awards base XP plus underdog bonus and refuses a second visit', async () => {
    const { app } = setup();
    const me = await join(app);
    const first = await checkin(app, me, b(0));
    expect(first.statusCode).toBe(200);
    // Nobody had visited anything: average 0, so no underdog bonus yet.
    expect(first.json()).toEqual({ xpGained: BASE_XP, base: BASE_XP, bonus: 0, totalXp: BASE_XP });

    const again = await checkin(app, me, b(0));
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('already_visited');
  });

  it('pays the underdog bonus at a quiet booth once others are busy', async () => {
    const { app } = setup();
    for (const name of ['A', 'B', 'C', 'D']) await checkin(app, await join(app, name), b(0));
    const res = await checkin(app, await join(app, 'E'), b(1));
    // b0 has 4 visits, the other booths 0: b1 is below average, so it pays a bonus (shared scoring rules).
    const expected = underdogBonus(0, 4 / DEMO_BOOTHS.length);
    expect(expected).toBeGreaterThan(0);
    expect(res.json()).toMatchObject({ base: BASE_XP, bonus: expected, xpGained: BASE_XP + expected });
    const stats = (await app.inject({ method: 'GET', url: '/api/booths/stats' })).json();
    expect(stats[b(0).id]).toEqual({ visits: 4, bonus: 0 });
  });

  it('rejects a wrong answer, short dwell, unknown session and lobby game with clear reasons', async () => {
    const { app } = setup();
    const me = await join(app);
    const wrong = await checkin(app, me, b(2), { quizAnswer: (answerFor(b(2)) + 1) % 3 });
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().reason).toBe('wrong_answer');
    expect((await checkin(app, me, b(2), { dwellMs: 1000 })).json().reason).toBe('dwell_too_short');
    expect((await checkin(app, 'nobody', b(2))).statusCode).toBe(401);

    const lobby = setup(live({ status: 'lobby' }));
    expect((await checkin(lobby.app, await join(lobby.app), b(2))).json().reason).toBe('game_not_live');
  });

  it('accepts the physical QR code instead of dwell, and rejects a forged one', async () => {
    const { app, docs } = setup();
    const me = await join(app);
    expect((await checkin(app, me, b(3), { dwellMs: undefined, code: 'forged' })).json().reason).toBe('bad_code');
    const ok = await checkin(app, me, b(3), { dwellMs: undefined, code: boothCode(b(3).id, 's') });
    expect(ok.statusCode).toBe(200);
    expect([...docs('checkins').values()][0]).toMatchObject({ method: 'qr' });
  });

  it('pays nothing in the storm (geo_distance circle) and keeps the booth available', async () => {
    // Small circle around the first expo slot only.
    const anchor = getBoothSlot(b(0).slotId)!.anchor;
    const { app, docs } = setup(live({ circle: { center: anchor, radius: 3 } }));
    const view = (await app.inject({ method: 'GET', url: '/api/game' })).json();
    expect(view.inZoneBoothIds).toEqual([b(0).id]);

    const me = await join(app);
    const storm = await checkin(app, me, b(5));
    expect(storm.statusCode).toBe(422);
    expect(storm.json().reason).toBe('in_storm');
    expect(docs('checkins').size).toBe(0);
  });

  it('stores only hashed session ids', async () => {
    const { app, docs } = setup();
    const me = await join(app);
    await checkin(app, me, b(0));
    expect(JSON.stringify([...docs('checkins').entries(), ...docs('players').entries()])).not.toContain(me);
  });
});

describe('progress and leaderboard', () => {
  it('ranks players by XP, shows bonus XP, marks "me", and respects anonymity', async () => {
    const { app } = setup();
    const alex = await join(app, 'Alex');
    const shy = await join(app, 'Shy', { showOnLeaderboard: false });
    await checkin(app, alex, b(0));
    await checkin(app, alex, b(1));
    await checkin(app, shy, b(2));

    const lb = (await app.inject({ method: 'GET', url: '/api/leaderboard?limit=5', headers: { authorization: `Bearer ${shy}` } })).json();
    expect(lb.entries.map((e: { name: string }) => e.name)).toEqual(['Alex', 'Anonymous']);
    expect(lb.me).toMatchObject({ rank: 2, name: 'Anonymous', isMe: true, booths: 1 });
    expect(lb.entries[0].isMe).toBeUndefined();

    const progress = (await app.inject({ method: 'GET', url: '/api/me/progress', headers: { authorization: `Bearer ${alex}` } })).json();
    expect(progress).toMatchObject({ rank: 1, totalBooths: DEMO_BOOTHS.length });
    expect(progress.visitedBoothIds.sort()).toEqual([b(0).id, b(1).id].sort());
  });
});

describe('organizer', () => {
  it('requires the token', async () => {
    const { app } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/organizer/status', payload: { status: 'live' } })).statusCode).toBe(401);
  });

  it('moves the circle and the zone follows (geo query)', async () => {
    const { app } = setup();
    const anchor = getBoothSlot(b(10).slotId)!.anchor;
    await app.inject({ method: 'PUT', url: '/api/organizer/circle', headers: ORG, payload: { center: anchor, radius: 2 } });
    expect((await app.inject({ method: 'GET', url: '/api/game' })).json().inZoneBoothIds).toEqual([b(10).id]);
  });

  it('lists booths with QR codes, visits and zone', async () => {
    const { app } = setup();
    const res = (await app.inject({ method: 'GET', url: '/api/organizer/booths', headers: ORG })).json();
    expect(res[0]).toMatchObject({ id: b(0).id, code: boothCode(b(0).id, 's'), inZone: true, visits: 0 });
  });
});

describe('scheduled shrink', () => {
  it('shows a countdown and applies exactly once when due, even with concurrent readers', async () => {
    const due = live({ nextShrink: { at: new Date(Date.now() - 1000).toISOString(), factor: 0.5 } });
    const { app, docs } = setup(due);
    const [x, y] = await Promise.all([app.inject({ method: 'GET', url: '/api/game' }), app.inject({ method: 'GET', url: '/api/game' })]);
    for (const r of [x, y]) expect(r.json().state).toMatchObject({ round: 2, circle: { radius: OPENING_CIRCLE.radius / 2 } });
    const stored = docs('game').get('current') as { state: GameState };
    expect(stored.state.round).toBe(2);
    expect(stored.state.nextShrink).toBeUndefined();
  });

  it('is scheduled and cancelled by the organizer', async () => {
    const { app } = setup();
    const s = (await app.inject({ method: 'POST', url: '/api/organizer/schedule-shrink', headers: ORG, payload: { inSeconds: 120, factor: 0.6 } })).json();
    expect(s.nextShrink.factor).toBe(0.6);
    const c = (await app.inject({ method: 'DELETE', url: '/api/organizer/schedule-shrink', headers: ORG })).json();
    expect(c.nextShrink).toBeUndefined();
  });
});
