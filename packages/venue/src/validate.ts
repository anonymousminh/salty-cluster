import { KIOSK_SIZE, type BoothSlot } from './booths';
import { dist, distanceToObstacle, distanceToPath } from './helpers';
import type { WorldData } from './types';

export const BOOTH_MIN_SPACING = 4;
export const CLEARANCE = 1.2;

/** Returns human-readable problems with the world data; empty means valid. */
export function validateWorld(world: WorldData, slots: BoothSlot[]): string[] {
  const problems: string[] = [];
  const [w, d] = world.size;
  const inBounds = ([x, z]: [number, number], pad = 2) => Math.abs(x) < w / 2 - pad && Math.abs(z) < d / 2 - pad;
  const ids = new Set<string>();
  const unique = (id: string) => {
    if (ids.has(id)) problems.push(`duplicate id ${id}`);
    ids.add(id);
  };

  for (const s of world.spots) {
    unique(s.id);
    if (!/^mp-[a-z0-9-]+$/.test(s.id)) problems.push(`${s.id}: spot ids must look like mp-some-name`);
    if (s.capacityPairs < 1) problems.push(`${s.id}: capacity must be ≥ 1`);
    if (!inBounds(s.anchor)) problems.push(`${s.id}: outside the park`);
    const hit = world.obstacles.find((o) => distanceToObstacle(s.anchor, o) < CLEARANCE);
    if (hit) problems.push(`${s.id}: too close to obstacle ${hit.id}`);
  }

  const kioskRadius = Math.hypot(KIOSK_SIZE[0], KIOSK_SIZE[2]) / 2;
  for (const b of slots) {
    unique(b.id);
    if (!inBounds(b.anchor)) problems.push(`${b.id}: outside the park`);
    const hit = world.obstacles.find((o) => distanceToObstacle(b.anchor, o) < kioskRadius + 0.5);
    if (hit) problems.push(`${b.id}: kiosk overlaps obstacle ${hit.id}`);
    const onPath = world.paths.find((p) => distanceToPath(b.anchor, p) < kioskRadius);
    if (onPath) problems.push(`${b.id}: kiosk blocks a path`);
    for (const o of slots) {
      if (o.id > b.id && dist(o.anchor, b.anchor) < BOOTH_MIN_SPACING) problems.push(`${b.id}: too close to booth ${o.id}`);
    }
    for (const s of world.spots) {
      if (dist(s.anchor, b.anchor) < BOOTH_MIN_SPACING) problems.push(`${b.id}: too close to meetup point ${s.id}`);
    }
  }

  for (const o of world.obstacles) unique(o.id);
  if (!inBounds(world.spawn.at)) problems.push('spawn: outside the park');
  const spawnHit = world.obstacles.find((o) => distanceToObstacle(world.spawn.at, o) < 2);
  if (spawnHit) problems.push(`spawn: too close to ${spawnHit.id}`);
  return problems;
}
