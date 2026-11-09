import type {
  Booth,
  BoothStats,
  CheckinResponse,
  Circle,
  GameState,
  GameStatus,
  GameView,
  Leaderboard,
  OrganizerBooth,
  OrganizerStats,
  Session,
  Vec2,
} from '@meetspace/venue';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public reason: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { organizerToken?: string; session?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.body ? { 'content-type': 'application/json' } : {}) };
  if (init.organizerToken) headers['x-organizer-token'] = init.organizerToken;
  if (init.session) headers.authorization = `Bearer ${init.session}`;
  const res = await fetch(path, { ...init, headers });
  const body = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? 'error', body?.reason, body?.message ?? `Request failed (${res.status})`);
  return body as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  game: () => request<GameView>('/api/game'),
  booths: () => request<Booth[]>('/api/booths'),
  stats: () => request<BoothStats>('/api/booths/stats'),
  leaderboard: (limit = 10) => request<Leaderboard>(`/api/leaderboard?limit=${limit}`),
  join: (name: string) => request<Session>('/api/join', { method: 'POST', body: json({ name }) }),
  checkinWithCode: (session: string, boothId: string, code: string, quizAnswer: number) =>
    request<CheckinResponse>(`/api/booths/${encodeURIComponent(boothId)}/checkin`, { method: 'POST', body: json({ code, quizAnswer }), session }),
  organizer: (token: string) => ({
    booths: () => request<OrganizerBooth[]>('/api/organizer/booths', { organizerToken: token }),
    stats: () => request<OrganizerStats>('/api/organizer/stats', { organizerToken: token }),
    setCircle: (circle: Circle) => request<GameState>('/api/organizer/circle', { method: 'PUT', body: json(circle), organizerToken: token }),
    shrink: (factor: number, target?: Vec2) => request<GameState>('/api/organizer/shrink', { method: 'POST', body: json({ factor, target }), organizerToken: token }),
    scheduleShrink: (inSeconds: number, factor: number, target?: Vec2) =>
      request<GameState>('/api/organizer/schedule-shrink', { method: 'POST', body: json({ inSeconds, factor, target }), organizerToken: token }),
    cancelShrink: () => request<GameState>('/api/organizer/schedule-shrink', { method: 'DELETE', organizerToken: token }),
    setStatus: (status: GameStatus) => request<GameState>('/api/organizer/status', { method: 'POST', body: json({ status }), organizerToken: token }),
    reset: () => request<GameState>('/api/organizer/reset', { method: 'POST', organizerToken: token }),
  }),
};

/** Same key as the 3D game, so a phone that scans a booth QR keeps the player's progress. */
const SESSION_KEY = 'meetspace.session.v1';
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked: session stays in memory */
  }
}
