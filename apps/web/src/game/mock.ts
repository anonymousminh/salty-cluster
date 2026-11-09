import { useEffect, useState } from 'react';
import { ALL_SPOTS, type Availability, type Spot } from '@meetspace/venue';

/**
 * Stand-ins for the API until `GET /spots/availability` and `GET /spots/suggest` exist.
 * Same shapes as the agreed contract, so swapping to real fetches is a one-line change.
 */

const STATES: Availability[] = ['open', 'open', 'open', 'busy', 'full'];

function randomAvailability(seed: number): Record<string, Availability> {
  const out: Record<string, Availability> = {};
  ALL_SPOTS.forEach((s, i) => {
    // Demo spots stay open so the demo always has somewhere to go.
    out[s.id] = s.demo ? 'open' : STATES[(i * 7 + seed * 3) % STATES.length]!;
  });
  return out;
}

/** Availability that changes every `intervalMs`, like the real 10 s-cached endpoint would. */
export function useMockAvailability(intervalMs = 5000): Record<string, Availability> {
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setSeed((s) => s + 1), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return randomAvailability(seed);
}

export interface SpotSuggestion {
  spotId: string;
  startsAt: string; // ISO time
}

/** Mimics `GET /spots/suggest?matchId=`: up to 3 open spots, demo spots first, next 15-min slot. */
export function mockSuggest(availability: Record<string, Availability>, now = new Date()): SpotSuggestion[] {
  const slot = new Date(now);
  slot.setMinutes(Math.ceil((slot.getMinutes() + 5) / 15) * 15, 0, 0);
  const score = (s: Spot) => (s.demo ? 2 : 0) + (availability[s.id] === 'open' ? 1 : 0);
  return ALL_SPOTS.filter((s) => availability[s.id] !== 'full')
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3)
    .map((s) => ({ spotId: s.id, startsAt: slot.toISOString() }));
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
