import { describe, expect, it } from 'vitest';
import { BASE_XP, MAX_BONUS, BOOTH_SLOTS, DEMO_BOOTHS, OPENING_CIRCLE, checkinXp, dist, geoToWorld, insideCircle, shrinkCircle, worldToGeo } from '../src';

describe('battle royale circle', () => {
  it('opens over every booth', () => {
    for (const s of BOOTH_SLOTS) expect(insideCircle(s.anchor, OPENING_CIRCLE)).toBe(true);
  });

  it('shrinks toward a target and stays inside the old circle', () => {
    const next = shrinkCircle({ center: [0, 0], radius: 40 }, 0.5, [100, 0]);
    expect(next.radius).toBe(20);
    expect(next.center).toEqual([20, 0]);
    expect(dist(next.center, [0, 0]) + next.radius).toBeLessThanOrEqual(40);
  });

  it('never shrinks below the minimum radius', () => {
    expect(shrinkCircle({ center: [0, 0], radius: 7 }, 0.1).radius).toBe(6);
  });

  it('pays nothing in the storm and base + underdog bonus in the zone', () => {
    expect(checkinXp({ visits: 0, avgVisits: 10, inZone: false }).xp).toBe(0);
    expect(checkinXp({ visits: 0, avgVisits: 10, inZone: true })).toEqual({ base: BASE_XP, bonus: MAX_BONUS, xp: BASE_XP + MAX_BONUS });
    expect(checkinXp({ visits: 20, avgVisits: 10, inZone: true }).bonus).toBe(0);
  });

  it('round-trips world metres through geo coordinates', () => {
    const w = geoToWorld(worldToGeo([27, -12]));
    expect(w[0]).toBeCloseTo(27, 3);
    expect(w[1]).toBeCloseTo(-12, 3);
  });

  it('assigns every booth slot a sponsor', () => {
    expect(DEMO_BOOTHS).toHaveLength(BOOTH_SLOTS.length);
    expect(new Set(DEMO_BOOTHS.map((b) => b.id)).size).toBe(DEMO_BOOTHS.length);
  });
});
