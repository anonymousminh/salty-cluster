import { useCallback, useEffect, useRef, useState } from 'react';
import type { Booth, BoothStats, CareerProfile, GameView, Leaderboard, Progress, QuestEvent } from '@meetspace/venue';
import { api, ApiError } from './api';
import { MOCK_CAREER_PROFILE, useMockQuest } from './questMock';
import type { PlayerProfile } from '../lobby/profile';
import { leaderboardName, toCareerProfile } from '../lobby/profile';

export type CheckinOutcome = { ok: true; event: QuestEvent } | { ok: false; reason?: string; message: string };

/** What the game needs from the booth quest, whether it runs against the API or offline mocks. */
export interface Quest {
  mode: 'api' | 'offline' | 'connecting';
  booths: Booth[];
  boothStats: BoothStats;
  progress: Progress;
  leaderboard: Leaderboard;
  events: QuestEvent[];
  careerProfile: CareerProfile;
  /** Battle-royale circle; null offline. */
  game: GameView | null;
  join: (profile: PlayerProfile) => Promise<void>;
  checkIn: (boothId: string, quizAnswer: number, dwellMs: number) => Promise<CheckinOutcome>;
  reset: () => void;
}

const SESSION_KEY = 'meetspace.session.v1';
const POLL_MS = 3000;

function loadSession(): { sessionId: string; name: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveSession(s: { sessionId: string; name: string } | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage blocked: the session lives in memory for this tab only
  }
}

/**
 * Real backend when `/api` answers, offline mock otherwise (or with `?offline`).
 * Demo URLs (?demo=…) keep working without a backend.
 */
export function useQuest({ profile }: { profile: PlayerProfile }): Quest {
  const query = new URLSearchParams(window.location.search);
  const forceOffline = query.has('offline');
  const mock = useMockQuest({ myName: leaderboardName(profile) });
  const [mode, setMode] = useState<Quest['mode']>(forceOffline ? 'offline' : 'connecting');

  const [booths, setBooths] = useState<Booth[]>([]);
  const [boothStats, setStats] = useState<BoothStats>({});
  const [game, setGame] = useState<GameView | null>(null);
  const [progress, setProgress] = useState<Progress>({ xp: 0, rank: 0, visitedBoothIds: [], totalBooths: 0 });
  const [leaderboard, setLeaderboard] = useState<Leaderboard>({ entries: [] });
  const [events, setEvents] = useState<QuestEvent[]>([]);
  const session = useRef(loadSession());
  const leader = useRef<string | null>(null);
  const seq = useRef(0);

  // Probe the API once.
  useEffect(() => {
    if (forceOffline) return;
    api.booths(2500).then(
      (b) => {
        setBooths(b);
        setMode('api');
      },
      () => setMode('offline'),
    );
  }, []);

  const refresh = useCallback(async () => {
    const s = session.current?.sessionId;
    const [stats, view, lb] = await Promise.all([api.stats(), api.game(), api.leaderboard(s)]);
    setStats(stats);
    setGame(view);
    setLeaderboard(lb);
    const top = lb.entries[0]?.name ?? null;
    if (top && leader.current && top !== leader.current) {
      setEvents((e) => [...e.slice(-9), { type: 'leader.changed', id: `l${++seq.current}`, at: Date.now(), name: top }]);
    }
    leader.current = top;
    if (s) {
      try {
        setProgress(await api.progress(s));
      } catch (err) {
        // Session no longer known (data reset): forget it, the next enter re-joins.
        if (err instanceof ApiError && err.status === 401) {
          session.current = null;
          saveSession(null);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (mode !== 'api') return;
    void refresh().catch(() => undefined);
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh().catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [mode, refresh]);

  const join = useCallback(
    async (p: PlayerProfile) => {
      if (mode !== 'api') return;
      if (session.current && session.current.name === p.name) return;
      const s = await api.join({
        name: p.name.trim() || 'Anonymous',
        role: p.role || undefined,
        lookingFor: p.lookingFor,
        skills: p.skills,
        color: p.color,
        showOnLeaderboard: p.showOnLeaderboard,
      });
      session.current = s;
      saveSession(s);
      await refresh().catch(() => undefined);
    },
    [mode, refresh],
  );

  const checkIn = useCallback(
    async (boothId: string, quizAnswer: number, dwellMs: number): Promise<CheckinOutcome> => {
      if (mode !== 'api') {
        const event = mock.checkIn(boothId);
        return event ? { ok: true, event } : { ok: false, reason: 'already_visited', message: 'You already collected XP here.' };
      }
      if (!session.current) await join(profile);
      const s = session.current?.sessionId;
      if (!s) return { ok: false, message: 'Could not join the game. Try again.' };
      try {
        const r = await api.checkin(s, boothId, { quizAnswer, dwellMs: Math.round(dwellMs) });
        const company = booths.find((b) => b.id === boothId)?.company ?? '';
        const event: QuestEvent = { type: 'booth.visited', id: `v${++seq.current}`, at: Date.now(), boothId, company, base: r.base, bonus: r.bonus };
        setEvents((e) => [...e.slice(-9), event]);
        void refresh().catch(() => undefined);
        return { ok: true, event };
      } catch (err) {
        if (err instanceof ApiError) return { ok: false, reason: err.reason ?? err.code, message: err.message };
        return { ok: false, message: 'Network problem. Try again.' };
      }
    },
    [mode, mock, join, profile, booths, refresh],
  );

  const reset = useCallback(() => {
    if (mode !== 'api') return mock.reset();
    // Start over as a new player (organizers reset the whole game from the console).
    session.current = null;
    saveSession(null);
    setProgress({ xp: 0, rank: 0, visitedBoothIds: [], totalBooths: booths.length });
    setEvents([]);
  }, [mode, mock, booths.length]);

  if (mode === 'connecting') {
    // A second or two at most: show an empty park rather than flashing mock data.
    return { mode, booths: [], boothStats: {}, progress, leaderboard: { entries: [] }, events: [], careerProfile: MOCK_CAREER_PROFILE, game: null, join, checkIn, reset };
  }
  if (mode === 'offline') {
    return { ...mock, mode, game: null, join: async () => undefined, checkIn, reset };
  }
  return {
    mode,
    booths,
    boothStats,
    progress: { ...progress, totalBooths: progress.totalBooths || booths.length },
    leaderboard,
    events,
    careerProfile: profile.name ? toCareerProfile(profile) : MOCK_CAREER_PROFILE,
    game,
    join,
    checkIn,
    reset,
  };
}
