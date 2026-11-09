# MeetSpace — System Design (team reference)

> **Update (2026-11-09):** MeetSpace is now a **virtual conference played as a 3D game** in our own world, **Expo Park**. The Shop Workspace floor plans are no longer used.
> - Attendees sign up in a lobby, then walk a 3D character around the park.
> - They check in at sponsor booths by walking up, chatting and answering a quick question.
> - Matches meet at meetup points.
>
> §5 below is rewritten for this. Elsewhere, read "venue" as Expo Park and "staff badge scan" as walk-up check-in. The backend design (matching, booking, SSE, observability) is unchanged.

## Context
`MeetSpace_Hackathon_MVP.md` describes a one-day MVP (Discover → Connect → Meet) with an in-memory store, seeded profiles, and three made-up meeting spots. This plan is a staff-engineer design that keeps the hackathon flow and the demo moment (a mutual match flies the 3D camera to a table) and holds up for **800+ concurrent real attendees** at The Shop Workspace. It uses the real layout from `The-Shop-Floor-Plans.pdf` (3rd and 4th floors). Sponsor tech: **Elasticsearch** (ranking) and **SonarSource** (quality gate). Optional tools evaluated on merit: **Dash0** was adopted for observability. **Radar** (radarhq.io, a Kubernetes UI) was not adopted because this design does not run Kubernetes; see §8.

The repo holds only the two docs, so this is a new build. The official virtual-tour page names no provider and exposes no embeddable model ID (the site also blocks automated fetches). **Decision:** we build our own lightweight 3D model from the PDF and add a "See the real space" button that links out to the official tour. We do not re-host their scans.

---

## 1. Requirements & capacity math

**Functional:** join, profile, ranked deck with "why connect", swipe, mutual match, real-time match notification, spot/slot booking without double-booking, 3D fly-to, confirmation, block/report.

**SLOs** (encoded as Dash0 SLOs, see §9)
| Metric | Target |
|---|---|
| Deck fetch (20 cards) p95 | < 250 ms |
| Swipe write p95 | < 100 ms |
| Match → both users notified p95 | < 1 s |
| 3D venue first render on venue Wi-Fi | < 3 s; `venue.glb` ≤ 2 MB |
| Availability during event hours | 99.9 %; survives loss of any one task or AZ |

**Load model (peak: keynote ends and everyone opens the app):** 800 concurrent users, designed for 2,000.
- **~270 swipe writes/s peak**, ~120k swipe rows per event
- ~15 deck queries/s
- 800–2,000 long-lived streams
- 800² = 640k candidate pairs, which is small

Throughput is not the hard part. Correctness (no double matches, no overbooking), fairness, and **venue Wi-Fi** are. 800 phones share one coworking network, so payloads stay small, assets are cached at the CDN, and the app ships as an offline-tolerant PWA.

## 2. Architecture (AWS us-west-2 / Oregon, chosen for SLC latency and Dash0's Oregon region)

```
 Phones (PWA: React+TS, R3F, Dash0 Web SDK) ──▶ CloudFront CDN (app, venue.glb, avatars)
        │ REST + SSE
        ▼
 ALB ─▶ ECS Fargate (2 AZs)
         ├─ api service (Fastify, 2→6 tasks, target-tracking autoscale on CPU + req/target)
         ├─ indexer service (outbox → Elasticsearch, 1 task, PG advisory-lock leader)
         └─ OTel Collector sidecar per task ──OTLP──▶ Dash0 (Oregon)
        │
        ├─ RDS Postgres 16 (Multi-AZ): source of truth + LISTEN/NOTIFY fan-out
        └─ Elastic Cloud (us-west-2): derived attendee index
 CI: GitHub Actions → SonarCloud quality gate → image to ECR → ECS rolling deploy (circuit breaker + auto-rollback)
```

### Design revisions after review (simplify where scale allows)
1. **Drop Redis.** At 800–2,000 users, Postgres `LISTEN/NOTIFY` replaces Redis for cross-task fan-out. Each task LISTENs on `match_events` and pushes to its own local connections. Rate limiting moves to a per-task in-memory token bucket. With 2–6 tasks the effective limit is at most N× looser, which is acceptable, and swipes are idempotent anyway. The deck cache becomes an in-process LRU (60 s). That is one fewer stateful dependency to run, secure, and monitor. *Revisit if more than ~10k concurrent users.*
2. **Use SSE instead of WebSockets.** Every real-time message is server→client. SSE runs over plain HTTP/2 through the ALB/CDN and reconnects on its own. Its `Last-Event-ID` maps directly onto the inbox catch-up (`GET /me/inbox?since=`), so a dropped connection never loses a match.
3. **Use managed stateful services (RDS, Elastic Cloud) and stateless containers on Fargate.** There are no servers or clusters to operate. A bad deploy rolls back automatically through the ECS deployment circuit breaker.
4. **Postgres is the source of truth. Elasticsearch is a derived read model** synced through a transactional outbox. If Elasticsearch fails, the deck falls back to a Postgres ranking query.

