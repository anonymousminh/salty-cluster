import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import type { Es } from './es/client';
import { GameService } from './game';
import { registerRoutes } from './routes';
import { HttpError } from './lib/errors';

export function buildApp(opts: { es: Es; config: Config; logger?: boolean | object }): FastifyInstance {
  const app = Fastify({
    logger: opts.logger ?? {
      level: process.env.LOG_LEVEL ?? 'info',
      // Player ids travel in URLs, so log the route pattern, never the raw URL.
      serializers: { req: (req) => ({ method: req.method, route: req.routeOptions?.url }) },
    },
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message, ...(err.reason ? { reason: err.reason } : {}) });
    const e = err as { validation?: unknown; name?: string; message: string; statusCode?: number };
    if (e.validation) return reply.code(400).send({ error: 'invalid_request', message: e.message });
    const esDown = e.name === 'ConnectionError' || e.name === 'TimeoutError' || e.name === 'NoLivingConnectionsError';
    req.log.error({ err: e.message, name: e.name }, 'request failed');
    return reply
      .code(esDown ? 503 : (e.statusCode ?? 500))
      .send({ error: esDown ? 'unavailable' : 'internal', message: esDown ? 'The game server is having a moment. Try again in a few seconds.' : 'Something went wrong.' });
  });

  const game = new GameService(opts.es, opts.config.playerSalt, app.log);
  registerRoutes(app, game, opts.es, opts.config.organizerToken);
  return app;
}
