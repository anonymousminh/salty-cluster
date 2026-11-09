import { describe, expect, it } from 'vitest';
import {
  ALL_SPOTS,
  BASE_XP,
  BOOTH_SLOTS,
  CHECKIN_RADIUS,
  DEMO_SPOTS,
  MAX_BONUS,
  WORLD,
  boothFront,
  boothQuiz,
  boothXp,
  careerFit,
  computeBoothStats,
  distanceToObstacle,
  getBoothSlot,
  isBounty,
  nearestBooth,
  underdogBonus,
  validateWorld,
  zoneAt,
  type Booth,
} from '../src';

const booths: Booth[] = BOOTH_SLOTS.slice(0, 4).map((s, i) => ({
  id: `booth-${i}`,
  slotId: s.id,
  company: `Co ${i}`,
  color: '#fff',
  tagline: `Tagline ${i}`,
}));

describe('Expo Park world', () => {
  it('is valid: spots, booths and spawn are inside the park and clear of obstacles and paths', () => {
    expect(validateWorld(WORLD, BOOTH_SLOTS)).toEqual([]);
  });

  it('has the zones, 16 booth slots, meetup points and some trees', () => {
    expect(WORLD.zones.map((z) => z.kind).sort()).toEqual(['careers', 'expo', 'garden', 'plaza', 'stage']);
    expect(BOOTH_SLOTS).toHaveLength(16);
    expect(ALL_SPOTS.length).toBeGreaterThanOrEqual(10);
    expect(DEMO_SPOTS.length).toBe(3);
    expect(WORLD.obstacles.filter((o) => o.visual === 'tree').length).toBeGreaterThan(20);
  });

  it('spawns in the plaza', () => {
    expect(zoneAt(WORLD.spawn.at)?.kind).toBe('plaza');
  });

  it('keeps every booth front standable (not inside an obstacle)', () => {
    for (const slot of BOOTH_SLOTS) {
      const front = boothFront(slot);
      for (const o of WORLD.obstacles) expect(distanceToObstacle(front, o), `${slot.id} vs ${o.id}`).toBeGreaterThan(0.5);
    }
  });
});

describe('walk-up check-in', () => {
  it('finds the booth whose front you are standing at', () => {
    const slot = getBoothSlot(booths[1]!.slotId)!;
    const near = nearestBooth(boothFront(slot), booths);
    expect(near?.item.id).toBe('booth-1');
    expect(near!.distance).toBeLessThan(0.01);
  });

  it('returns nothing when you are out of range', () => {
    const slot = getBoothSlot(booths[0]!.slotId)!;
    expect(nearestBooth([slot.anchor[0] + 40, slot.anchor[1]], booths, CHECKIN_RADIUS)).toBeNull();
  });

  it('builds a deterministic 3-option quiz with the real tagline as the answer', () => {
    const q = boothQuiz(booths[2]!, booths);
    expect(q.options).toHaveLength(3);
    expect(q.options[q.answerIndex]).toBe('Tagline 2');
    expect(new Set(q.options).size).toBe(3);
    expect(boothQuiz(booths[2]!, booths)).toEqual(q);
  });
});

describe('underdog scoring', () => {
  it('gives the full bonus to an unvisited booth and none at or above average', () => {
    expect(underdogBonus(0, 10)).toBe(MAX_BONUS);
    expect(underdogBonus(10, 10)).toBe(0);
    expect(underdogBonus(25, 10)).toBe(0);
    expect(boothXp(0, 10)).toBe(BASE_XP + MAX_BONUS);
  });

  it('is monotonic: fewer visits never earns less', () => {
    let prev = Infinity;
    for (let v = 0; v <= 20; v++) {
      const b = underdogBonus(v, 12);
      expect(b).toBeLessThanOrEqual(prev);
      prev = b;
    }
  });

  it('handles the start of the event (no visits anywhere) without dividing by zero', () => {
    expect(underdogBonus(0, 0)).toBe(0);
    expect(computeBoothStats({ a: 0, b: 0 }).a!.bonus).toBe(0);
  });

  it('flags quiet booths as bounties', () => {
    const stats = computeBoothStats({ busy: 30, mid: 15, quiet: 1 });
    expect(isBounty(stats.quiet)).toBe(true);
    expect(isBounty(stats.busy)).toBe(false);
  });
});

describe('career fit', () => {
  it('matches hiring roles to the attendee profile', () => {
    const fit = careerFit({ lookingFor: ['ML engineer role'], skills: ['Python', 'PyTorch'] }, ['ML Engineer', 'Sales Lead'], ['python']);
    expect(fit).toEqual(['ML Engineer', 'python']);
    expect(careerFit(undefined, ['ML Engineer'])).toEqual([]);
  });
});
