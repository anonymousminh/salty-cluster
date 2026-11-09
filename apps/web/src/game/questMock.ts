import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BASE_XP,
  BOOTH_SLOTS,
  computeBoothStats,
  type Booth,
  type CareerProfile,
  type Leaderboard,
  type LeaderboardEntry,
  type Progress,
  type QuestEvent,
} from '@meetspace/venue';

/**
 * Stand-in for the booth quest API (GET /booths, /booths/stats, /me/progress, /leaderboard,
 * POST /booths/:id/checkin + SSE). Same shapes as the contract in docs/venue-integration.md. Fictional companies.
 */

const COMPANIES: Omit<Booth, 'id' | 'slotId'>[] = [
  { company: 'Lumen Labs', color: '#6366f1', tagline: 'Applied AI for healthcare', hiring: ['ML Engineer', 'Data Scientist'], tags: ['python', 'pytorch'] },
  { company: 'Canyon Cloud', color: '#0ea5e9', tagline: 'Serverless infra', hiring: ['Platform Engineer', 'SRE'], tags: ['go', 'kubernetes'] },
  { company: 'Basalt Bank', color: '#14b8a6', tagline: 'Fintech for small business', hiring: ['Backend Engineer'], tags: ['java', 'payments'] },
  { company: 'Wasatch Robotics', color: '#f97316', tagline: 'Warehouse robots', hiring: ['Robotics Engineer', 'ML Engineer'], tags: ['ros', 'c++', 'python'] },
  { company: 'Saltflat Studio', color: '#ec4899', tagline: 'Product design agency', hiring: ['Product Designer'], tags: ['figma', 'ux'] },
  { company: 'Granite Security', color: '#64748b', tagline: 'Zero-trust networking', hiring: ['Security Engineer'], tags: ['rust', 'security'] },
  { company: 'Beehive Health', color: '#eab308', tagline: 'Patient engagement', hiring: ['Frontend Engineer', 'PM'], tags: ['react', 'typescript'] },
  { company: 'Alta Analytics', color: '#8b5cf6', tagline: 'Real-time dashboards', hiring: ['Data Engineer'], tags: ['sql', 'spark', 'python'] },
  { company: 'Red Butte Energy', color: '#ef4444', tagline: 'Grid-scale storage', hiring: ['Embedded Engineer'], tags: ['c', 'iot'] },
  { company: 'Kestrel Mobile', color: '#22c55e', tagline: 'Consumer apps', hiring: ['iOS Engineer', 'Android Engineer'], tags: ['swift', 'kotlin'] },
  { company: 'Uinta Edu', color: '#06b6d4', tagline: 'Learning platform', hiring: ['Full-stack Engineer'], tags: ['react', 'node'] },
  { company: 'Delta Dev Tools', color: '#a855f7', tagline: 'CI that explains itself', hiring: ['Developer Advocate', 'Backend Engineer'], tags: ['typescript', 'devtools'] },
  { company: 'Quarry Games', color: '#f43f5e', tagline: 'Indie multiplayer studio', hiring: ['Gameplay Engineer', '3D Artist'], tags: ['unity', 'c#'] },
  { company: 'Bonneville Bio', color: '#10b981', tagline: 'Genomics pipelines', hiring: ['Bioinformatics Engineer', 'ML Engineer'], tags: ['python', 'genomics'] },
  { company: 'Pinecrest Legal AI', color: '#3b82f6', tagline: 'Contract review copilots', hiring: ['NLP Engineer'], tags: ['llm', 'python'] },
  { company: 'Summit Logistics', color: '#d946ef', tagline: 'Route optimization', hiring: ['Operations Research Analyst'], tags: ['optimization', 'python'] },
  { company: 'Arch Vision', color: '#0284c7', tagline: 'Computer vision for retail', hiring: ['Computer Vision Engineer'], tags: ['opencv', 'pytorch'] },
  { company: 'Juniper Pay', color: '#16a34a', tagline: 'Checkout in one tap', hiring: ['Frontend Engineer'], tags: ['react', 'payments'] },
  { company: 'Monolith Data', color: '#7c3aed', tagline: 'Vector search at scale', hiring: ['Search Engineer'], tags: ['elasticsearch', 'rust'] },
  { company: 'Sego Climate', color: '#65a30d', tagline: 'Carbon accounting', hiring: ['Data Analyst'], tags: ['sql', 'python'] },
  { company: 'Timp Ventures', color: '#b45309', tagline: 'Seed-stage VC', hiring: ['Venture Fellow'], tags: ['startups'] },
  { company: 'Cottonwood HR', color: '#db2777', tagline: 'Hiring without bias', hiring: ['Recruiter', 'Backend Engineer'], tags: ['node', 'hr'] },
  { company: 'Lakeside Quantum', color: '#4f46e5', tagline: 'Quantum simulation', hiring: ['Research Scientist'], tags: ['physics', 'python'] },
  { company: 'Oquirrh Media', color: '#ea580c', tagline: 'Creator tools', hiring: ['Video Engineer'], tags: ['webrtc', 'ffmpeg'] },
];