## 3. Data model (Postgres)
```
events(id, name, venue_id, starts_at, ends_at)
attendees(id, event_id, name, role, interests[], skills[], looking_for[], offers[], bio, visibility)
swipes(event_id, from_id, to_id, direction, created_at, PK(event_id, from_id, to_id))
matches(id, event_id, user_a, user_b, UNIQUE(event_id, LEAST(a,b), GREATEST(a,b)))
spots(id, venue_id, floor, name, kind, capacity_pairs, anchor_xyz, camera_pose)
slots(spot_id, starts_at, capacity, reserved, PK(spot_id, starts_at))
meetings(id, match_id UNIQUE, spot_id, starts_at, status)
inbox(id bigserial, user_id, type, payload, created_at)   -- also SSE event ids
outbox(id, aggregate, payload, processed_at) ; blocks ; reports
```
- **New profile field:** "Can help with" (`offers[]`). Complementary matching becomes `my.looking_for ∩ their.offers`.
- **No double match:** handled in one transaction. Insert the swipe (`ON CONFLICT DO NOTHING`), then check for the reciprocal right swipe. If it exists, `INSERT matches ... ON CONFLICT DO NOTHING RETURNING id`. The canonical-pair unique index lets exactly one transaction win. Only the winner writes two `inbox` rows and calls `NOTIFY`.
- **No overbooking:** one atomic statement, `UPDATE slots SET reserved=reserved+1 WHERE spot_id=$1 AND starts_at=$2 AND reserved<capacity RETURNING *`. Zero rows means a `409` response with alternative slots. `meetings.match_id UNIQUE` stops a match from booking twice.
- **Idempotency:** every mutation carries an `Idempotency-Key` header, because venue Wi-Fi causes retries.

## 4. Matching & ranking (Elasticsearch)
- `bool.must_not`: self, already-swiped users, blocks in both directions.
- `bool.should` with **named queries**, so each hit's `matched_queries` produces the "Why connect?" text deterministically with no LLM:
  - `their.offers ∈ my.looking_for` (×4)
  - `their.looking_for ∈ my.offers` (×3)
  - shared interests (×1.5)
  - shared skills (×1)
  - bio (×0.5)
- `function_score` adjustments:
  - **Popularity dampening:** a decay on inbound right-swipes, so attention spreads and more attendees match.
  - **Reciprocity boost:** a quiet bump when they already liked me.
  - **Freshness:** a boost for recent joiners.
- The score is normalized to 0–100 and labeled "illustrative".
- **Fallback:** if Elasticsearch fails, a Postgres array-overlap ranking takes over.
- **Phase 2:** `dense_vector` + kNN hybrid with reciprocal rank fusion.

## 5. World & 3D game (Expo Park)
- **World data** (`packages/venue`, shared by the API and the client) defines:
  - **zones**: Spawn Plaza, Expo Street, Keynote Stage, Networking Garden, Careers Corner
  - **paths** and **obstacles** (physics colliders)
  - **16 booth slots** and **11 meetup points** (`mp-…`, with `capacityPairs`)
  - the spawn point

  Trees are scattered by a seeded generator. `validateWorld` keeps every booth and spot clear of obstacles and paths.
- **Client stack:** React Three Fiber 9 + drei 10 + **Rapier** physics + **ecctrl** (pmndrs character controller):
  - third-person camera
  - WASD, Shift, Space and E on desktop, a joystick plus Jump/Talk buttons on phones
- **Character:** a procedural default, or a drop-in CC0 KayKit glTF at `/characters/player.glb`. Ready Player Me shut down on 2026-01-31, so it is not an option.
- **Booth check-in (replaces staff scans):** within 4.5 m of the booth front → 6 s dwell → one quiz question → `POST /booths/:id/checkin`. The server should re-check dwell from presence pings.
- **Underdog bonus XP**, the leaderboard, and SSE `booth.visited` are unchanged.
- **Multiplayer:** bots for now. Real presence = positions at ~10 Hz over WebSocket per zone room, interpolated client-side. Each update is small (≈ 20 B per player per tick).
- **Performance:** the Rapier WASM adds ~0.5 MB gzip, so lazy-load the game chunk after the lobby. Trees are instanced. Bots are capped (12) on phones.

