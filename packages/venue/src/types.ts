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

// === Booth Demo Experience Types ===

export type DemoContentType = 'text' | 'image' | 'video' | 'screenshots' | 'animated' | 'interactive';

export interface DemoSlide {
  id: string;
  type: DemoContentType;
  title?: string;
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  screenshots?: string[];
  animation?: 'fade' | 'slide' | 'zoom' | 'typewriter' | 'none';
  duration?: number; // ms for this slide, if auto-advance
  background?: string;
  bullets?: string[];
  callToAction?: string;
}

export interface DemoQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface DemoPointsConfig {
  boothVisit: number;
  demoComplete: number;
  correctQuizAnswer: number;
  firstTimeCompletionBonus: number;
}

export interface BoothDemoExperience {
  boothId: string;
  companyName: string;
  companyLogo?: string;
  productName: string;
  productDescription: string;
  boothDescription: string;
  category: string;
  duration: number; // ms, default 30000
  slides: DemoSlide[];
  quiz: DemoQuizQuestion[];
  pointsConfig: DemoPointsConfig;
}

export interface DemoProgressEntry {
  boothId: string;
  visited: boolean;
  visitedAt?: number;
  demoStartedAt?: number;
  demoCompleted: boolean;
  demoCompletedAt?: number;
  quizAnswered: boolean;
  quizCorrect: boolean;
  quizAnswers: number[];
  pointsEarned: number;
  scoreBreakdown: {
    boothVisit: number;
    demoComplete: number;
    quizBonus: number;
    firstTimeBonus: number;
  };
}

export interface PlayerDemoStats {
  boothsVisited: number;
  demosCompleted: number;
  totalPoints: number;
  quizzesCorrect: number;
  completionPercentage: number;
  totalBooths: number;
}

export interface DemoLeaderboardEntry {
  rank: number;
  name: string;
  avatar?: string;
  totalPoints: number;
  boothsVisited: number;
  demosCompleted: number;
  isMe?: boolean;
}

export interface DemoLeaderboard {
  entries: DemoLeaderboardEntry[];
  me?: DemoLeaderboardEntry;
}
