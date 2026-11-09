# Elasticsearch: the game engine

Elasticsearch is the **only datastore** for the game. Every rule is an Elasticsearch query or aggregation,
all built in [`apps/api/src/es/queries.ts`](../apps/api/src/es/queries.ts).

## Indices
| Index | What | Key fields |
|---|---|---|
| `booths` | Sponsors in their Expo Park slots | `slot_id`, `company`, `tagline`, `location` **geo_point** (from the slot's world position), `code` (QR, never public) |
| `checkins` | One doc per player per booth (doc id `playerHash:boothId`, `op_type: create`) | `booth_id`, `player_id`, `leaderboard_name`, `xp`, `base`, `bonus`, `method` (game/qr), `location` geo_point, `round`, `@timestamp` |
| `players` | Lobby profiles (doc id = salted hash of the session id) | `name`, `role`, `skills`, `looking_for`, `show_on_leaderboard` |
| `game` | Single doc `current`: status, round, circle, scheduled shrink | `state` (stored, not indexed), `circle_geo` geo_point, `radius_m` |

Mappings: [`elastic/mappings/`](../elastic/mappings). Booths come from `DEMO_SPONSORS` + `BOOTH_SLOTS` in `@meetspace/venue` (`pnpm seed`).

## How the rules map to Elasticsearch
| Game rule | Elasticsearch feature |
|---|---|
| **The circle** | `geo_distance` filter on `booths.location`. Expo Park's world metres are projected onto a geo origin (`worldToGeo`), so the radius is real metres |
| **Underdog bonus** | `terms` aggregation on `checkins.booth_id`, then `computeBoothStats` from the shared scoring rules |
| **Live leaderboard** | `terms` on `player_id` ordered by a `sum` of `xp`, with a `sum` of `bonus` (the "underdog hunter" tag) and `top_hits` for the display name |
| **One check-in per booth** | Deterministic doc id + `op_type: create`. ES returns 409, with no race between double taps |
| **Scheduled shrink, exactly once** | `game` doc read with `_seq_no`/`_primary_term`, written with `if_seq_no`/`if_primary_term`. One API replica wins, the others get 409 and re-read |
| **Organizer stats** | `cardinality` (players), `sum` (XP, bonus XP → bonus share), `date_histogram` (check-ins/min), `geotile_grid` on check-in locations (heatmap) |

```json
{ "geo_distance": { "distance": "20m", "location": { "lat": 40.76075, "lon": -111.89111 } } }
```

```json
{ "terms": { "field": "player_id", "size": 5000, "order": [{ "xp": "desc" }, { "_count": "desc" }] },
  "aggs": { "xp": { "sum": { "field": "xp" } }, "bonus_xp": { "sum": { "field": "bonus" } },
            "name": { "top_hits": { "size": 1, "_source": ["leaderboard_name"] } } } }
```

## Verified against a real cluster
`pnpm smoke` (CI runs it against an Elasticsearch service container) plays a full game. It asserts:
- the geo zone matches world-metre distances
- quiz, QR code and duplicate checks
- the underdog bonus from aggregations
- the leaderboard order and the "me" entry
- a scheduled shrink firing
- the organizer stats

## Local without Elasticsearch
`pnpm dev:memory` runs the same API code on an in-memory stand-in (`apps/api/src/dev/memory-es.ts`) that evaluates
these query shapes. It is used by the unit and e2e tests and for laptop demos. It is never deployed.

## Changing mappings
Mappings can't change in place. Create `checkins-v2`, `_reindex`, and switch the name in `apps/api/src/es/indices.ts`.
For a hackathon reset, `pnpm es:setup -- --reset` drops everything.
