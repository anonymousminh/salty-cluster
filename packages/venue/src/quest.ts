/** API shapes for the booth quest (served by the backend, mocked in the web app). */

export interface Progress {
  xp: number;
  rank: number;
  visitedBoothIds: string[];
  totalBooths: number;
}

export interface LeaderboardEntry {
  rank: number;
  /** Display name chosen by the attendee, or "Anonymous" if they opted out. */
  name: string;
  xp: number;
  totalPoints?: number;
  booths: number;
  demosCompleted?: number;
  avatar?: string;
  /** XP earned from underdog bonuses (the "underdog hunter" tag goes to the top one). */
  bonusXp: number;
  isMe?: boolean;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  me?: LeaderboardEntry;
}

/** SSE `booth.visited` (for the scanned attendee) and feed items for the HUD. */
export type QuestEvent =
  | { type: 'booth.visited'; id: string; at: number; boothId: string; company: string; base: number; bonus: number }
  | { type: 'leader.changed'; id: string; at: number; name: string };

/** Who the attendee is, for the "career fit" chip on booth cards. */
export interface CareerProfile {
  lookingFor?: string[];
  skills?: string[];
  interests?: string[];
}

/** Hiring roles / tags of a booth that overlap the attendee's profile (case-insensitive word match). */
export function careerFit(profile: CareerProfile | undefined, hiring: string[] = [], tags: string[] = []): string[] {
  if (!profile) return [];
  const words = new Set(
    [...(profile.lookingFor ?? []), ...(profile.skills ?? []), ...(profile.interests ?? [])]
      .flatMap((s) => s.toLowerCase().split(/[^a-z0-9+#]+/))
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
  return [...hiring, ...tags].filter((item) => item.toLowerCase().split(/[^a-z0-9+#]+/).some((w) => words.has(w)));
}

const STOP = new Set(['and', 'the', 'for', 'of', 'to', 'in', 'a', 'an', 'with', 'senior', 'junior', 'lead']);
