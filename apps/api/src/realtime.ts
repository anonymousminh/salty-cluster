import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';
import { HELLO_TIMEOUT_MS, REALTIME_PATH, SNAPSHOT_HZ, type ClientMsg, type ServerMsg } from '@meetspace/venue';
import type { GameService } from './game';
import { chatMessages, chatRejected, realtimeConnects, realtimeGauges } from './lib/telemetry';
import { PresenceHub, type Conn } from './presence';

/** Frames are tiny (a chat line is under 300 bytes of JSON); anything bigger is abuse. */
const MAX_FRAME_BYTES = 1024;
const PING_MS = 25_000;
/**
 * Hard ceiling on open sockets for this process. Deliberately not per-IP: behind the ingress and
 * nginx every attendee can share one apparent address, and a venue puts hundreds behind one NAT.
 */
const MAX_CONNECTIONS = 5000;

/**
 * WebSocket endpoint for presence and chat at REALTIME_PATH.
 *
 * Attached to Fastify's HTTP server (no plugin): handles `upgrade`, expects `{t:'hello', session}`
 * within HELLO_TIMEOUT_MS, asks the game service who the session belongs to, then hands the socket
 * to the PresenceHub. The session id travels in the first frame, not in the URL, so it never lands
 * in proxy or access logs.
 */
export function attachRealtime(
  app: FastifyInstance,
  game: Pick<GameService, 'identify'>,
  hub = new PresenceHub(Date.now, { onReject: (reason) => chatRejected.add(1, { reason }) }),
): PresenceHub {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== REALTIME_PATH) {
      // Nothing else in this server speaks WebSocket; answer instead of leaving the socket hanging.
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (wss.clients.size >= MAX_CONNECTIONS) {
      realtimeConnects.add(1, { outcome: 'rejected', reason: 'capacity' });
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, handleSocket);
  };

  function handleSocket(ws: WebSocket) {
    let pid: string | null = null;
    const conn: Conn = {
      send: (msg: ServerMsg) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code, reason) => ws.close(code, reason),
    };
    const hello = setTimeout(() => {
      if (!pid) {
        realtimeConnects.add(1, { outcome: 'rejected', reason: 'hello_timeout' });
        ws.close(4001, 'hello timeout');
      }
    }, HELLO_TIMEOUT_MS);

    let alive = true;
    ws.on('pong', () => (alive = true));
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, PING_MS);

    let authing = false;
    ws.on('message', (data, isBinary) => {
      if (isBinary) return ws.close(1003, 'text frames only');
      let msg: ClientMsg | undefined;
      try {
        msg = JSON.parse(data.toString()) as ClientMsg;
      } catch {
        return ws.close(1007, 'invalid json');
      }
      if (pid) {
        if (msg?.t === 'say' || msg?.t === 'dm') chatMessages.add(1, { kind: msg.t });
        return hub.handle(pid, conn, msg);
      }
      // Not authenticated yet: the only acceptable frame is hello.
      if (authing) return;
      if (msg?.t !== 'hello' || typeof msg.session !== 'string' || msg.session.length > 100) return ws.close(4003, 'hello first');
      authing = true;
      game.identify(msg.session).then(
        (ref) => {
          clearTimeout(hello);
          if (ws.readyState !== ws.OPEN) return;
          pid = ref.pid;
          realtimeConnects.add(1, { outcome: 'accepted' });
          hub.join(ref, conn);
          realtimeGauges.online = hub.size;
        },
        () => {
          realtimeConnects.add(1, { outcome: 'rejected', reason: 'unknown_session' });
          ws.close(4004, 'unknown session');
        },
      );
    });

    ws.on('close', () => {
      clearTimeout(hello);
      clearInterval(ping);
      if (pid) hub.leave(pid, conn);
      realtimeGauges.online = hub.size;
    });
    ws.on('error', () => ws.terminate());
  }

  app.server.on('upgrade', onUpgrade);
  const timer = setInterval(() => {
    hub.tick();
    realtimeGauges.tickMs = hub.lastTickMs;
  }, 1000 / SNAPSHOT_HZ);
  timer.unref();

  app.addHook('onClose', async () => {
    clearInterval(timer);
    app.server.off('upgrade', onUpgrade);
    hub.closeAll();
    for (const c of wss.clients) c.terminate();
    wss.close();
  });
  return hub;
}

