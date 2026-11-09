/**
 * Booth quest scoring, shared by the server (awards XP) and the map (previews XP).
 *
 * Every first visit to a booth is worth BASE_XP. Booths with fewer visits than the
 * average booth also carry an "underdog bonus" of up to MAX_BONUS XP, which pushes
 * attendees towards quiet sponsors. The bonus is computed and locked in at scan time.
 */
export const BASE_XP = 10;
export const MAX_BONUS = 25;
/** A booth whose current bonus is at least this is shown as a bounty on the map. */
export const BOUNTY_THRESHOLD = 15;

export interface BoothStat {
  visits: number;
  bonus: number;
}
export type BoothStats = Record<string, BoothStat>;

export function underdogBonus(visits: number, avgVisits: number): number {
  const denom = Math.max(avgVisits, 1);
  const ratio = Math.min(1, Math.max(0, (avgVisits - visits) / denom));
  return Math.round(MAX_BONUS * ratio);
}

export function averageVisits(visits: number[]): number {
  if (visits.length === 0) return 0;
  return visits.reduce((a, b) => a + b, 0) / visits.length;
}

/** Total XP a first visit to this booth would award right now. */
export function boothXp(visits: number, avgVisits: number): number {
  return BASE_XP + underdogBonus(visits, avgVisits);
}

/** Recompute bonuses for every booth from raw visit counts. */
export function computeBoothStats(visitsByBooth: Record<string, number>): BoothStats {
  const avg = averageVisits(Object.values(visitsByBooth));
  const out: BoothStats = {};
  for (const [id, visits] of Object.entries(visitsByBooth)) out[id] = { visits, bonus: underdogBonus(visits, avg) };
  return out;
}

export function isBounty(stat: BoothStat | undefined): boolean {
  return !!stat && stat.bonus >= BOUNTY_THRESHOLD;
}