## 6. API surface (zod schemas in `packages/shared`, OpenAPI generated)
```
POST /events/:id/join   PUT /me/profile   GET /me/deck?limit=20
POST /swipes → {matched, matchId?}        GET /me/matches
GET  /me/stream (SSE)   GET /me/inbox?since=
GET  /spots/suggest?matchId=   GET /spots/availability
POST /meetings → 201 | 409 {alternatives}  POST /meetings/:id/confirm
POST /blocks  POST /reports   GET /healthz /readyz
```

## 7. Security & privacy
- **Auth:** event code + email OTP issues a JWT. A badge QR code deep-links to join. The demo keeps a no-auth feature flag.
- **Privacy:** left swipes and pre-match likes are never revealed. Blocks apply in both directions. Rate limits: swipes 60/min, OTP 5/h.
- **Data retention:** minimal PII, deleted 30 days after the event.
- **Telemetry hygiene (matters with a SaaS backend):** user IDs are **HMAC-hashed** in spans and logs. Names, bios, and emails never go into attributes. The OTel Collector has a redaction processor as a backstop. Dash0 does not support frequent per-user deletions, so we never send raw PII in the first place.
- **Code quality:** the SonarCloud quality gate blocks merges on new bugs or vulnerabilities, or on coverage below 70 % for `apps/api`.

## 8. Platform decision: ECS Fargate (Kubernetes + Radar considered, not adopted)
| | **ECS Fargate (chosen)** | EKS + Radar | Fly.io/Render |
|---|---|---|---|
| Ops burden | Low: no nodes/cluster | High: cluster, Helm, IAM, upgrades | Lowest |
| Multi-AZ, autoscale, auto-rollback | Yes (deployment circuit breaker) | Yes (HPA/PDB) | Partial |
| Same VPC as RDS/private Elastic link | Yes | Yes | No (public egress) |
| Cost (event month) | ~$40–80 for tasks | +$73 control plane + nodes | ~$30–60 |
| Fit for 800–2,000 users | Right-sized | Over-engineered | OK, weaker networking/HA story |

**Why not Radar:** radarhq.io is an open-source Kubernetes UI (topology, change timeline, Helm rollback, MCP). It is a good tool, but it only pays off once you run Kubernetes, and 800 users do not justify a cluster. ECS console + Dash0 traces/service map + deployment circuit breaker cover the event-day ops needs. **Revisit trigger:** a move to Kubernetes (multi-event SaaS, more than ~10 services). At that point Radar (local `kubectl radar`, OIDC + read-only RBAC if in-cluster) is a cheap add.

(radar.com, the location SDK, was also considered for in-venue presence and rejected: no free tier, beacons are Enterprise-only, the web SDK has no indoor or floor-level positioning, and live tracking is out of scope.)

## 9. Observability: Dash0 (OpenTelemetry-native)
**What it is:** an OpenTelemetry-native backend covering traces, logs, metrics, web/RUM events, session replay, and synthetic checks. It has PromQL-compatible check rules, built-in SLOs with burn-rate alerts, Terraform/CLI config-as-code, and an MCP server. The Oregon (us-west-2) region is available.

**Wiring:**
- **Backend:** `@opentelemetry/auto-instrumentations-node` (http, fastify, pg, undici for Elasticsearch) exports OTLP to an OTel Collector sidecar per task. The collector handles tail sampling, PII redaction, and batching, then forwards to the Dash0 Oregon endpoint with the auth token from AWS Secrets Manager. We add manual spans for `match.create`, `slot.reserve`, and `rank.query`, with attributes `match.created`, `slot.full`, and `es.fallback`.
- **Browser:** `@dash0/sdk-web` in the PWA, using a **separate ingest-only token scoped to one dataset**, since browser tokens are public. CSP `connect-src` allows the Dash0 ingress host. W3C `traceparent` propagates from the browser to the API, so a slow swipe traces end to end, from tap to Postgres.
- **Custom business metrics:** swipes/s, matches/min, meeting bookings, slot utilization per spot (an event-floor heatmap), and SSE connections.
- **Synthetic checks** every 1 min on `/readyz` and `GET /me/deck` for a canary user.
- **SLOs + alerts:**
  - deck p95, swipe p95, match notify latency, error rate
  - fast/slow burn-rate alerts
  - Elasticsearch fallback-rate > 5 %
  - slot `409` rate > 20 %, which means venue capacity is the problem, not code
  - all defined via Terraform/`dash0` CLI in `infra/observability/`
- **Cost control:** the collector keeps 100 % of error and slow traces and tail-samples 20 % of successful ones. Session replay is off, or 5 % if wanted.
  - Rough event-day volume: about 40M spans before sampling, about 10M after, plus about 0.5M web events and modest metrics. That is roughly $10–30 for the event at list prices.
  - The 14-day trial (no credit card) can cover the hackathon and a rehearsal **if started within 14 days of the event**. Otherwise budget about $50 and set a Dash0 monthly budget cap.

