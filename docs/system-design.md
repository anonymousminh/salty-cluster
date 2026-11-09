# MeetSpace — System Design

> Team reference. Companion docs: [`../MeetSpace_Hackathon_MVP.md`](../MeetSpace_Hackathon_MVP.md) (product scope and demo) and [`venue-integration.md`](venue-integration.md) (how to plug into the game client and its API contract).

## What changed
MeetSpace started as an in-person networking app for a real venue (The Shop Workspace in Salt Lake City, built from its floor plans). The idea shifted twice:

1. **From a real floor plan to our own map.** The Shop Workspace is no longer used. We design our own conference world, **Expo Park**.
2. **From a 3D map to a game you play.** MeetSpace is now a **virtual conference played as a 3D game**: attendees sign up in a lobby, then walk a 3D character around the park, visit sponsor booths for XP, match with other attendees, and walk to meetup points.

Consequences for the design:
- No venue Wi-Fi problem and no real-world positioning. Attendees are online, so what matters is **client performance** (3D on phones), **presence traffic** (800 moving players) and **cheat resistance** (XP has to be earned by actually being at the booth).
- Booth visits are verified by **walk-up check-in** (proximity + dwell time + a quick question), not by staff scanning a badge.
- Matching, booking and real-time delivery are unchanged.

## 0. Status

| Area | Status |
|---|---|
| World data, 3D game client, lobby, HUD, booth check-in flow, scoring and quiz helpers | **Built** in `apps/web` and `packages/venue`, running against mocks. 12 unit tests pass. |
| Backend (Postgres, API, SSE), Elasticsearch ranking, swipe/match screens | **Designed here, not built.** Teammates' work. |
| Presence (multiplayer) | **Designed here, not built.** The client currently shows 12 simulated attendees. |
| Auth, observability, infrastructure, load tests | **Designed here, not built.** |

Everything below marks which parts are built (**[built]**) and which are proposals (**[proposed]**).

## 1. Requirements and capacity

**Functional**
- Lobby sign-up with a player profile and a 3D character preview **[built, local only]**
- Walkable 3D world with collisions, a third-person camera and keyboard/touch controls **[built]**
- Sponsor booths with walk-up check-in, XP, an underdog bonus and a live leaderboard **[built on mocks]**
- Ranked "people to meet" deck with a "why connect" explanation, swipe, mutual match, real-time notification **[proposed]**
- Meetup-point suggestion and booking without double-booking, plus a waypoint to the meetup **[waypoint built, booking proposed]**
- Presence: see other attendees move around **[proposed]**
- Block and report **[proposed]**

**Targets** (proposed)

| Metric | Target |
|---|---|
| Deck fetch (20 cards) p95 | < 250 ms |
| Swipe write p95 | < 100 ms |
| Match → both players notified p95 | < 1 s |
| Presence: your move visible to nearby players | < 300 ms typical |
| Booth check-in response p95 | < 300 ms |
| Time to first interactive 3D frame on a mid-range phone, after the lobby | < 5 s |
| Availability during event hours | 99.9 %; survives the loss of any one API task or AZ |

**Load model** (peak: a keynote ends and everyone opens the app). Design for 800 concurrent players, with headroom to 2,000. These are estimates and need a load test:
- Swipes: about 270 writes/s at peak, about 120k rows per event. Deck queries: about 15/s.
- Booth check-ins: bursty but small (800 players × about 8 booths over several hours).
- Presence: 800 players × 10 Hz = **8,000 inbound updates/s**. Sending everything to everyone would be 800 × 799 × 10 ≈ 6.4 M updates/s ≈ 75 MB/s, which is impossible. So presence needs **interest management** (§8): each client only receives the nearest players.
- Long-lived connections: 800–2,000 (one WebSocket for presence, one SSE stream for events).

