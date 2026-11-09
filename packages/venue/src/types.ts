/**
 * Shared world contract for MeetSpace — our own virtual conference map ("Expo Park").
 *
 * Coordinates are world meters on the ground plane:
 *   origin = centre of the park, +x = east, +z = south (towards the spawn plaza), +y = up.
 * Angles are degrees measured from +x towards +z (0 = facing east, 90 = facing south).
 */

export type Vec2 = [x: number, z: number];
export type Vec3 = [x: number, y: number, z: number];

export type SpotKind = 'table' | 'lounge' | 'bench' | 'cafe';
export type Availability = 'open' | 'busy' | 'full';

export type ZoneKind = 'plaza' | 'expo' | 'stage' | 'garden' | 'careers';

export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  /** Rectangle centre and size (x, z). */
  center: Vec2;
  size: Vec2;
}

/** A meetup point: where matched attendees go to meet. */
export interface Spot {
  /** Stable id shared with the API (`spots.id`). Format: mp-<slug>. */
  id: string;
  name: string;
  kind: SpotKind;
  zone: ZoneKind;
  /** How many pairs can meet here at the same time (one 15-min slot). */
  capacityPairs: number;
  anchor: Vec2;
  /** Part of the minimal hackathon demo set. */
  demo?: boolean;
}

export type ObstacleVisual = 'fountain' | 'stage' | 'screen' | 'bench' | 'tree' | 'hedge' | 'sign' | 'planter' | 'arch';

/** Solid things the player collides with. */
export type Obstacle =
  | { id: string; shape: 'box'; visual: ObstacleVisual; at: Vec2; size: Vec3; rotDeg?: number; label?: string }
  | { id: string; shape: 'cylinder'; visual: ObstacleVisual; at: Vec2; radius: number; height: number; label?: string };

export interface PathSegment {
  from: Vec2;
  to: Vec2;
  width: number;
}

export interface WorldData {
  name: string;
  /** Park size (x, z), centred on the origin. */
  size: Vec2;
  spawn: { at: Vec2; facingDeg: number };
  zones: Zone[];
  paths: PathSegment[];
  obstacles: Obstacle[];
  spots: Spot[];
}