**Trade-offs vs. alternatives:**
| | Dash0 | Grafana Cloud | Datadog |
|---|---|---|---|
| Lock-in | Low: pure OTLP, swap by changing the endpoint | Low (OTel) | High (proprietary agent) |
| Free tier | 14-day trial only | Permanent free tier | Trial |
| Cost at our scale | Very low, per-signal pricing | Free to low | High |
| SLOs/alerts | Built-in burn rate, PromQL rules | Yes (more assembly) | Yes |
| AI/MCP for triage | MCP + Agent0 | Partial | Partial |
| Risks | Newer vendor; region fixed at org creation (choose Oregon); browser SDK limit 4,096 events/10 min per session (fine); some features beta | | |

**Choice: Dash0.** It fits best on SLOs, alerting, and RUM in one place at near-zero cost, and the instrumentation stays pure OpenTelemetry. **If the trial or budget is a blocker, switch to the Grafana Cloud free tier by changing the collector exporter only. No app code changes.**

## 10. Repo layout (pnpm monorepo)
```
apps/web        React+TS+Vite PWA, R3F venue, swipe UI, Dash0 web SDK
apps/api        Fastify routes; services: rank, match, booking, stream (SSE)
apps/indexer    outbox → ES worker
packages/shared zod schemas/types     packages/venue  spots.ts, geometry utils
tools/          build-venue.ts, seed.ts (800 synthetic attendees), k6/
infra/          terraform (VPC, ECS, ALB, RDS, CloudFront, Elastic Cloud, Dash0 rules), otel-collector.yaml
docker-compose.yml  pg + elasticsearch + otel-collector for local dev
```

## 11. Delivery phases
**Phase 0, hackathon day (~10 h, follows the MVP doc's hour plan):**
- docker-compose with Postgres + Elasticsearch, seeding 15 profiles plus a reciprocal swipe
- ranking with named queries and the atomic match transaction
- floor 3 in 3D with 3 real spots (Atrium Lounge, Commons Table, Conference A) and the fly-to
- Dash0 auto-instrumentation + web SDK, with one dashboard to show live swipes and matches in the demo
- a SonarCloud scan

Skip in Phase 0: auth, outbox (write to Elasticsearch directly), SSE (return `matched:true` inline).

**Phase 1, event-ready (~1–2 weeks):**
- ECS Fargate + RDS + CloudFront + Elastic Cloud via Terraform
- OTP auth, outbox indexer, SSE + LISTEN/NOTIFY, slot booking
- both floors and the full spot inventory
- popularity dampening, Postgres fallback, block/report, rate limits
- Dash0 SLOs, alerts, and synthetic checks
- on-call runbook: ES kill-switch → PG fallback, freeze bookings, broadcast banner, ECS rollback
- k6 test at 2,000 virtual users

**Phase 2:** embeddings + hybrid RRF, opt-in zone presence, chat, organizer dashboard, follow-ups.

## 12. Verification
- **Unit:**
  - query builder → explanation mapping
  - spot-suggestion scoring
  - SVG → meter coordinate transforms
- **Concurrency (testcontainers Postgres):**
  - 1,000 parallel reciprocal swipes must produce exactly 1 match per pair and exactly 2 inbox rows
  - 200 parallel bookings on a capacity-3 slot must give 3 successes and 197 `409`s
- **E2E (Playwright, 2 browsers):**
  - full flow: join → swipe the seeded reciprocal user → the SSE match arrives in the other browser → book → camera target is near the spot anchor
- **Load (k6, 2,000 virtual users, spike profile):** check §1 SLOs in Dash0. Confirm ECS autoscaling adds tasks before p95 breaches.
- **Chaos:**
  - stop an api task mid-test: no lost matches (inbox catch-up)
  - block Elasticsearch: decks keep serving through the fallback, and the Dash0 fallback alert fires
  - bad deploy (failing `/readyz`): the ECS circuit breaker auto-rolls back within ~5 min
- **Telemetry hygiene:** grep exported spans in Dash0 for emails and names; expect zero.
- **3D performance:** `venue.glb` ≤ 2 MB and first render < 3 s on a throttled low-end Android device.
- **Demo:** the 2-minute script from the MVP doc runs end to end on venue-like Wi-Fi.

## Assumptions to confirm
- Both floors' commons and atrium areas can be used for meetings, and capacities are confirmed with The Shop staff.
- Dash0 trial is started within 14 days of the event, or about $50 is budgeted.
- Link out to the official virtual tour rather than embedding it.
