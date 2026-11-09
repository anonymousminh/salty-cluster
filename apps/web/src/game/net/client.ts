import { POSITION_HZ, REALTIME_PATH, type ClientMsg, type ServerMsg, type WireRef } from '@meetspace/venue';
import { track } from '../../telemetry';
import { remotes, self } from './remotes';
import { useNet } from './store';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/** ws(s)://… for the realtime endpoint: same origin by default, or the API URL when one is configured. */
export function realtimeUrl(): string {
  if (BASE) return BASE.replace(/^http/, 'ws').replace(/\/$/, '') + REALTIME_PATH;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${REALTIME_PATH}`;
}

/** Close codes from the server that mean "do not reconnect". */
const FATAL: Record<number, string> = {
  4002: 'You opened MeetSpace somewhere else. Chat moved there.',
  4004: 'Your session expired. Reload to rejoin the game.',
};

/**
 * One WebSocket to the realtime hub: presence and chat. Reconnects with backoff, sends
 * your position at POSITION_HZ when it changes, and writes everything it hears into
 * `useNet` (chat, roster) and `remotes` (positions). It never throws into React.
 */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private retry = 0;
  private posTimer = 0;
  private lastPos = '';
  private lastPosAt = 0;
  /** Snapshots name players by small numbers; welcome/join tell us whose number is whose. */
  private pidByN = new Map<number, string>();
  private nByPid = new Map<string, number>();

  constructor(
    private session: string,
    private opts: { url?: string; onSessionExpired?: () => void } = {},
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
    this.posTimer = window.setInterval(() => this.sendPos(), 1000 / POSITION_HZ);
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.retry);
    window.clearInterval(this.posTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close(1000, 'leaving');
    }
    remotes.clear();
    useNet.getState().reset();
  }

  /** Say something to players nearby. False if not connected. */
  say(text: string): boolean {
    return this.send({ t: 'say', text });
  }

  /** Message one player privately. False if not connected. */
  dm(to: string, text: string): boolean {
    return this.send({ t: 'dm', to, text });
  }

  private send(msg: ClientMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN || useNet.getState().status !== 'online') return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private connect(): void {
    if (this.stopped) return;
    const net = useNet.getState();
    net.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.url ?? realtimeUrl());
    } catch {
      return this.scheduleRetry();
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', session: this.session } satisfies ClientMsg));
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(String(ev.data)) as ServerMsg);
      } catch {
        // a malformed frame is ignored; the connection stays up
      }
    };
    ws.onclose = (ev) => {
      if (this.ws === ws) this.ws = null;
      remotes.clear();
      this.pidByN.clear();
      this.nByPid.clear();
      useNet.getState().setVisible([]);
      const fatal = FATAL[ev.code];
      if (fatal) {
        this.stopped = true;
        window.clearInterval(this.posTimer);
        useNet.getState().setStatus('off');
        useNet.getState().setNotice(fatal);
        if (ev.code === 4004) this.opts.onSessionExpired?.();
        return;
      }
      this.scheduleRetry();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    useNet.getState().setStatus('reconnecting');
    // 0.5 s, 1 s, 2 s … capped at 10 s, with jitter so 800 clients don't reconnect in lockstep.
    const delay = Math.min(10_000, 500 * 2 ** this.attempt) * (0.7 + Math.random() * 0.6);
    this.attempt += 1;
    track('realtime_reconnect', { attempt: this.attempt });
    this.retry = window.setTimeout(() => this.connect(), delay);
  }

  private onMessage(msg: ServerMsg): void {
    const net = useNet.getState();
    switch (msg.t) {
      case 'welcome':
        this.attempt = 0;
        this.pidByN.clear();
        this.nByPid.clear();
        for (const p of [msg.you, ...msg.roster]) this.remember(p);
        net.setWelcome(msg.you, msg.roster);
        net.setStatus('online');
        this.lastPos = ''; // resend our position to the (possibly new) server
        track('realtime_online', { players: msg.roster.length + 1 });
        break;
      case 'join':
        this.remember(msg.p);
        net.addPlayer(msg.p);
        break;
      case 'leave': {
        remotes.delete(msg.pid);
        const n = this.nByPid.get(msg.pid);
        if (n !== undefined) this.pidByN.delete(n);
        this.nByPid.delete(msg.pid);
        net.removePlayer(msg.pid);
        break;
      }
      case 'snap': {
        const seen: string[] = [];
        for (const [n, x, z, h, m] of msg.p) {
          const pid = this.pidByN.get(n);
          if (!pid) continue; // not introduced yet; it will be in the next snapshot
          seen.push(pid);
          remotes.set(pid, { x, z, h, m });
        }
        const keep = new Set(seen);
        for (const pid of remotes.keys()) if (!keep.has(pid)) remotes.delete(pid);
        net.setVisible(seen);
        break;
      }
      case 'say':
        net.addSay({ id: msg.id, from: msg.from, name: msg.name, text: msg.text, at: msg.at });
        break;
      case 'dm':
        net.addDm({ id: msg.id, from: msg.from, to: msg.to, name: msg.name, text: msg.text, at: msg.at });
        break;
      case 'err':
        net.setNotice(msg.message);
        break;
    }
  }

  private remember(p: WireRef): void {
    this.pidByN.set(p.n, p.pid);
    this.nByPid.set(p.pid, p.n);
  }

  private sendPos(): void {
    if (!self.ready || useNet.getState().status !== 'online' || this.ws?.readyState !== WebSocket.OPEN) return;
    const key = `${Math.round(self.x * 20)},${Math.round(self.z * 20)},${Math.round(self.h / 3)},${self.m}`;
    const now = performance.now();
    // Unchanged and sent recently: nothing to say. (A keep-alive every 5 s lets the server refresh state after a restart.)
    if (key === this.lastPos && now - this.lastPosAt < 5000) return;
    this.lastPos = key;
    this.lastPosAt = now;
    this.ws.send(JSON.stringify({ t: 'pos', x: round2(self.x), z: round2(self.z), h: Math.round(self.h), m: self.m } satisfies ClientMsg));
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The live client, so UI code can send without prop-drilling. Set by useRealtime. */
let active: RealtimeClient | null = null;
export const realtime = {
  set: (c: RealtimeClient | null) => (active = c),
  say: (text: string) => active?.say(text) ?? false,
  dm: (to: string, text: string) => active?.dm(to, text) ?? false,
};
