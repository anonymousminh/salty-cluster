import type { Obstacle, PathSegment, Vec2 } from './types';

/** Shortest distance from point p to segment ab. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const [px, pz] = p;
  const [ax, az] = a;
  const [bx, bz] = b;
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Distance from a point to the outside of an obstacle's footprint
 * (negative = inside). Boxes honour their rotation.
 */
export function distanceToObstacle(p: Vec2, o: Obstacle): number {
  if (o.shape === 'cylinder') return dist(p, o.at) - o.radius;
  const r = ((o.rotDeg ?? 0) * Math.PI) / 180;
  // Rotate the point into the box's local frame.
  const dx = p[0] - o.at[0];
  const dz = p[1] - o.at[1];
  const lx = dx * Math.cos(r) + dz * Math.sin(r);
  const lz = -dx * Math.sin(r) + dz * Math.cos(r);
  const qx = Math.abs(lx) - o.size[0] / 2;
  const qz = Math.abs(lz) - o.size[2] / 2;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  return outside > 0 ? outside : Math.max(qx, qz);
}

export function distanceToPath(p: Vec2, path: PathSegment): number {
  return distanceToSegment(p, path.from, path.to) - path.width / 2;
}

/** Small deterministic PRNG (mulberry32) so generated scenery is identical everywhere. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plan angle (degrees, 0 = +x, 90 = +z) from a to b. */
export function angleTo(a: Vec2, b: Vec2): number {
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
}
