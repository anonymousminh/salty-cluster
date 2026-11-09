import { boothFront, getBoothSlot, type Booth } from './booths';
import { dist, seededRandom } from './helpers';
import type { Vec2 } from './types';

/**
 * Walk-up booth check-in rules (virtual conference).
 *
 * A visit counts when the attendee (1) walks within CHECKIN_RADIUS of the kiosk front,
 * (2) stays near it for DWELL_SECONDS (talking to the booth), and (3) answers the booth's
 * quick question. The server re-checks dwell from presence pings, so the client values
 * are for UX only.
 */
export const CHECKIN_RADIUS = 4.5;
export const DWELL_SECONDS = 6;
/** Re-try delay after a wrong quiz answer. */
export const QUIZ_RETRY_SECONDS = 5;
/** You have "arrived" at a meetup point within this distance. */
export const ARRIVE_RADIUS = 3.5;

export interface Nearest<T> {
  item: T;
  distance: number;
}

/** Nearest booth whose front is within `radius` of `pos`. */
export function nearestBooth(pos: Vec2, booths: Booth[], radius = CHECKIN_RADIUS): Nearest<Booth> | null {
  let best: Nearest<Booth> | null = null;
  for (const b of booths) {
    const slot = getBoothSlot(b.slotId);
    if (!slot) continue;
    const d = dist(pos, boothFront(slot));
    if (d <= radius && (!best || d < best.distance)) best = { item: b, distance: d };
  }
  return best;
}

export interface Quiz {
  question: string;
  options: string[];
  answerIndex: number;
}

/**
 * A one-tap question that proves the attendee read/heard the pitch:
 * "What does <company> do?" with the real tagline among two other booths' taglines.
 */
export function boothQuiz(booth: Booth, all: Booth[], seed = 1): Quiz {
  const rnd = seededRandom(hash(booth.id) ^ seed);
  const others = all.filter((b) => b.id !== booth.id && b.tagline !== booth.tagline);
  const picks: string[] = [];
  while (picks.length < 2 && others.length > 0) {
    const i = Math.floor(rnd() * others.length);
    picks.push(others.splice(i, 1)[0]!.tagline);
  }
  const answerIndex = Math.floor(rnd() * (picks.length + 1));
  const options = [...picks];
  options.splice(answerIndex, 0, booth.tagline);
  return { question: `What is ${booth.company} working on?`, options, answerIndex };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Player walking speed in the game (m/s), for distance → ETA labels. */
export const WALK_SPEED_MPS = 3.4;
