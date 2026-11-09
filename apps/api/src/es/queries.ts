/**
 * Every Elasticsearch query the API runs is built here, so reviews have one place
 * to check sizes, filters and cost.
 */
import { worldToGeo, type Circle } from '@meetspace/venue';

type Json = Record<string, unknown>;

export const MAX_BOOTHS = 200;
export const MAX_PLAYERS_RANKED = 5000;

/** Public booth fields. The QR check-in code stays on the server. */
export const PUBLIC_BOOTH_SOURCE = { excludes: ['code', 'location'] };

/** Sorted by slot: the quiz is generated from this order on both client and server. */
export function allBoothsQuery(withSecrets = false): Json {
  return { size: MAX_BOOTHS, _source: withSecrets ? true : PUBLIC_BOOTH_SOURCE, sort: [{ slot_id: 'asc' }] };
}

/** The battle-royale circle as a geo query (world metres -> geo_point). */
export function geoCircleFilter(circle: Circle): Json {
  const c = worldToGeo(circle.center);
  return { geo_distance: { distance: `${Math.max(0, circle.radius)}m`, location: { lat: c.lat, lon: c.lon } } };
}

export function boothsInZoneQuery(circle: Circle): Json {
  return { size: MAX_BOOTHS, _source: false, query: { bool: { filter: [geoCircleFilter(circle)] } } };
}

/** Visits per booth: drives the underdog bonus. */
export function visitsPerBoothQuery(): Json {
  return { size: 0, aggs: { booths: { terms: { field: 'booth_id', size: MAX_BOOTHS } } } };
}

/** Players ranked by total XP, with bonus XP and display name. */
export function leaderboardQuery(size = MAX_PLAYERS_RANKED): Json {
  return {
    size: 0,
    aggs: {
      players: {
        terms: { field: 'player_id', size: Math.min(Math.max(size, 1), MAX_PLAYERS_RANKED), order: [{ xp: 'desc' }, { _count: 'desc' }] },
        aggs: {
          xp: { sum: { field: 'xp' } },
          bonus_xp: { sum: { field: 'bonus' } },
          name: { top_hits: { size: 1, _source: ['leaderboard_name'], sort: [{ '@timestamp': 'desc' }] } },
        },
      },
    },
  };
}

export function playerCheckinsQuery(playerHash: string): Json {
  return { size: MAX_BOOTHS, _source: ['booth_id'], query: { term: { player_id: playerHash } }, aggs: { xp: { sum: { field: 'xp' } } } };
}

/** Organizer dashboard: totals, players, how much XP came from underdog bonuses, traffic heatmap. */
export function organizerStatsQuery(): Json {
  return {
    size: 0,
    track_total_hits: true,
    aggs: {
      players: { cardinality: { field: 'player_id' } },
      xp: { sum: { field: 'xp' } },
      bonus: { sum: { field: 'bonus' } },
      per_minute: { date_histogram: { field: '@timestamp', fixed_interval: '1m', min_doc_count: 0 } },
      heatmap: { geotile_grid: { field: 'location', precision: 22 } },
    },
  };
}
