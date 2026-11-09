import type { CareerProfile } from '@meetspace/venue';

/** What an attendee fills in at the lobby (sent to POST /events/:id/join by the real app). */
export interface PlayerProfile {
  name: string;
  role: string;
  lookingFor: string[];
  skills: string[];
  /** Avatar color on the map. */
  color: string;
  /** If false the leaderboard shows "Anonymous". */
  showOnLeaderboard: boolean;
}

export const AVATAR_COLORS = ['#f472b6', '#22d3ee', '#a78bfa', '#facc15', '#34d399', '#fb923c'];

export const LOOKING_FOR = ['Full-time job', 'Internship', 'Cofounder', 'Hiring talent', 'Investors', 'Learning'];

export const EMPTY_PROFILE: PlayerProfile = {
  name: '',
  role: '',
  lookingFor: [],
  skills: [],
  color: AVATAR_COLORS[0]!,
  showOnLeaderboard: true,
};

const KEY = 'meetspace.profile.v1';

export function loadProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<PlayerProfile>) } : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: PlayerProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private mode / blocked storage: the lobby simply won't be pre-filled next time.
  }
}

export function toCareerProfile(p: PlayerProfile): CareerProfile {
  return { lookingFor: [p.role, ...p.lookingFor], skills: p.skills };
}

export function leaderboardName(p: PlayerProfile): string {
  return p.showOnLeaderboard && p.name.trim() ? p.name.trim() : 'Anonymous';
}
