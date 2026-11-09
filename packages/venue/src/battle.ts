import { dist } from './helpers';
import { BASE_XP, underdogBonus } from './scoring';
import type { Vec2 } from './types';

/**
 * Battle-royale layer on top of the booth quest.
 *
 * The organizer controls a circle (the "safe zone") over Expo Park. Booths inside it
 * pay XP as usual; booths outside are "in the storm" and pay nothing. The circle
 * shrinks each round, optionally toward a point, which steers the crowd to where the
 * conference needs it. Coordinates are world metres (see types.ts).
 */
export interface Circle {
  center: Vec2;
  radius: number;
}

export type GameStatus = 'lobby' | 'live' | 'ended';

export interface ScheduledShrink {
  /** ISO time when the circle shrinks. */
  at: string;
  /** Fraction of the radius to keep (0.7 = 30% smaller). */
  factor: number;
  target?: Vec2;
}

export interface GameState {
  status: GameStatus;
  circle: Circle;
  round: number;
  updatedAt: string;
  /** Next automatic shrink, shown to players as a countdown. */
  nextShrink?: ScheduledShrink;
}

/** The opening circle covers the whole park. */
export const OPENING_CIRCLE: Circle = { center: [0, 0], radius: 75 };
export const MIN_RADIUS = 6;

export function insideCircle(p: Vec2, c: Circle): boolean {
  return dist(p, c.center) <= c.radius;
}

/**
 * Shrink by `factor`, moving toward `target` if given. The new circle always stays
 * inside the old one (the centre moves at most old radius minus new radius).
 */
export function shrinkCircle(c: Circle, factor: number, target?: Vec2, minRadius = MIN_RADIUS): Circle {
  const f = Math.min(Math.max(factor, 0.1), 1);
  const radius = Math.max(minRadius, c.radius * f);
  if (!target) return { center: c.center, radius };
  const maxMove = c.radius - radius;
  const d = dist(c.center, target);
  const t = d === 0 ? 0 : Math.min(1, maxMove / d);
  return { center: [c.center[0] + (target[0] - c.center[0]) * t, c.center[1] + (target[1] - c.center[1]) * t], radius };
}

/** XP for a first visit: base + underdog bonus inside the zone, nothing in the storm. */
export function checkinXp(input: { visits: number; avgVisits: number; inZone: boolean }): { base: number; bonus: number; xp: number } {
  if (!input.inZone) return { base: 0, bonus: 0, xp: 0 };
  const bonus = underdogBonus(input.visits, input.avgVisits);
  return { base: BASE_XP, bonus, xp: BASE_XP + bonus };
}

/**
 * Expo Park mapped onto real coordinates, so Elasticsearch can store booths as geo_points
 * and the circle as a geo_distance query. Any origin works; distances stay in metres.
 */
export const GEO_ORIGIN = { lat: 40.7608, lon: -111.891 };
const M_PER_DEG_LAT = 110_540;
const mPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

export function worldToGeo([x, z]: Vec2, origin = GEO_ORIGIN): { lat: number; lon: number } {
  // +z is south, so it lowers the latitude.
  return { lat: origin.lat - z / M_PER_DEG_LAT, lon: origin.lon + x / mPerDegLon(origin.lat) };
}

export function geoToWorld(p: { lat: number; lon: number }, origin = GEO_ORIGIN): Vec2 {
  return [(p.lon - origin.lon) * mPerDegLon(origin.lat), (origin.lat - p.lat) * M_PER_DEG_LAT];
}
