import { create } from 'zustand';
import type { DemoProgressEntry, PlayerDemoStats, BoothDemoExperience } from '@meetspace/venue';
import { demoPersistence, getDefaultDemoStats, createDefaultProgressEntry } from './persistence';
import { DEMO_EXPERIENCES, getDemoExperienceForBooth, DEMO_BOOTH_META } from '../../data/demoBooths';
import { DEFAULT_DEMO_POINTS_CONFIG } from '@meetspace/venue';

export type DemoPhase = 'idle' | 'starting' | 'playing' | 'completed' | 'quiz' | 'finished';

export interface DemoState {
  // State
  demoPhase: DemoPhase;
  activeBoothId: string | null;
  activeExperience: BoothDemoExperience | null;
  progress: Record<string, DemoProgressEntry>;
  stats: PlayerDemoStats;
  isDemoMode: boolean;
  showAdminPanel: boolean;
  
  // Actions
  startDemo: (boothId: string, booth?: any) => boolean;
  markBoothVisited: (boothId: string) => void;
  completeDemo: () => void;
  answerQuiz: (answers: number[]) => { correct: boolean; pointsEarned: number };
  finishDemo: () => void;
  exitDemo: () => void;
  resetAllProgress: () => void;
  toggleDemoMode: () => void;
  toggleAdminPanel: () => void;
  loadProgress: () => void;
  saveProgress: () => void;
  getProgressForBooth: (boothId: string) => DemoProgressEntry;
  isBoothVisited: (boothId: string) => boolean;
  isBoothCompleted: (boothId: string) => boolean;
}

const TOTAL_BOOTHS = DEMO_EXPERIENCES.length;

function calculateStats(progress: Record<string, DemoProgressEntry>): PlayerDemoStats {
  const entries = Object.values(progress);
  const boothsVisited = entries.filter((e) => e.visited).length;
  const demosCompleted = entries.filter((e) => e.demoCompleted).length;
  const quizzesCorrect = entries.filter((e) => e.quizCorrect).length;
  const totalPoints = entries.reduce((sum, e) => sum + e.pointsEarned, 0);
  const completionPercentage = TOTAL_BOOTHS > 0 ? Math.round((demosCompleted / TOTAL_BOOTHS) * 100) : 0;
  
  return {
    boothsVisited,
    demosCompleted,
    totalPoints,
    quizzesCorrect,
    completionPercentage,
    totalBooths: TOTAL_BOOTHS,
  };
}