export const MOCK_BOOTHS: Booth[] = COMPANIES.slice(0, BOOTH_SLOTS.length).map((c, i) => ({
  ...c,
  id: `booth-${c.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  slotId: BOOTH_SLOTS[i]!.id,
}));

export const MOCK_CAREER_PROFILE: CareerProfile = {
  lookingFor: ['ML Engineer role', 'Startup cofounder'],
  skills: ['Python', 'PyTorch', 'React'],
  interests: ['Machine Learning', 'Robotics'],
};

const BOT_NAMES = [
  'Priya', 'Marcus', 'Elena', 'Jun', 'Sofia', 'Diego', 'Aisha', 'Tom', 'Mei', 'Omar', 'Hana', 'Lucas',
  'Grace', 'Ravi', 'Zoe', 'Ivan', 'Nora', 'Kenji', 'Leah', 'Sam', 'Anonymous', 'Ben', 'Chloe', 'Yusuf',
];

interface Player {
  name: string;
  xp: number;
  booths: number;
  bonusXp: number;
  isMe?: boolean;
}

/** Popularity weights: a few "famous" booths attract most traffic, the rest are quiet. */
const POPULARITY = MOCK_BOOTHS.map((_, i) => (i % 7 === 0 ? 8 : i % 3 === 0 ? 3 : 1));

function seededVisits(): Record<string, number> {
  const v: Record<string, number> = {};
  MOCK_BOOTHS.forEach((b, i) => (v[b.id] = Math.round(POPULARITY[i]! * 6 + (i % 4))));
  // A couple of truly empty booths to show the bounty.
  v[MOCK_BOOTHS[5]!.id] = 0;
  v[MOCK_BOOTHS[11]!.id] = 1;
  return v;
}

function seededBots(): Player[] {
  return BOT_NAMES.map((name, i) => {
    const booths = Math.max(1, 14 - i + (i % 3));
    const bonusXp = (i * 7) % 60;
    return { name, booths, bonusXp, xp: booths * BASE_XP + bonusXp };
  });
}

function pickWeighted(): number {
  const total = POPULARITY.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < POPULARITY.length; i++) {
    r -= POPULARITY[i]!;
    if (r <= 0) return i;
  }
  return 0;
}

export interface MockQuest {
  booths: Booth[];
  boothStats: ReturnType<typeof computeBoothStats>;
  progress: Progress;
  leaderboard: Leaderboard;
  events: QuestEvent[];
  careerProfile: CareerProfile;
  /** What POST /booths/:id/checkin would do after a valid walk-up check-in (dwell + quiz). */
  checkIn: (boothId: string) => QuestEvent | null;
  reset: () => void;
}

/** Live-ish booth quest: bots visit (mostly popular) booths every few seconds. */
export function useMockQuest({ tickMs = 3000, myName = 'You' }: { tickMs?: number; myName?: string } = {}): MockQuest {
  const [visits, setVisits] = useState(seededVisits);
  const [bots, setBots] = useState(seededBots);
  const [me, setMe] = useState<{ xp: number; bonusXp: number; visited: string[] }>({ xp: 0, bonusXp: 0, visited: [] });
  const [events, setEvents] = useState<QuestEvent[]>([]);
  const leaderRef = useRef<string | null>(null);
  const seq = useRef(0);

  const boothStats = useMemo(() => computeBoothStats(visits), [visits]);

  const visitsRef = useRef(visits);
  visitsRef.current = visits;

  useEffect(() => {
    const t = window.setInterval(() => {
      const booth = MOCK_BOOTHS[pickWeighted()]!;
      const bonus = computeBoothStats(visitsRef.current)[booth.id]?.bonus ?? 0;
      const i = Math.floor(Math.random() * BOT_NAMES.length);
      setBots((bs) => bs.map((b, k) => (k === i ? { ...b, xp: b.xp + BASE_XP + bonus, booths: b.booths + 1, bonusXp: b.bonusXp + bonus } : b)));
      setVisits((v) => ({ ...v, [booth.id]: (v[booth.id] ?? 0) + 1 }));
    }, tickMs);
    return () => window.clearInterval(t);
  }, [tickMs]);

  const players: Player[] = useMemo(
    () => [...bots, { name: myName, xp: me.xp, booths: me.visited.length, bonusXp: me.bonusXp, isMe: true }].sort((a, b) => b.xp - a.xp),
    [bots, me, myName],
  );
  const ranked: LeaderboardEntry[] = players.map((p, i) => ({ ...p, rank: i + 1 }));
  const leaderboard: Leaderboard = { entries: ranked.slice(0, 10), me: ranked.find((p) => p.isMe) };

  // Announce a new #1.
  const leader = ranked[0]?.name ?? null;
  useEffect(() => {
    if (leader && leaderRef.current && leader !== leaderRef.current) {
      setEvents((e) => [...e.slice(-9), { type: 'leader.changed', id: `e${++seq.current}`, at: Date.now(), name: leader }]);
    }
    leaderRef.current = leader;
  }, [leader]);

  const checkIn = useCallback(
    (boothId: string): QuestEvent | null => {
      const booth = MOCK_BOOTHS.find((b) => b.id === boothId);
      if (!booth || me.visited.includes(boothId)) return null; // 409 already_visited
      const bonus = boothStats[boothId]?.bonus ?? 0;
      const ev: QuestEvent = { type: 'booth.visited', id: `e${++seq.current}`, at: Date.now(), boothId, company: booth.company, base: BASE_XP, bonus };
      setMe((m) => ({ xp: m.xp + BASE_XP + bonus, bonusXp: m.bonusXp + bonus, visited: [...m.visited, boothId] }));
      setVisits((v) => ({ ...v, [boothId]: (v[boothId] ?? 0) + 1 }));
      setEvents((e) => [...e.slice(-9), ev]);
      return ev;
    },
    [boothStats, me.visited],
  );

  const reset = useCallback(() => {
    setVisits(seededVisits());
    setBots(seededBots());
    setMe({ xp: 0, bonusXp: 0, visited: [] });
    setEvents([]);
  }, []);

  const progress: Progress = {
    xp: me.xp,
    rank: leaderboard.me?.rank ?? players.length,
    visitedBoothIds: me.visited,
    totalBooths: MOCK_BOOTHS.length,
  };

  return { booths: MOCK_BOOTHS, boothStats, progress, leaderboard, events, careerProfile: MOCK_CAREER_PROFILE, checkIn, reset };
}
