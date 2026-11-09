import type { MotionCode } from '@meetspace/venue';

/**
 * Mutable, per-frame state shared between the network layer and the 3D scene. It lives
 * outside React and zustand on purpose: positions change several times a second for dozens
 * of players, and none of that should trigger a React render.
 */

export interface RemoteState {
  /** Latest position from the server (meters), heading in plan degrees (0 = +x, 90 = +z). */
  x: number;
  z: number;
  h: number;
  m: MotionCode;
}

/** Players near you right now (the server sends only the nearest few). */
export const remotes = new Map<string, RemoteState>();

/** Where you are, written every frame by the player controller and sent to the server at 10 Hz. */
export const self: { x: number; z: number; h: number; m: MotionCode; ready: boolean } = { x: 0, z: 0, h: 0, m: 0, ready: false };
