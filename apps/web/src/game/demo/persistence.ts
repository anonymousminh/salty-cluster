import type { DemoProgressEntry, PlayerDemoStats } from '@meetspace/venue';

const STORAGE_KEY = 'meetspace_demo_progress_v1';
const STATS_KEY = 'meetspace_demo_stats_v1';
const LEADERBOARD_KEY = 'meetspace_demo_leaderboard_v1';

export interface DemoPersistenceState {
  progress: Record<string, DemoProgressEntry>;
  stats: PlayerDemoStats;
  lastUpdated: number;
}

export interface IDemoPersistence {
  load(): DemoPersistenceState | null;
  save(state: DemoPersistenceState): void;
  reset(): void;
  clear(): void;
}

class LocalStorageDemoPersistence implements IDemoPersistence {
  load(): DemoPersistenceState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DemoPersistenceState;
      return parsed;
    } catch (e) {
      console.warn('Failed to load demo progress from localStorage:', e);
      return null;
    }
  }

  save(state: DemoPersistenceState): void {
    try {
      state.lastUpdated = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save demo progress to localStorage:', e);
    }
  }

  reset(): void {
    this.clear();
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STATS_KEY);
      localStorage.removeItem(LEADERBOARD_KEY);
    } catch (e) {
      console.warn('Failed to clear demo data from localStorage:', e);
    }
  }
}

export const demoPersistence: IDemoPersistence = new LocalStorageDemoPersistence();

export function getDefaultDemoStats(totalBooths: number): PlayerDemoStats {
  return {
    boothsVisited: 0,
    demosCompleted: 0,
    totalPoints: 0,
    quizzesCorrect: 0,
    completionPercentage: 0,
    totalBooths,
  };
}

export function createDefaultProgressEntry(boothId: string): DemoProgressEntry {
  return {
    boothId,
    visited: false,
    demoCompleted: false,
    quizAnswered: false,
    quizCorrect: false,
    quizAnswers: [],
    pointsEarned: 0,
    scoreBreakdown: {
      boothVisit: 0,
      demoComplete: 0,
      quizBonus: 0,
      firstTimeBonus: 0,
    },
  };
}
