import type {
  Booth,
  BoothStats,
  CheckinRequest,
  CheckinResponse,
  GameView,
  JoinRequest,
  Leaderboard,
  Progress,
  Session,
} from '@meetspace/venue';

/** Thin client for apps/api (contract in docs/venue-integration.md). Same-origin `/api`, proxied by Vite in dev. */
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

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

async function request<T>(path: string, init: RequestInit & { session?: string; timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), init.timeoutMs ?? 5000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.session ? { authorization: `Bearer ${init.session}` } : {}),
      },
    });
    const body = await res.json().catch(() => undefined);
    if (!res.ok) throw new ApiError(res.status, body?.error ?? 'error', body?.reason, body?.message ?? `Request failed (${res.status})`);
    return body as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  booths: (timeoutMs?: number) => request<Booth[]>('/api/booths', { timeoutMs }),
  stats: () => request<BoothStats>('/api/booths/stats'),
  game: () => request<GameView>('/api/game'),
  join: (body: JoinRequest) => request<Session>('/api/join', { method: 'POST', body: JSON.stringify(body) }),
  progress: (session: string) => request<Progress>('/api/me/progress', { session }),
  leaderboard: (session?: string, limit = 10) => request<Leaderboard>(`/api/leaderboard?limit=${limit}`, { session }),
  checkin: (session: string, boothId: string, body: CheckinRequest) =>
    request<CheckinResponse>(`/api/booths/${encodeURIComponent(boothId)}/checkin`, { method: 'POST', body: JSON.stringify(body), session }),
};
