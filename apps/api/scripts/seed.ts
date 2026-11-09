/**
 * Load the demo sponsors into their Expo Park slots (same list the game's offline mode uses).
 * Booth positions come from @meetspace/venue and are stored as geo_points.
 * Prints each booth's code for its physical QR sticker (console: /console/#/organizer prints them).
 */
import { DEMO_BOOTHS, getBoothSlot, worldToGeo } from '@meetspace/venue';
import { loadConfig } from '../src/config';
import { createEsClient } from '../src/es/client';
import { IDX } from '../src/es/indices';
import { boothCode } from '../src/lib/ids';

export async function seedBooths(): Promise<{ id: string; code: string }[]> {
  const es = createEsClient({ ...loadConfig(), esTimeoutMs: 60_000 });
  const secret = process.env.BOOTH_CODE_SECRET ?? 'meetspace-dev-booth-secret';
  const docs = DEMO_BOOTHS.map((b) => ({
    id: b.id,
    slot_id: b.slotId,
    company: b.company,
    color: b.color,
    tagline: b.tagline,
    hiring: b.hiring ?? [],
    tags: b.tags ?? [],
    location: worldToGeo(getBoothSlot(b.slotId)!.anchor),
    code: boothCode(b.id, secret),
  }));
  const res = await es.bulk({ operations: docs.flatMap((d) => [{ index: { _index: IDX.booths, _id: d.id } }, d]), refresh: 'wait_for' });
  if (res.errors) throw new Error(`bulk errors: ${JSON.stringify(res.items.find((i) => Object.values(i)[0]?.error))}`);
  return docs.map((d) => ({ id: d.id, code: d.code }));
}

if (require.main === module) {
  seedBooths()
    .then((booths) => {
      console.log(`Seeded ${booths.length} booths.`);
      for (const b of booths) console.log(`  ${b.id.padEnd(28)} code ${b.code}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
