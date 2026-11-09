import { SPOTS } from './world';
import type { Spot } from './types';

export * from './types';
export * from './helpers';
export * from './world';
export * from './booths';
export * from './interaction';
export * from './scoring';
export * from './quest';
export * from './validate';
export * from './battle';
export * from './api';
export * from './sponsors';
export * from './realtime';

/** Every bookable meetup point. Seed `spots`/`slots` tables from this list. */
export const ALL_SPOTS: Spot[] = SPOTS;

/** The minimal set used in the hackathon demo. */
export const DEMO_SPOTS: Spot[] = ALL_SPOTS.filter((s) => s.demo);

const byId = new Map(ALL_SPOTS.map((s) => [s.id, s]));

export function getSpot(id: string): Spot | undefined {
  return byId.get(id);
}

export function totalPairCapacity(spots: Spot[] = ALL_SPOTS): number {
  return spots.reduce((sum, s) => sum + s.capacityPairs, 0);
}
