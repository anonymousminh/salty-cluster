import type { GameState } from './battle';
import type { Vec2 } from './types';

/** Request/response shapes of the game API (apps/api), shared by the game, the console and the server. */

export interface JoinRequest {
  name: string;
  role?: string;
  lookingFor?: string[];
  skills?: string[];
  color?: string;
  showOnLeaderboard?: boolean;
}

/** `sessionId` is a secret bearer token kept by the browser; the server stores only a hash. */
export interface Session {
  sessionId: string;
  name: string;
}

/**
 * Two ways to prove a visit:
 *  - in the 3D game: dwell near the kiosk (`dwellMs`) + quiz answer
 *  - at a physical booth: the code from the booth's QR sticker + quiz answer
 */
export interface CheckinRequest {
  quizAnswer: number;
  dwellMs?: number;
  code?: string;
}

export interface CheckinResponse {
  xpGained: number;
  base: number;
  bonus: number;
  totalXp: number;
}

export type NotEligibleReason = 'dwell_too_short' | 'wrong_answer' | 'in_storm' | 'bad_code' | 'game_not_live';

export interface ApiError {
  error: string;
  reason?: NotEligibleReason;
  message: string;
}

/** `GET /api/game`: the circle, plus which booths are inside it right now. */
export interface GameView {
  state: GameState;
  inZoneBoothIds: string[];
}

export interface OrganizerBooth {
  id: string;
  company: string;
  slotId: string;
  anchor: Vec2;
  code: string;
  visits: number;
  bonus: number;
  inZone: boolean;
}

export interface OrganizerStats {
  checkins: number;
  players: number;
  totalXp: number;
  bonusShare: number | null;
}
