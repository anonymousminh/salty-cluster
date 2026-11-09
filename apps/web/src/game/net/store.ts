import { create } from 'zustand';
import type { PlayerRef } from '@meetspace/venue';

export type NetStatus = 'off' | 'connecting' | 'online' | 'reconnecting';
export type ChatTab = 'nearby' | 'dms' | 'people';

export interface ChatLine {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
  mine: boolean;
}
export interface DmLine extends ChatLine {
  to: string;
}
export interface Bubble {
  text: string;
  until: number;
}

const MUTE_KEY = 'meetspace.muted.v1';
const MAX_NEARBY = 100;
const MAX_DM_PER_THREAD = 200;
export const BUBBLE_MS_MIN = 4000;
export const BUBBLE_MS_MAX = 9000;

function loadMuted(): string[] {
  try {
    const raw = localStorage.getItem(MUTE_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
  } catch {
    return [];
  }
}
function saveMuted(ids: string[]) {
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify(ids));
  } catch {
    // storage blocked: mutes last for this tab only
  }
}

export interface NetState {
  status: NetStatus;
  me: PlayerRef | null;
  roster: Record<string, PlayerRef>;
  /** Pids drawn in the 3D world right now (subset of the roster). */
  visible: string[];
  nearby: ChatLine[];
  /** Direct-message threads keyed by the other player's pid. */
  dms: Record<string, DmLine[]>;
  unreadNearby: number;
  unreadDms: Record<string, number>;
  bubbles: Record<string, Bubble>;
  muted: string[];
  /** A short-lived message for the chat panel ("Slow down a little."). */
  notice: string | null;
  panelOpen: boolean;
  tab: ChatTab;
  activeDm: string | null;
  /** The chat box has keyboard focus: movement keys must type, not walk. */
  chatFocused: boolean;

  reset: () => void;
  setStatus: (s: NetStatus) => void;
  setWelcome: (me: PlayerRef, roster: PlayerRef[]) => void;
  addPlayer: (p: PlayerRef) => void;
  removePlayer: (pid: string) => void;
  setVisible: (pids: string[]) => void;
  addSay: (m: Omit<ChatLine, 'mine'>) => void;
  addDm: (m: Omit<DmLine, 'mine'>) => void;
  setNotice: (text: string | null) => void;
  setPanel: (open: boolean) => void;
  setTab: (tab: ChatTab) => void;
  openDm: (pid: string | null) => void;
  setChatFocused: (f: boolean) => void;
  toggleMute: (pid: string) => void;
  clearBubble: (pid: string, until: number) => void;
}

const initial = {
  status: 'off' as NetStatus,
  me: null as PlayerRef | null,
  roster: {} as Record<string, PlayerRef>,
  visible: [] as string[],
  nearby: [] as ChatLine[],
  dms: {} as Record<string, DmLine[]>,
  unreadNearby: 0,
  unreadDms: {} as Record<string, number>,
  bubbles: {} as Record<string, Bubble>,
  notice: null as string | null,
};

let noticeTimer = 0;

export const useNet = create<NetState>((set, get) => ({
  ...initial,
  muted: loadMuted(),
  panelOpen: false,
  tab: 'nearby',
  activeDm: null,
  chatFocused: false,

  reset: () => set({ ...initial, chatFocused: false }),
  setStatus: (status) => set({ status }),

  setWelcome: (me, roster) => set({ me, roster: Object.fromEntries(roster.map((p) => [p.pid, p])) }),
  addPlayer: (p) => set((s) => ({ roster: { ...s.roster, [p.pid]: p } })),
  removePlayer: (pid) =>
    set((s) => {
      if (!s.roster[pid]) return s;
      const { [pid]: _gone, ...roster } = s.roster;
      return { roster, visible: s.visible.filter((v) => v !== pid) };
    }),
  setVisible: (visible) =>
    set((s) => (visible.length === s.visible.length && visible.every((v, i) => v === s.visible[i]) ? s : { visible })),

  addSay: (m) => {
    const s = get();
    const mine = m.from === s.me?.pid;
    if (!mine && s.muted.includes(m.from)) return;
    const line: ChatLine = { ...m, mine };
    const open = s.panelOpen && s.tab === 'nearby';
    const until = Date.now() + Math.min(BUBBLE_MS_MAX, BUBBLE_MS_MIN + m.text.length * 40);
    set({
      nearby: [...s.nearby, line].slice(-MAX_NEARBY),
      unreadNearby: mine || open ? s.unreadNearby : s.unreadNearby + 1,
      bubbles: { ...s.bubbles, [m.from]: { text: m.text, until } },
    });
    window.setTimeout(() => get().clearBubble(m.from, until), until - Date.now() + 50);
  },

  addDm: (m) => {
    const s = get();
    const mine = m.from === s.me?.pid;
    const other = mine ? m.to : m.from;
    if (!mine && s.muted.includes(m.from)) return;
    const thread = [...(s.dms[other] ?? []), { ...m, mine }].slice(-MAX_DM_PER_THREAD);
    const reading = s.panelOpen && s.tab === 'dms' && s.activeDm === other;
    set({
      dms: { ...s.dms, [other]: thread },
      unreadDms: mine || reading ? s.unreadDms : { ...s.unreadDms, [other]: (s.unreadDms[other] ?? 0) + 1 },
    });
  },

  setNotice: (notice) => {
    window.clearTimeout(noticeTimer);
    set({ notice });
    if (notice) noticeTimer = window.setTimeout(() => set({ notice: null }), 3500);
  },

  setPanel: (panelOpen) =>
    set((s) => ({
      panelOpen,
      unreadNearby: panelOpen && s.tab === 'nearby' ? 0 : s.unreadNearby,
      chatFocused: panelOpen ? s.chatFocused : false,
    })),
  setTab: (tab) => set((s) => ({ tab, unreadNearby: tab === 'nearby' ? 0 : s.unreadNearby, activeDm: tab === 'dms' ? s.activeDm : null })),
  openDm: (pid) =>
    set((s) => {
      const unreadDms = { ...s.unreadDms };
      if (pid) delete unreadDms[pid];
      return { activeDm: pid, tab: 'dms', panelOpen: true, unreadDms };
    }),
  setChatFocused: (chatFocused) => set({ chatFocused }),

  toggleMute: (pid) => {
    const s = get();
    const muted = s.muted.includes(pid) ? s.muted.filter((x) => x !== pid) : [...s.muted, pid].slice(-500);
    saveMuted(muted);
    const { [pid]: _b, ...bubbles } = s.bubbles;
    set({ muted, bubbles });
  },

  clearBubble: (pid, until) =>
    set((s) => {
      const b = s.bubbles[pid];
      if (!b || b.until !== until) return s; // a newer message replaced it
      const { [pid]: _gone, ...bubbles } = s.bubbles;
      return { bubbles };
    }),
}));

export function totalUnread(s: Pick<NetState, 'unreadNearby' | 'unreadDms'>): number {
  return s.unreadNearby + Object.values(s.unreadDms).reduce((a, b) => a + b, 0);
}
