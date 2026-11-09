/**
 * DEV ONLY: the API backed by an in-memory Elasticsearch stand-in, for UI work and demos
 * on a laptop without Docker. Production always uses real Elasticsearch (src/index.ts).
 *   pnpm --filter @meetspace/api dev:memory
 */
import { DEMO_BOOTHS, getBoothSlot, worldToGeo } from '@meetspace/venue';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import { boothCode } from '../lib/ids';
import { memoryEs } from './memory-es';

const config = loadConfig();
const secret = process.env.BOOTH_CODE_SECRET ?? 'meetspace-dev-booth-secret';
const booths = Object.fromEntries(
  DEMO_BOOTHS.map((b) => [
    b.id,
    { id: b.id, slot_id: b.slotId, company: b.company, color: b.color, tagline: b.tagline, hiring: b.hiring ?? [], tags: b.tags ?? [], location: worldToGeo(getBoothSlot(b.slotId)!.anchor), code: boothCode(b.id, secret) },
  ]),
);
const { es } = memoryEs({ booths });
const app = buildApp({ es, config });
app.listen({ port: config.port, host: '0.0.0.0' }).then(() => {
  app.log.warn('In-memory dev server: data is lost on restart. Organizer token: %s', config.organizerToken);
});
