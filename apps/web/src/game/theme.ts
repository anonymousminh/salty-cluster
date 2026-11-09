import type { Availability, ZoneKind } from '@meetspace/venue';

export const BRAND = '#7c3aed';

export const AVAILABILITY_COLOR: Record<Availability | 'unknown', string> = {
  open: '#16a34a',
  busy: '#f59e0b',
  full: '#dc2626',
  unknown: '#64748b',
};

export const AVAILABILITY_LABEL: Record<Availability | 'unknown', string> = {
  open: 'Open',
  busy: 'Filling up',
  full: 'Full',
  unknown: '—',
};

/** Quest / HUD accents. */
export const QUEST = {
  bounty: '#fbbf24',
  waypoint: '#22d3ee',
  meetup: '#a78bfa',
  you: '#f472b6',
  visited: '#94a3b8',
  route: '#22d3ee',
};

/** Bright, toy-like park palette (original look). */
export const WORLD_COLORS = {
  skyTop: '#7dd3fc',
  skyBottom: '#e0f2fe',
  grass: '#86d97b',
  grassDark: '#5fbf5a',
  path: '#f3e3c3',
  pathEdge: '#e2c99a',
  water: '#38bdf8',
  stone: '#e2e8f0',
  wood: '#b07a4f',
  hedge: '#3f9d4a',
  leaf: ['#4ade80', '#22c55e', '#86efac', '#16a34a'],
  trunk: '#8b5a3c',
};

export const ZONE_TINT: Record<ZoneKind, string> = {
  plaza: '#fde68a',
  expo: '#bfdbfe',
  stage: '#fecaca',
  garden: '#bbf7d0',
  careers: '#ddd6fe',
};
