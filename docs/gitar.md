# Gitar: never merge broken

## Workflow
- Every change lands through a PR into `main`. No direct pushes. Gitar reviews each one.
- Small PRs per feature (API endpoint, UI page, manifest change), not one giant PR at the end.
- CI must be green: typecheck, unit/API tests, Playwright e2e of the 3D game and console (with axe), **real-Elasticsearch smoke game**, kustomize/kubeconform, image builds.
- When CI fails, let Gitar diagnose it first. Accept its auto-applied fix for mechanical failures (lint, types, snapshots, schema), review its diagnosis for logic failures.
- Never fix a red build by deleting or skipping a test.

## Repository rules (GitHub → Settings → Rules → new branch ruleset on `main`)
- Require a pull request before merging (1 approval)
- Require status checks: `typecheck-test`, `e2e`, `es-smoke`, `k8s-validate`, `images (api)`, `images (web)`
- Require conversation resolution
- Block force pushes and deletions; squash merge only

## Review instructions for Gitar
Paste into Gitar's repository review instructions:

```markdown
# MeetSpace / Salty-Cluster review instructions
A live game used by hundreds of people at the same time. Fair scoring matters more than cleverness.

1. Shared rules: scoring, the quiz, check-in rules and the circle live in packages/venue and are used by
   the game, the console and the server. Flag duplicated rules, and client-side values the server trusts.
2. Fairness: one credit per player per booth (doc id `playerHash:boothId` with op_type create). The server
   recomputes zone, quiz answer and XP. Flag anything letting a client choose its XP, bonus or zone.
3. Secrets: booth QR `code` must never appear in public API responses (PUBLIC_BOOTH_SOURCE). Session ids are
   bearer secrets: never log them, never store them unhashed (hashPlayerId).
4. Elasticsearch is the only datastore. Queries belong in apps/api/src/es/queries.ts; flag unbounded sizes
   and scripts on hot paths. The in-memory store in apps/api/src/dev is for dev/tests only.
5. Telemetry: new endpoints need spans or `game.*` metrics and structured logs with an `event` field.
6. Kubernetes: requests/limits, readiness/liveness probes, no `latest` tags, no secrets in manifests.
7. 3D/UI: every new HUD element needs an accessible name; colour is never the only signal (storm vs zone);
   respect prefers-reduced-motion.
Be concise. Say clearly whether something blocks the merge.
```

## Evidence log (fill during the hackathon)
| PR | What Gitar caught / what CI broke | Auto-fix applied? |
|---|---|---|
| | | |
