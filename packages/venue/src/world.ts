import { BOOTH_SLOTS } from './booths';
import { dist, distanceToObstacle, distanceToPath, seededRandom } from './helpers';
import type { Obstacle, PathSegment, Spot, Vec2, WorldData, Zone } from './types';

/**
 * Expo Park: MeetSpace's own conference world.
 *
 *              N (−z)
 *        ┌──── Keynote Stage ────┐
 *        │   benches   screen    │
 *  Networking │  Expo Street  │ Careers
 *   Garden    │ booths ‖ booths│ Corner
 *  (meetups)  │═══ cross path ═│ (booths)
 *        │      Spawn Plaza      │
 *        └──── entrance arch ────┘
 *              S (+z)
 */

const HALF = 48;

export const ZONES: Zone[] = [
  { id: 'plaza', name: 'Spawn Plaza', kind: 'plaza', center: [0, 33], size: [30, 20] },
  { id: 'expo', name: 'Expo Street', kind: 'expo', center: [0, 0], size: [26, 44] },
  { id: 'stage', name: 'Keynote Stage', kind: 'stage', center: [0, -36], size: [40, 18] },
  { id: 'garden', name: 'Networking Garden', kind: 'garden', center: [-32, 2], size: [24, 44] },
  { id: 'careers', name: 'Careers Corner', kind: 'careers', center: [32, 2], size: [24, 44] },
];

export const PATHS: PathSegment[] = [
  { from: [0, 46], to: [0, -28], width: 6 }, // main street, plaza → stage
  { from: [-44, 2], to: [44, 2], width: 4 }, // cross path, garden ↔ careers
  { from: [-13, 32], to: [13, 32], width: 5 }, // plaza promenade
  { from: [-32, -18], to: [-32, 22], width: 3 }, // garden walk
  { from: [32, -18], to: [32, 22], width: 3 }, // careers walk
];

const FIXED_OBSTACLES: Obstacle[] = [
  // Plaza
  { id: 'fountain', shape: 'cylinder', visual: 'fountain', at: [0, 28], radius: 2.6, height: 1.1 },
  { id: 'arch-w', shape: 'box', visual: 'arch', at: [-4.2, 46.2], size: [1, 4.5, 1] },
  { id: 'arch-e', shape: 'box', visual: 'arch', at: [4.2, 46.2], size: [1, 4.5, 1], label: 'MeetSpace Expo Park' },
  // Keynote stage
  { id: 'stage', shape: 'box', visual: 'stage', at: [0, -40], size: [22, 1.2, 8] },
  { id: 'screen', shape: 'box', visual: 'screen', at: [0, -44.4], size: [16, 7, 0.6] },
  ...[-10, -5, 5, 10].flatMap((x) => [
    { id: `bench-${x}-a`, shape: 'box' as const, visual: 'bench' as const, at: [x, -32] as Vec2, size: [3.2, 0.5, 0.7] as [number, number, number] },
    { id: `bench-${x}-b`, shape: 'box' as const, visual: 'bench' as const, at: [x, -29] as Vec2, size: [3.2, 0.5, 0.7] as [number, number, number] },
  ]),
  // Zone signs at path entrances
  { id: 'sign-expo', shape: 'cylinder', visual: 'sign', at: [4.6, 22.5], radius: 0.25, height: 2.6, label: 'Expo Street' },
  { id: 'sign-stage', shape: 'cylinder', visual: 'sign', at: [4.6, -25.5], radius: 0.25, height: 2.6, label: 'Keynote Stage' },
  { id: 'sign-garden', shape: 'cylinder', visual: 'sign', at: [-17, 5.2], radius: 0.25, height: 2.6, label: 'Networking Garden' },
  { id: 'sign-careers', shape: 'cylinder', visual: 'sign', at: [17, 5.2], radius: 0.25, height: 2.6, label: 'Careers Corner' },
  // Park boundary hedges
  { id: 'hedge-n', shape: 'box', visual: 'hedge', at: [0, -HALF + 0.5], size: [HALF * 2, 1.4, 1] },
  { id: 'hedge-s-w', shape: 'box', visual: 'hedge', at: [-26.5, HALF - 0.5], size: [43, 1.4, 1] },
  { id: 'hedge-s-e', shape: 'box', visual: 'hedge', at: [26.5, HALF - 0.5], size: [43, 1.4, 1] },
  { id: 'hedge-w', shape: 'box', visual: 'hedge', at: [-HALF + 0.5, 0], size: [1, 1.4, HALF * 2] },
  { id: 'hedge-e', shape: 'box', visual: 'hedge', at: [HALF - 0.5, 0], size: [1, 1.4, HALF * 2] },
  // Garden planters
  { id: 'planter-1', shape: 'cylinder', visual: 'planter', at: [-32, -8], radius: 1.2, height: 0.7 },
  { id: 'planter-2', shape: 'cylinder', visual: 'planter', at: [-32, 13], radius: 1.2, height: 0.7 },
];

