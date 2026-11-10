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

## Evidence log
| PR | What Gitar caught / what CI broke | Auto-fix applied? |
|---|---|---|
| #4 | Gitar CI diagnosis: "the web app typecheck fails because `GameCanvas.tsx` still contains an unresolved merge-conflict marker" (and `GameHud.tsx` JSX syntax errors). Merged red; `main` broke for every subsequent PR. Fixed by hand in #6 following the diagnosis. | No (fix landed manually in #6) |
| #5 | Gitar review: **Changes requested**, 3 findings (medium risk) — CI pinning every `main` build for Argo CD rollout; dropping ES refresh waits. Findings reviewed; merged in that shape deliberately. | No (reviewed, merged) |
| #6 | Gitar review: **Changes requested**, 1 finding (medium risk) — HUD prompt changes could hide the demo UI when demo data is missing. Reviewed; fix kept the fallback prompt. | No (reviewed, merged) |
| #7 | Gitar review: **Approved** — numeric `runAsUser`/`fsGroup` 1000 for api + `es-setup` (kubelet rejected name-based `USER node` under `runAsNonRoot`; `es-setup` had been stuck `CreateContainerConfigError`, then CrashLoop). CI green; image pinned `sha-5d9affe`. | n/a (approved as written) |
| #8 | Gitar review: **Approved** — hook-order crash (`Start Demo` blanked the screen); all hooks run before the early return. CI green. | n/a (approved as written) |

### Notes
- PR #4 is the concrete example of CI diagnosing a real break: typecheck/e2e failed on `main` and Gitar named the exact files and cause; #6 is the fix. It predates the branch ruleset on `main` (see below), which is why the red merge could land.
- Enforcement gap: `main` has no branch ruleset yet (`gh api repos/anonymousminh/salty-cluster/rulesets` is empty). `deploy/github/ruleset-main.json` is prepared; it needs repo admin to apply (`./deploy/deploy.sh github`, or Settings → Rules → Rulesets). Until then nothing blocks merging red.