export const useDemoStore = create<DemoState>((set, get) => {
  const saved = demoPersistence.load();
  const initialProgress = saved?.progress || {};
  const initialStats = saved?.stats || getDefaultDemoStats(TOTAL_BOOTHS);

  return {
    demoPhase: 'idle',
    activeBoothId: null,
    activeExperience: null,
    progress: initialProgress,
    stats: initialStats,
    isDemoMode: false,
    showAdminPanel: false,

    startDemo: (boothId: string, booth?: any) => {
      let experience = DEMO_EXPERIENCES.find((e) => e.boothId === boothId);
      if (!experience) {
        const idx = booth?.slotId ? DEMO_BOOTH_META.findIndex((m) => m.slotId === booth.slotId) : -1;
        if (idx >= 0 && idx < DEMO_EXPERIENCES.length) experience = DEMO_EXPERIENCES[idx];
        else if (booth) {
          const exp2 = getDemoExperienceForBooth(booth);
          if (exp2) experience = exp2;
        }
      }
      if (!experience) {
        // Assign demo based on boothId hash for consistency
        let hash = 0;
        for (let i = 0; i < boothId.length; i++) hash = (hash * 31 + boothId.charCodeAt(i)) >>> 0;
        experience = DEMO_EXPERIENCES[hash % DEMO_EXPERIENCES.length];
      }
      if (!experience) return false;
      
      const state = get();
      let entry = state.progress[boothId] || createDefaultProgressEntry(boothId);
      
      // Mark as visited if not already
      let pointsEarned = entry.pointsEarned;
      const breakdown = { ...entry.scoreBreakdown };
      
      if (!entry.visited) {
        entry.visited = true;
        entry.visitedAt = Date.now();
        breakdown.boothVisit = experience.pointsConfig.boothVisit || DEFAULT_DEMO_POINTS_CONFIG.boothVisit;
        pointsEarned += breakdown.boothVisit;
      }
      
      entry.demoStartedAt = Date.now();
      
      const newProgress = { ...state.progress, [boothId]: { ...entry, pointsEarned, scoreBreakdown: breakdown } };
      const newStats = calculateStats(newProgress);
      
      set({
        demoPhase: 'playing',
        activeBoothId: boothId,
        activeExperience: experience,
        progress: newProgress,
        stats: newStats,
      });
      
      get().saveProgress();
      return true;
    },

    markBoothVisited: (boothId: string) => {
      const state = get();
      if (state.progress[boothId]?.visited) return;
      
      const experience = DEMO_EXPERIENCES.find((e) => e.boothId === boothId);
      const config = experience?.pointsConfig || DEFAULT_DEMO_POINTS_CONFIG;
      
      const entry = state.progress[boothId] || createDefaultProgressEntry(boothId);
      entry.visited = true;
      entry.visitedAt = Date.now();
      entry.scoreBreakdown.boothVisit = config.boothVisit;
      entry.pointsEarned = config.boothVisit;
      
      const newProgress = { ...state.progress, [boothId]: entry };
      const newStats = calculateStats(newProgress);
      
      set({ progress: newProgress, stats: newStats });
      get().saveProgress();
    },

    completeDemo: () => {
      const state = get();
      const { activeBoothId, activeExperience, progress } = state;
      if (!activeBoothId || !activeExperience) return;
      
      if (progress[activeBoothId]?.demoCompleted) {
        set({ demoPhase: 'quiz' });
        return;
      }
      
      const entry = { ...(progress[activeBoothId] || createDefaultProgressEntry(activeBoothId)) };
      const config = activeExperience.pointsConfig || DEFAULT_DEMO_POINTS_CONFIG;
      
      const isFirstTime = !entry.demoCompleted;
      entry.demoCompleted = true;
      entry.demoCompletedAt = Date.now();
      
      const demoCompletePoints = config.demoComplete;
      const firstTimeBonus = isFirstTime ? config.firstTimeCompletionBonus : 0;
      
      entry.scoreBreakdown.demoComplete = demoCompletePoints;
      entry.scoreBreakdown.firstTimeBonus = firstTimeBonus;
      entry.pointsEarned = (entry.scoreBreakdown.boothVisit || 0) + demoCompletePoints + firstTimeBonus + (entry.scoreBreakdown.quizBonus || 0);
      
      const newProgress = { ...progress, [activeBoothId]: entry };
      const newStats = calculateStats(newProgress);
      
      set({ progress: newProgress, stats: newStats, demoPhase: 'quiz' });
      get().saveProgress();
    },

    answerQuiz: (answers: number[]) => {
      const state = get();
      const { activeBoothId, activeExperience, progress } = state;
      if (!activeBoothId || !activeExperience) return { correct: false, pointsEarned: 0 };
      
      const entry = { ...(progress[activeBoothId] || createDefaultProgressEntry(activeBoothId)) };
      const config = activeExperience.pointsConfig || DEFAULT_DEMO_POINTS_CONFIG;
      
      if (entry.quizAnswered) {
        set({ demoPhase: 'finished' });
        return { correct: entry.quizCorrect, pointsEarned: 0 };
      }
      
      entry.quizAnswered = true;
      entry.quizAnswers = answers;
      
      // Check if all correct
      let allCorrect = true;
      for (let i = 0; i < activeExperience.quiz.length; i++) {
        if (answers[i] !== activeExperience.quiz[i]?.correctIndex) {
          allCorrect = false;
          break;
        }
      }
      
      entry.quizCorrect = allCorrect;
      const quizBonus = allCorrect ? config.correctQuizAnswer * activeExperience.quiz.length : 0;
      entry.scoreBreakdown.quizBonus = quizBonus;
      entry.pointsEarned = (entry.scoreBreakdown.boothVisit || 0) + 
                           (entry.scoreBreakdown.demoComplete || 0) + 
                           (entry.scoreBreakdown.firstTimeBonus || 0) + 
                           quizBonus;
      
      const newProgress = { ...progress, [activeBoothId]: entry };
      const newStats = calculateStats(newProgress);
      
      set({ progress: newProgress, stats: newStats, demoPhase: 'finished' });
      get().saveProgress();
      
      return { correct: allCorrect, pointsEarned: quizBonus };
    },

    finishDemo: () => {
      set({ demoPhase: 'idle', activeBoothId: null, activeExperience: null });
    },

    exitDemo: () => {
      set({ demoPhase: 'idle', activeBoothId: null, activeExperience: null });
    },

    resetAllProgress: () => {
      demoPersistence.reset();
      set({
        progress: {},
        stats: getDefaultDemoStats(TOTAL_BOOTHS),
        demoPhase: 'idle',
        activeBoothId: null,
        activeExperience: null,
      });
    },

    toggleDemoMode: () => set((state) => ({ isDemoMode: !state.isDemoMode })),
    toggleAdminPanel: () => set((state) => ({ showAdminPanel: !state.showAdminPanel })),

    loadProgress: () => {
      const saved = demoPersistence.load();
      if (saved) {
        set({ progress: saved.progress, stats: saved.stats || calculateStats(saved.progress) });
      }
    },

    saveProgress: () => {
      const state = get();
      demoPersistence.save({
        progress: state.progress,
        stats: state.stats,
        lastUpdated: Date.now(),
      });
    },

    getProgressForBooth: (boothId: string) => {
      const state = get();
      return state.progress[boothId] || createDefaultProgressEntry(boothId);
    },

    isBoothVisited: (boothId: string) => {
      return !!get().progress[boothId]?.visited;
    },

    isBoothCompleted: (boothId: string) => {
      return !!get().progress[boothId]?.demoCompleted;
    },
  };
});
