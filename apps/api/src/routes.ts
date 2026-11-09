import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CheckinRequest, GameStatus, JoinRequest, Vec2 } from '@meetspace/venue';
import type { Es } from './es/client';
import type { GameService } from './game';
import { HttpError } from './lib/errors';
import { safeEqual } from './lib/ids';

const vec2 = { type: 'array', items: { type: 'number', minimum: -500, maximum: 500 }, minItems: 2, maxItems: 2 };
const strList = { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 60 } };

/** `Authorization: Bearer <sessionId>` */
function session(req: FastifyRequest, required: true): string;
function session(req: FastifyRequest, required: false): string | undefined;
function session(req: FastifyRequest, required: boolean): string | undefined {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
  if (!token && required) throw new HttpError(401, 'unknown_session', 'Join the game first.');
  return token || undefined;
}

export function registerRoutes(app: FastifyInstance, game: GameService, es: Es, organizerToken: string) {
  // ---- Health ----
  app.get('/healthz', async () => ({ ok: true }));
  let lastCheck = 0;
  let lastOk = false;
  app.get('/readyz', async (_req, reply) => {
    if (Date.now() - lastCheck > 5000) {
      lastCheck = Date.now();
      lastOk = await es.ping().then(
        () => true,
        () => false,
      );
    }
    return lastOk ? { ok: true } : reply.code(503).send({ ok: false, reason: 'elasticsearch unreachable' });
  });

  // ---- Game contract (docs/venue-integration.md) ----
  app.post<{ Body: JoinRequest }>(
    '/api/join',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 32, pattern: '\\S' },
            role: { type: 'string', maxLength: 60 },
            lookingFor: strList,
            skills: strList,
            color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
            showOnLeaderboard: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => reply.code(201).send(await game.join({ ...req.body, name: req.body.name.trim() })),
  );

  app.get('/api/game', async () => game.view());
  app.get('/api/booths', async () => game.booths());
  app.get('/api/booths/stats', async () => game.stats());

  app.post<{ Params: { id: string }; Body: CheckinRequest }>(
    '/api/booths/:id/checkin',
    {
      schema: {
        body: {
          type: 'object',
          required: ['quizAnswer'],
          properties: {
            quizAnswer: { type: 'integer', minimum: 0, maximum: 10 },
            dwellMs: { type: 'integer', minimum: 0, maximum: 86_400_000 },
            code: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
      },
    },
    async (req) => game.checkin(session(req, true), req.params.id, req.body),
  );

  app.get('/api/me/progress', async (req) => game.progress(session(req, true)));

  app.get<{ Querystring: { limit?: number } }>(
    '/api/leaderboard',
    { schema: { querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } } } } },
    async (req) => game.leaderboard(req.query.limit ?? 10, session(req, false)),
  );

  // ---- Organizer (x-organizer-token) ----
  app.register(async (org) => {
    org.addHook('onRequest', async (req, reply) => {
      const token = req.headers['x-organizer-token'];
      if (typeof token !== 'string' || !safeEqual(token, organizerToken)) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Organizer token required.' });
      }
    });

    org.get('/api/organizer/booths', async () => game.organizerBooths());
    org.get('/api/organizer/stats', async () => game.organizerStats());

    org.put<{ Body: { center: Vec2; radius: number } }>(
      '/api/organizer/circle',
      { schema: { body: { type: 'object', required: ['center', 'radius'], properties: { center: vec2, radius: { type: 'number', minimum: 1, maximum: 500 } } } } },
      async (req) => game.setCircle(req.body),
    );

    org.post<{ Body: { factor: number; target?: Vec2 } }>(
      '/api/organizer/shrink',
      { schema: { body: { type: 'object', required: ['factor'], properties: { factor: { type: 'number', exclusiveMinimum: 0, maximum: 1 }, target: vec2 } } } },
      async (req) => game.shrink(req.body.factor, req.body.target),
    );

    org.post<{ Body: { inSeconds: number; factor: number; target?: Vec2 } }>(
      '/api/organizer/schedule-shrink',
      {
        schema: {
          body: {
            type: 'object',
            required: ['inSeconds', 'factor'],
            properties: { inSeconds: { type: 'integer', minimum: 10, maximum: 7200 }, factor: { type: 'number', exclusiveMinimum: 0, maximum: 1 }, target: vec2 },
          },
        },
      },
      async (req) => game.scheduleShrink(req.body.inSeconds, req.body.factor, req.body.target),
    );
    org.delete('/api/organizer/schedule-shrink', async () => game.cancelScheduledShrink());

    org.post<{ Body: { status: GameStatus } }>(
      '/api/organizer/status',
      { schema: { body: { type: 'object', required: ['status'], properties: { status: { enum: ['lobby', 'live', 'ended'] } } } } },
      async (req) => game.setStatus(req.body.status),
    );

    org.post('/api/organizer/reset', async () => game.reset());
  });
}
