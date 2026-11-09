/**
 * End-to-end game against a REAL Elasticsearch (CI runs it with an ES service container).
 * Proves the geo_distance circle, the visit aggregation + underdog bonus, the leaderboard
 * aggregation, duplicate/QR/quiz checks and the scheduled shrink work together.
 * WARNING: resets all indices.
 */
import assert from 'node:assert/strict';
import { BASE_XP, DWELL_SECONDS, boothQuiz, getBoothSlot, type Booth } from '@meetspace/venue';
import { loadConfig } from '../src/config';
import { createEsClient } from '../src/es/client';
import { buildApp } from '../src/app';
import { setupIndices } from './setup-es';
import { seedBooths } from './seed';

async function main() {
  await setupIndices({ reset: true });
  const codes = new Map((await seedBooths()).map((b) => [b.id, b.code]));
  const config = loadConfig();
  const app = buildApp({ es: createEsClient(config), config, logger: false });
  const org = { 'x-organizer-token': config.organizerToken };
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object, headers?: Record<string, string>) => {
    const res = await app.inject({ method, url, payload, headers });
    return { status: res.statusCode, body: res.json() };
  };

  const booths: Booth[] = (await call('GET', '/api/booths')).body;
  assert.equal(booths.length, codes.size);
  const [b0, b1, b2] = booths as [Booth, Booth, Booth];
  const answer = (b: Booth) => boothQuiz(b, booths).answerIndex;

  // Circle of 8 m around the first expo slot: that booth plus its neighbour 7 m away.
  const a0 = getBoothSlot(b0.slotId)!.anchor;
  assert.equal((await call('PUT', '/api/organizer/circle', { center: a0, radius: 8 }, org)).status, 200);
  assert.equal((await call('POST', '/api/organizer/status', { status: 'live' }, org)).status, 200);
  const zone: string[] = (await call('GET', '/api/game')).body.inZoneBoothIds;
  const expected = booths.filter((b) => Math.hypot(getBoothSlot(b.slotId)!.anchor[0] - a0[0], getBoothSlot(b.slotId)!.anchor[1] - a0[1]) <= 8).map((b) => b.id);
  assert.deepEqual(zone.sort(), expected.sort(), 'geo_distance zone matches world-metre distances');

  const join = async (name: string) => (await call('POST', '/api/join', { name })).body.sessionId as string;
  const checkin = (s: string, b: Booth, extra: object = {}) =>
    call('POST', `/api/booths/${b.id}/checkin`, { dwellMs: DWELL_SECONDS * 1000, quizAnswer: answer(b), ...extra }, { authorization: `Bearer ${s}` });

  const alice = await join('Alice');
  const bob = await join('Bob');
  const r1 = await checkin(alice, b0);
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.base, BASE_XP);
  assert.equal((await checkin(alice, b0)).status, 409);
  assert.equal((await checkin(bob, b0, { quizAnswer: (answer(b0) + 1) % 3 })).body.reason, 'wrong_answer');
  assert.equal((await checkin(bob, b0, { dwellMs: undefined, code: 'nope' })).body.reason, 'bad_code');
  const qr = await checkin(bob, b0, { dwellMs: undefined, code: codes.get(b0.id) });
  assert.equal(qr.status, 200, JSON.stringify(qr.body));

  const outside = booths.find((b) => !zone.includes(b.id))!;
  assert.equal((await checkin(bob, outside)).body.reason, 'in_storm');

  // Grow the zone to everything: a quiet booth now pays an underdog bonus (aggregation).
  await call('PUT', '/api/organizer/circle', { center: [0, 0], radius: 75 }, org);
  const quiet = await checkin(bob, b2);
  assert.ok(quiet.body.bonus > 0, `expected underdog bonus, got ${JSON.stringify(quiet.body)}`);

  const lb = (await call('GET', '/api/leaderboard', undefined, { authorization: `Bearer ${alice}` })).body;
  assert.equal(lb.entries[0].name, 'Bob');
  assert.equal(lb.me.name, 'Alice');
  const stats = (await call('GET', '/api/booths/stats')).body;
  assert.equal(stats[b0.id].visits, 2);
  assert.equal(stats[b1.id].visits, 0);

  // Scheduled shrink fires once it is due.
  await call('POST', '/api/organizer/schedule-shrink', { inSeconds: 10, factor: 0.5 }, org);
  await new Promise((r) => setTimeout(r, 10_500));
  const after = (await call('GET', '/api/game')).body.state;
  assert.equal(after.circle.radius, 37.5);
  assert.equal(after.round, 2);

  const ostats = (await call('GET', '/api/organizer/stats', undefined, org)).body;
  assert.equal(ostats.checkins, 3);
  assert.equal(ostats.players, 2);

  await app.close();
  console.log('✓ smoke test passed against real Elasticsearch');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