The hard parts are correctness (no double matches or overbooking, XP that can't be farmed), presence fan-out, and 3D performance on phones. Raw throughput is not.

## 2. Architecture [proposed, AWS us-west-2]

```
 Phones / laptops (React 19 + R3F + Rapier) ──▶ CloudFront (app, character.glb, textures)
        │ REST + SSE                │ WebSocket (presence)
        ▼                           ▼
 ALB ─▶ ECS Fargate (2 AZs)
         ├─ api service        Fastify, 2→6 tasks, autoscaled; REST + SSE
         ├─ presence service   1 task per event (zone rooms in memory, 5–10 Hz tick)
         ├─ indexer service    outbox → Elasticsearch, 1 task, PG advisory-lock leader
         └─ OTel Collector sidecar per task ──OTLP──▶ Dash0
        │
        ├─ RDS Postgres 16 (Multi-AZ): source of truth + LISTEN/NOTIFY fan-out
        └─ Elastic Cloud: derived attendee index (matching)
 CI: GitHub Actions → SonarCloud quality gate → image to ECR → ECS rolling deploy (circuit breaker + auto-rollback)
```

Design decisions:
1. **Postgres is the source of truth. Elasticsearch is a derived read model**, synced through a transactional outbox. If Elasticsearch fails, the deck falls back to a Postgres ranking query.
2. **No Redis at this scale.** Postgres `LISTEN/NOTIFY` fans events out across API tasks. Rate limits are per-task in-memory token buckets, which is up to N× looser with N tasks, and acceptable because writes are idempotent. Revisit above about 10k concurrent users.
3. **SSE for server→client events** (match, `booth.visited`, `leaderboard.changed`). `Last-Event-ID` maps onto an inbox catch-up (`GET /me/inbox?since=`), so a dropped connection never loses a match.
4. **WebSocket for presence only**, because it needs client→server positions at 5–10 Hz. Presence is **ephemeral**: it is never written to Postgres. If the presence task dies, clients reconnect and their next position update rebuilds the room.
5. **Managed stateful services (RDS, Elastic Cloud), stateless containers on Fargate.** A bad deploy rolls back through the ECS circuit breaker.

## 3. Data model (Postgres) [proposed]

```
events(id, name, starts_at, ends_at)
attendees(id, event_id, name, role, looking_for[], offers[], skills[], interests[], bio,
          avatar_color, show_on_leaderboard)
swipes(event_id, from_id, to_id, direction, created_at, PK(event_id, from_id, to_id))
matches(id, event_id, user_a, user_b, UNIQUE(event_id, LEAST(a,b), GREATEST(a,b)))
spots(id, zone, name, kind, capacity_pairs, anchor_x, anchor_z)       -- seeded from packages/venue
slots(spot_id, starts_at, capacity, reserved, PK(spot_id, starts_at))
meetings(id, match_id UNIQUE, spot_id, starts_at, status)
companies(id, name, color, tagline, hiring[], tags[])
booths(id, company_id, slot_id)                                        -- slot_id = b01…b16 from packages/venue
booth_visits(booth_id, attendee_id, base, bonus, created_at, PK(booth_id, attendee_id))
inbox(id bigserial, user_id, type, payload, created_at)                -- also the SSE event ids
outbox(id, aggregate, payload, processed_at) ; blocks ; reports
```

- **New profile field:** "Can help with" (`offers[]`). Complementary matching becomes `my.looking_for ∩ their.offers`.
- **No double match** (one transaction): insert the swipe (`ON CONFLICT DO NOTHING`), check for the reciprocal right swipe, then `INSERT matches … ON CONFLICT DO NOTHING RETURNING id`. The canonical-pair unique index lets exactly one transaction win; only the winner writes two `inbox` rows and calls `NOTIFY`.
- **No overbooking** (one statement): `UPDATE slots SET reserved = reserved + 1 WHERE spot_id=$1 AND starts_at=$2 AND reserved < capacity RETURNING *`. Zero rows means `409` with alternative slots. `meetings.match_id UNIQUE` stops one match booking twice.
- **One XP credit per booth per attendee** is the primary key of `booth_visits`. A repeat check-in returns `409`.
- **Idempotency:** mutations carry an `Idempotency-Key` header, so retries on flaky connections are safe.

Meetup points are a coordination limit, not a physical one: nothing stops many avatars standing in the same place. The 11 current points allow 26 pairs at once, so 24 slots (6 hours × 15 min) give about 624 meetings, which covers 800 people each meeting one person (400 pairs). Add spots in `packages/venue` to raise it.

## 4. Matching and ranking (Elasticsearch) [proposed]
- `bool.must_not`: self, already-swiped users, blocks in both directions.
- `bool.should` with **named queries**, so each hit's `matched_queries` produces the "Why connect?" text deterministically, with no LLM:
  - `their.offers ∈ my.looking_for` (×4), `their.looking_for ∈ my.offers` (×3), shared interests (×1.5), shared skills (×1), bio (×0.5)
- `function_score` adjustments: **popularity dampening** (decay on inbound right-swipes, so attention spreads), a small **reciprocity boost** when they already liked me, and a **freshness** boost for recent joiners.
- The score is normalised to 0–100 and labelled "illustrative".
- **Fallback:** if Elasticsearch fails, a Postgres array-overlap ranking takes over.
- **Phase 2:** `dense_vector` + kNN hybrid with reciprocal rank fusion.

## 5. World and game client [built]
**World data** lives in `packages/venue` and is shared by the client and the API:

| Zone | Contents |
|---|---|
| Spawn Plaza | Entrance arch, fountain, 2 café meetup tables |
| Expo Street | 10 sponsor booths in two facing rows |
| Careers Corner | 6 booths |
| Networking Garden | 6 tables, a lounge and a bench |
| Keynote Stage | Stage, screen, benches, a stage-side lounge |

- Coordinates are meters: origin at the park centre (96 × 96 m), +x east, +z south.
- **16 booth slots** (`b01`–`b16`) and **11 meetup points** (`mp-…`). Companies are assigned to slots by the API, so a sponsor can move without a map change.
- `validateWorld()` (tested) checks that booths and meetup points are inside the park, clear of obstacles and paths, and booths are at least 4 m apart. Trees come from a seeded generator, so they are identical on every machine.

**Client stack:** React 19, React Three Fiber 9, drei 10, **Rapier** physics (`@react-three/rapier`), **ecctrl 2** (pmndrs character controller) and zustand for game state.
- Third-person follow camera. Desktop: WASD/arrows, Shift to run, Space to jump, E to talk, drag to orbit, wheel to zoom. Phones: joystick plus Jump and Talk buttons.
- `game/Player.tsx` bridges keyboard, joystick and buttons into ecctrl, freezes input while a dialog is open, and publishes position and proximity at about 10 Hz.
- **Character:** a procedural toy-style body by default. A rigged CC0 glTF (for example KayKit Adventurers) can be dropped in at `apps/web/public/characters/player.glb` and is picked up automatically, with idle/walk/run/jump/cheer clips matched by name. Ready Player Me shut down on 2026-01-31, so we do not build on it.
- **HUD:** compass, minimap, XP/level bar, leaderboard, toasts, booth dialog, and a waypoint beam with ground arrows.

**Performance** (measured on a production build, not yet on a real phone):
- The main bundle is about 870 KB gzipped, largely the inlined Rapier physics WASM (not profiled). Proposal: lazy-load the game chunk after the lobby.
- Trees are instanced. The client should draw only the nearest N other players (§8).

## 6. Booth quest: scoring and check-in [built on mocks]
**Scoring** (`packages/venue/src/scoring.ts`, shared so the map and the server agree):
- A first visit is worth `BASE_XP = 10` plus an **underdog bonus** `round(MAX_BONUS × clamp((avgVisits − visits) / max(avgVisits, 1), 0, 1))`, with `MAX_BONUS = 25`.
- The bonus is locked in at check-in time. A booth with a bonus of at least 15 is a **bounty** (gold beam on the map).
- Effect: sponsors with few visitors are worth more, so traffic spreads across the park.

**Check-in** (`packages/venue/src/interaction.ts`, shared constants):
1. Walk within `CHECKIN_RADIUS = 4.5 m` of the booth front and press E.
2. Chat for `DWELL_SECONDS = 6`.
3. Answer one question (`boothQuiz`, three options, deterministic per booth). A wrong answer locks it for 5 s.
4. `POST /booths/:id/checkin` awards XP.

The quiz is friction and a prompt to read the pitch, **not security**: the client can derive the answer. The real controls are proximity, dwell time verified by the server, one credit per booth, and rate limits (§9).

## 7. Real-time presence (multiplayer) [proposed]
- **Protocol:** WebSocket. The client sends `{x, z, heading, state}` at about 10 Hz. The server validates and sends back snapshots at 5 Hz.
- **Rooms:** one in-memory room per zone-group, so players only ever receive neighbours.
- **Interest management:** each snapshot contains the nearest 40 players within about 40 m. Estimated cost: about 12 B per player update, so about 0.5 KB per snapshot per client, about 2.5 KB/s per client, about 2 MB/s and 4,000 msgs/s for 800 clients on one task. Validate with a load test before trusting this.
- **Client:** interpolates snapshots (about 100–200 ms buffer). The bots in `game/world/Bots.tsx` use the same renderer, so real players replace them without a rendering change.
- **Opt-in:** a player who does not opt in is not broadcast to others.
- **Server uses presence for check-in:** the check-in endpoint asks the presence service whether the player has been within the radius for at least 6 s.

## 8. API surface [proposed; zod schemas in `packages/shared`, OpenAPI generated]
```
POST /events/:id/join     { name, role, lookingFor[], skills[], color, showOnLeaderboard } → session
PUT  /me/profile          GET /me/deck?limit=20        POST /swipes → { matched, matchId? }
GET  /me/matches          GET /me/stream (SSE)         GET /me/inbox?since=
GET  /spots/suggest?matchId=   GET /spots/availability
POST /meetings → 201 | 409 { alternatives }            POST /meetings/:id/confirm
GET  /booths              GET /booths/stats            GET /me/progress     GET /leaderboard?limit=10
POST /booths/:id/checkin  { dwellMs, quizAnswer } → { xpGained, base, bonus } | 409 already_visited | 422 not_eligible
POST /blocks   POST /reports   GET /healthz /readyz
WS   /presence            SSE events: match.created, booth.visited, leaderboard.changed
```

## 9. Security, privacy, abuse
- **Auth:** event code plus email OTP issues a short-lived JWT. The hackathon demo keeps a no-auth feature flag.
- **Check-in integrity:** the server verifies dwell from presence, enforces one credit per booth, and rate-limits check-ins. **Movement sanity:** reject position jumps above a maximum speed (running is about 7 m/s), which blocks teleport hacks.
- **Privacy:** left swipes and pre-match likes are never revealed. Blocks apply in both directions. The leaderboard shows the display name the player chose, or "Anonymous". Presence is opt-in.
- **Rate limits:** swipes 60/min, OTP 5/h, check-ins 10/min.
- **Retention:** minimal personal data, deleted 30 days after the event.
- **Telemetry hygiene:** user IDs are HMAC-hashed in spans and logs. Names, bios and emails never go into attributes, and the OTel Collector redacts as a backstop.
- **Code quality:** SonarCloud gate blocks merges on new bugs or vulnerabilities, or coverage below 70 % for `apps/api`.

## 10. Platform and observability [proposed]
Sponsor tools were suggestions, evaluated on merit.

**Hosting: ECS Fargate** over Kubernetes or a PaaS:

| | ECS Fargate (chosen) | EKS + Radar | Fly.io / Render |
|---|---|---|---|
| Ops burden | Low: no nodes or cluster | High: cluster, Helm, IAM, upgrades | Lowest |
| Multi-AZ, autoscale, auto-rollback | Yes (deployment circuit breaker) | Yes (HPA/PDB) | Partial |
| Private link to RDS / Elastic | Yes (same VPC) | Yes | No (public egress) |
| Cost for the event month (rough) | about $40–80 | +$73 control plane + nodes | about $30–60 |
| Fit for 800–2,000 users | Right-sized | Over-engineered | OK, weaker HA story |

Radar (radarhq.io, an open-source Kubernetes UI) only pays off once you run Kubernetes. **Revisit** if we move to Kubernetes (multi-event SaaS, more than about 10 services).

**Observability: Dash0** (OpenTelemetry-native). It covers traces, logs, metrics, web events, synthetic checks, and SLOs with burn-rate alerts. Data stays in the Oregon region, and instrumentation is pure OTLP, so switching backends (for example Grafana Cloud's free tier) only changes the collector exporter.
- **Backend:** `@opentelemetry/auto-instrumentations-node` into a collector sidecar that does tail sampling (keep all errors and slow traces, about 20 % of the rest) and PII redaction, then forwards to Dash0.
- **Browser:** `@dash0/sdk-web` with an ingest-only token scoped to one dataset (browser tokens are public). `traceparent` propagates so a slow swipe or check-in traces from tap to Postgres.
- **Business metrics:** swipes/s, matches/min, check-ins/min, XP awarded, bounty hit rate, presence connections and tick time.
- **SLOs and alerts:** deck, swipe and check-in p95; match notify latency; error rate; Elasticsearch fallback rate above 5 %; check-in `422` rate (a spike suggests cheating or a client bug).
- **Cost:** pricing is per signal (about $0.06 per million spans ingested, $0.54 per million stored). A rough event estimate is $10–30. The 14-day trial needs no card; start it within 14 days of the event or budget about $50 and set a monthly cap.
- **Risks:** the region is fixed when the organisation is created, there is no permanent free tier, and some features are beta.

## 11. Repo layout (pnpm monorepo)
```
apps/web          React + Vite game client
  src/App.tsx       phase shell: lobby ↔ playing, demo drawer, match card
  src/lobby/        sign-up form, 3D character preview, profile storage
  src/game/         GameCanvas, Player (ecctrl), store, HUD, world/ (ground, scenery, booths, markers, bots),
                    character/ (procedural + glTF), questMock.ts, mock.ts
  public/characters/  README + optional player.glb
packages/venue    @meetspace/venue: world data, booth slots, scoring, check-in rules, quiz, quest types, validation, tests
apps/api          [proposed] Fastify routes; services: rank, match, booking, checkin, stream (SSE)
apps/presence     [proposed] WebSocket presence service
apps/indexer      [proposed] outbox → Elasticsearch worker
packages/shared   [proposed] zod schemas and API types
infra/            [proposed] Terraform (VPC, ECS, ALB, RDS, CloudFront, Elastic Cloud, Dash0 rules), otel-collector.yaml
docker-compose.yml  [proposed] Postgres + Elasticsearch + OTel collector for local development
```
The shared package is still named `@meetspace/venue` even though it now holds the Expo Park world.

## 12. Delivery phases

**Phase 0: hackathon demo**
- Built: lobby, Expo Park, third-person 3D character, booth check-in with underdog bonus and leaderboard, matched-meetup waypoint, HUD, bots, world validation and tests (all on mocks).
- Next, with teammates: swipe/match flow, ranking with named queries, the atomic match transaction, real join and check-in endpoints, a SonarCloud scan.
- Skip for the demo: auth, outbox (write to Elasticsearch directly), real presence.

**Phase 1: event-ready**
- ECS Fargate + RDS + CloudFront + Elastic Cloud via Terraform
- OTP auth, outbox indexer, SSE with `LISTEN/NOTIFY`, slot booking
- Presence service with interest management, check-in verification from presence
- Popularity dampening, Postgres fallback, block/report, rate limits
- Dash0 SLOs, alerts and synthetic checks; on-call runbook (Elasticsearch kill switch, freeze bookings, broadcast banner, ECS rollback)
- k6 test at 2,000 virtual users, plus a presence load test

**Phase 2:** embeddings and hybrid ranking, proximity chat or voice at meetups, organiser dashboard (visit funnel, bounty effect), keynote events, post-event follow-ups.

## 13. Verification
- **Unit [built]:** world validation, check-in proximity, quiz determinism, underdog scoring (monotonic, no divide-by-zero), career-fit matching.
- **Unit [proposed]:** query builder → explanation mapping, spot-suggestion scoring.
- **Concurrency [proposed] (testcontainers Postgres):** 1,000 parallel reciprocal swipes produce exactly one match per pair and two inbox rows; 200 parallel bookings on a capacity-3 slot give 3 successes and 197 `409`s; 100 parallel check-ins by one player on one booth give exactly one XP credit.
- **E2E [proposed] (Playwright):** join → walk to a booth → check in → XP and leaderboard update; swipe the seeded reciprocal user → the match arrives in the other browser → the waypoint appears.
- **Presence [proposed]:** 800 simulated clients at 10 Hz; verify snapshot rate, CPU, and the interest-management cap.
- **Load [proposed] (k6, 2,000 virtual users, spike profile):** check §1 targets.
- **Chaos [proposed]:** stop an API task mid-test (no lost matches); block Elasticsearch (decks keep serving); kill the presence task (clients rejoin); a failing `/readyz` deploy rolls back within about 5 minutes.
- **Client performance [to do]:** frame rate and load time on a mid-range phone, with and without the optional character file.
- **Demo:** the two-minute script in the MVP doc runs end to end.

## 14. Open decisions
- **What happens when two matched players meet?** Options are text chat, proximity voice, or a link to an external video call. The demo only shows the waypoint and arrival.
- **Virtual only, or hybrid?** If there is also a physical event, booth staff can still scan badges and the same XP rules apply.
- **Character asset:** confirm the KayKit licence terms on the download page before shipping, and decide whether players can pick between several characters.
- **Reconcile with the repo README.** It describes an organiser-controlled shrinking circle, Elasticsearch geo queries, and Kubernetes on Radar with Argo CD. The design here uses walk-up check-in and ECS Fargate. The team should agree which of those ideas stay.
- **Prizes and fairness:** confirm leaderboard prize rules with the organisers, and decide how to handle shared accounts.
- **Dash0:** start the trial within 14 days of the event, or budget about $50.
