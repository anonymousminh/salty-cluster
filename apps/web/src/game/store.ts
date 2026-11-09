import { create } from 'zustand';
import type { Vec2 } from '@meetspace/venue';

export type Phase = 'lobby' | 'playing';

export interface Waypoint {
  kind: 'spot' | 'booth';
  id: string;
}

export interface GameState {
  phase: Phase;
  /** Player ground position (x, z), published ~10 Hz by the player controller. */
  playerPos: Vec2;
  /** Camera heading in plan degrees (0 = +x/east, 90 = +z/south). */
  cameraHeadingDeg: number;
  waypoint: Waypoint | null;
  /** Booth whose check-in radius the player is standing in. */
  nearBoothId: string | null;
  /** Seconds spent near each booth (resets when you leave its radius). */
  dwell: Record<string, number>;
  /** Booth card currently open (freezes movement). */
  openBoothId: string | null;
  /** Meetup point you have arrived at (for the "you're here" toast). */
  arrivedSpotId: string | null;
  /** Bumped to ask the camera to snap behind the player (e.g. after entering). */
  cameraResetToken: number;
  /** Demo/dev: move the player here on the next frame. */
  teleportTo: Vec2 | null;

  setPhase: (p: Phase) => void;
  setPlayer: (pos: Vec2) => void;
  setCameraHeading: (deg: number) => void;
  setWaypoint: (wp: Waypoint | null) => void;
  setNearBooth: (id: string | null) => void;
  addDwell: (id: string, seconds: number) => void;
  resetDwell: (id: string) => void;
  openBooth: (id: string | null) => void;
  setArrived: (id: string | null) => void;
  resetCamera: () => void;
  teleport: (to: Vec2 | null) => void;
}

export const useGame = create<GameState>((set) => ({
  phase: 'lobby',
  playerPos: [0, 0],
  cameraHeadingDeg: 270,
  waypoint: null,
  nearBoothId: null,
  dwell: {},
  openBoothId: null,
  arrivedSpotId: null,
  cameraResetToken: 0,
  teleportTo: null,

  setPhase: (phase) => set({ phase }),
  setPlayer: (playerPos) => set({ playerPos }),
  setCameraHeading: (cameraHeadingDeg) => set({ cameraHeadingDeg }),
  setWaypoint: (waypoint) => set({ waypoint, arrivedSpotId: null }),
  setNearBooth: (nearBoothId) => set((s) => (s.nearBoothId === nearBoothId ? s : { nearBoothId })),
  addDwell: (id, seconds) => set((s) => ({ dwell: { ...s.dwell, [id]: (s.dwell[id] ?? 0) + seconds } })),
  resetDwell: (id) => set((s) => (s.dwell[id] ? { dwell: { ...s.dwell, [id]: 0 } } : s)),
  openBooth: (openBoothId) => set({ openBoothId }),
  setArrived: (arrivedSpotId) => set({ arrivedSpotId }),
  resetCamera: () => set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
  teleport: (teleportTo) => set({ teleportTo }),
}));

/** Movement is frozen while not playing or while a booth card is open. */
export function isInputLocked(s: Pick<GameState, 'phase' | 'openBoothId'>): boolean {
  return s.phase !== 'playing' || s.openBoothId !== null;
}
