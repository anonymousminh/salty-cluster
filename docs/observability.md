# Observability: OpenTelemetry + Dash0

## Pipeline
```
web (Dash0 Web SDK: page views, web vitals, fetch, errors, game events) ─────────► Dash0
api (OTel Node SDK: traces, metrics, logs) ─OTLP─► OTel Collector ─OTLP─► Dash0
k8s events + pod metadata (k8sattributes) ─────────► Collector
```
- Node bootstrap: [`packages/telemetry`](../packages/telemetry/src/index.ts), loaded before anything else in `apps/api/src/index.ts`.
- Collector: [`deploy/k8s/collector-config.yaml`](../deploy/k8s/collector-config.yaml) in the cluster, [`otel/collector-local.yaml`](../otel/collector-local.yaml) locally.
- Browser: [`apps/web/src/telemetry.ts`](../apps/web/src/telemetry.ts) (game: also sends `game_mode`, `player_joined`, `booth_checkin`, `booth_checkin_failed` and `fps_low` events) and [`apps/console/src/telemetry.ts`](../apps/console/src/telemetry.ts). Set `VITE_DASH0_ENDPOINT` / `VITE_DASH0_AUTH_TOKEN` (ingest-only token, it is public).

## Traces
Auto-instrumentation covers HTTP, Fastify and pino. The Elasticsearch client emits its own spans. One check-in:
`POST /api/booths/:id/checkin` → `GET game/current` → `GET players` → `search booths` → `checkin.score` (manual span:
`checkin.method`, `checkin.xp`, `checkin.bonus`, or `checkin.rejected` with the reason) → `search booths (geo_distance)` →
`search checkins (terms agg)` → `index checkins`.

## Metrics
| Metric | Type | Attributes | Why |
|---|---|---|---|
| `game.checkins` | counter | `booth`, `method` (game/qr), `bonus` | Traffic per booth: is the underdog bonus spreading people out? |
| `game.checkins.rejected` | counter | `reason` (`wrong_answer`, `dwell_too_short`, `in_storm`, `bad_code`, `already_visited`, `game_not_live`) | Confusing quiz? Broken QR sticker? Everyone stuck in the storm? |
| `game.checkin.xp` | histogram | `booth` | Scoring distribution |
| `game.players.joined` | counter | | Adoption |
| `game.circle.radius` | gauge (m) | | Overlay circle changes on traffic charts |
| `game.booths.in_zone` / `game.booths.total` | gauge | | |
| `game.circle.changes` | counter | `kind` (`set`, `shrink`, `scheduled_shrink`) | Organizer actions and automatic shrinks |

No session or player ids in metric attributes (high cardinality and privacy).

## Logs
Structured JSON from pino with `trace_id`/`span_id`, exported via OTLP. Events: `player.joined`, `checkin.accepted`,
`circle.set`, `circle.shrunk` (with `scheduled: true` when automatic), `circle.shrink_scheduled`, `game.status`, `game.reset`. Request logs carry the route pattern, never the raw URL
(URLs contain player ids).

## Dashboard and SLOs (build in Dash0)
**"Salty-Cluster Game Health"**
1. Check-ins/min by booth (stacked) with `game.circle.radius` overlaid: watch the crowd follow the circle.
   Run `pnpm simulate` against the cluster to generate traffic before the demo.
2. Rejections by reason.
3. API p95 latency for `POST /api/checkins`, error rate.
4. RUM: LCP/INP on mobile, JS errors.
5. Pod restarts and CPU (cross-check in Radar).

SLOs:
| SLO | SLI | Target |
|---|---|---|
| Check-ins succeed | non-5xx `POST /api/booths/:id/checkin` / all | 99.5% |
| Check-ins are fast | p95 `POST /api/booths/:id/checkin` < 500 ms | 99% |
| Leaderboard is fresh | `GET /api/leaderboard` non-5xx | 99.5% |

## Agent0 / MCP
Connect the Dash0 MCP server to your coding agent and ask, for example:
- "Which spans in service api got slower since the last deploy?"
- "Why are check-ins being rejected in the last 15 minutes?" (reads `game.checkins.rejected` by `reason`)
- "Show the slowest check-in traces and their Elasticsearch child spans."

Write up anything real you find (symptom, Agent0 finding, fix PR, before/after) in `docs/incidents/`. That is demo evidence.