export const SPOTS: Spot[] = [
  { id: 'mp-plaza-cafe-w', name: 'Plaza Café (West)', kind: 'cafe', zone: 'plaza', capacityPairs: 3, anchor: [-9, 37], demo: true },
  { id: 'mp-plaza-cafe-e', name: 'Plaza Café (East)', kind: 'cafe', zone: 'plaza', capacityPairs: 3, anchor: [9, 37] },
  { id: 'mp-garden-1', name: 'Garden Table 1', kind: 'table', zone: 'garden', capacityPairs: 2, anchor: [-38, -12], demo: true },
  { id: 'mp-garden-2', name: 'Garden Table 2', kind: 'table', zone: 'garden', capacityPairs: 2, anchor: [-26, -12] },
  { id: 'mp-garden-3', name: 'Garden Table 3', kind: 'table', zone: 'garden', capacityPairs: 2, anchor: [-38, -4] },
  { id: 'mp-garden-4', name: 'Garden Table 4', kind: 'table', zone: 'garden', capacityPairs: 2, anchor: [-26, -4] },
  { id: 'mp-garden-5', name: 'Garden Table 5', kind: 'table', zone: 'garden', capacityPairs: 2, anchor: [-38, 9] },
  { id: 'mp-garden-6', name: 'Garden Table 6', kind: 'table', zone: 'garden', capacityPairs: 2, anchor: [-26, 9] },
  { id: 'mp-garden-lounge', name: 'Garden Lounge', kind: 'lounge', zone: 'garden', capacityPairs: 4, anchor: [-38, 18], demo: true },
  { id: 'mp-garden-bench', name: 'Garden Bench', kind: 'bench', zone: 'garden', capacityPairs: 1, anchor: [-26, 18] },
  { id: 'mp-stage-side', name: 'Stage-side Lounge', kind: 'lounge', zone: 'stage', capacityPairs: 3, anchor: [-17, -31] },
];

export const SPAWN = { at: [0, 36] as Vec2, facingDeg: 270 };

/** Deterministic scatter of trees that keeps paths, booths, meetup points and zones clear. */
function generateTrees(): Obstacle[] {
  const rnd = seededRandom(20261109);
  const trees: Obstacle[] = [];
  const keepClear: Vec2[] = [...BOOTH_SLOTS.map((b) => b.anchor), ...SPOTS.map((s) => s.anchor), SPAWN.at];
  const insideRect = (p: Vec2, z: Zone, pad: number) =>
    Math.abs(p[0] - z.center[0]) < z.size[0] / 2 + pad && Math.abs(p[1] - z.center[1]) < z.size[1] / 2 + pad;
  const noTreeZones = ZONES.filter((z) => z.kind === 'plaza' || z.kind === 'expo' || z.kind === 'stage');

  for (let i = 0; i < 600 && trees.length < 70; i++) {
    const p: Vec2 = [(rnd() * 2 - 1) * (HALF - 4), (rnd() * 2 - 1) * (HALF - 4)];
    if (noTreeZones.some((z) => insideRect(p, z, 1))) continue;
    if (PATHS.some((path) => distanceToPath(p, path) < 2)) continue;
    if (keepClear.some((q) => dist(p, q) < 5)) continue;
    if (FIXED_OBSTACLES.some((o) => distanceToObstacle(p, o) < 2.5)) continue;
    if (trees.some((t) => dist(p, t.at) < 4)) continue;
    trees.push({ id: `tree-${trees.length + 1}`, shape: 'cylinder', visual: 'tree', at: [round1(p[0]), round1(p[1])], radius: 0.4, height: 2 + rnd() * 2 });
  }
  return trees;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export const WORLD: WorldData = {
  name: 'MeetSpace Expo Park',
  size: [HALF * 2, HALF * 2],
  spawn: SPAWN,
  zones: ZONES,
  paths: PATHS,
  obstacles: [...FIXED_OBSTACLES, ...generateTrees()],
  spots: SPOTS,
};

export function zoneAt(p: Vec2): Zone | undefined {
  return ZONES.find((z) => Math.abs(p[0] - z.center[0]) <= z.size[0] / 2 && Math.abs(p[1] - z.center[1]) <= z.size[1] / 2);
}
