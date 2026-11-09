/**
 * Create the Elasticsearch indices.
 *   npm run es:setup            # create missing indices
 *   npm run es:setup -- --reset # drop and recreate everything (deletes all game data!)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { createEsClient } from "../src/es/client";
import { IDX } from "../src/es/indices";

const reset = process.argv.includes("--reset");
const MAPPINGS = join(__dirname, "../../../elastic/mappings");
const INDICES: Record<string, string> = {
  [IDX.booths]: "booths.json",
  [IDX.checkins]: "checkins.json",
  [IDX.players]: "players.json",
  [IDX.game]: "game.json",
};

export async function setupIndices(opts: { reset: boolean }) {
  const es = createEsClient({ ...loadConfig(), esTimeoutMs: 60_000 });
  const info = await es.info();
  console.log(`Connected to Elasticsearch ${info.version.number}`);
  for (const [index, file] of Object.entries(INDICES)) {
    if (opts.reset) await es.indices.delete({ index, ignore_unavailable: true });
    if (await es.indices.exists({ index })) {
      console.log(`✓ ${index} exists`);
      continue;
    }
    await es.indices.create({ index, ...JSON.parse(readFileSync(join(MAPPINGS, file), "utf8")) });
    console.log(`✓ created ${index}`);
  }
}

if (require.main === module) {
  setupIndices({ reset }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
