# Notes for your coding agent

This repo is **MeetSpace / Salty-Cluster**: a battle-royale game for conference expo floors. It has:
- a 3D game (`apps/web`)
- an organizer console (`apps/console`)
- a Fastify API on Elasticsearch (`apps/api`)
- shared game rules (`packages/venue`)

Product and architecture: `README.md`. Hosting: `docs/deployment-guide.md`.

## Where it runs (Cloud Native Hackathon)

The team's cluster is a vcluster that Radar Cloud lists as **`__TEAM__`**. The app runs in namespace `team-__TEAM__` and is public at `https://__TEAM__.cnh.radarhq.io`:
- the 3D game is at `/`
- the console is at `/console/`
- the API is at `/api`

If the name in bold is still a placeholder (`__TEAM__`), run `./deploy/deploy.sh cnh-setup <team>` first.

**Radar.** Use Radar Cloud's MCP server (`radar-cloud`) to observe and change the cluster.
- Call `list_clusters` once per session, take the `id` whose `name` is exactly `__TEAM__`, and pass it as `cluster` on every call. The organization has about 40 clusters. Never touch `cnh` or another team's cluster.
- Pass `namespace: team-__TEAM__`.

**What runs there** (all from git, `deploy/cnh` → `deploy/k8s`):

| Workload | What |
|---|---|
| Deployment `web` + Service `app` (port 80) | nginx: game, console, `/api` proxy. The platform routes the public URL to Service `app`: keep it |
| Deployment `api` + HPA (2–3) | Fastify API. Probes `/healthz` (process) and `/readyz` (Elasticsearch reachable) |
| Deployment `otel-collector` | OTLP → Dash0, dataset `salty-cluster` |
| Job `es-setup` | Argo CD PreSync hook: creates indices, upserts booths |
| Secret `salty-secrets` | ES_URL, ES_API_KEY, Dash0, organizer token, salts. Not in git: created by `./deploy/deploy.sh k8s` |

Elasticsearch is Elastic Cloud (Serverless), outside the cluster. If `api` is not ready, check `/readyz` and the secret first.

## Shipping

Deploys are GitOps:
1. Change the repo, open a PR, and merge to `main` after CI is green.
2. CI builds `ghcr.io/anonymousminh/salty-cluster-{api,web}`, then commits `deploy: <sha> [skip ci]`, which pins `newTag` in `deploy/k8s/kustomization.yaml`.
3. Argo CD Application `app` in `team-__TEAM__` (project `team-__TEAM__`) syncs it.

After a merge:
- Wait for the deploy commit.
- Check the Application's synced revision, then the rollout of `api` and `web`.
- Then `https://__TEAM__.cnh.radarhq.io/api/game`.

Argo CD has no web UI here: use `manage_gitops`. Never patch Argo CD-owned resources on the cluster: self-heal reverts them. Fix them in git.

## When something's wrong

- Read the evidence first (`issues`, `get_changes`, events, logs; `diagnose` bundles them), name the cause, then fix it in git.
- A pod `Pending` with Warning `SyncError` was refused by the host. Either it's over budget (`exceeded quota: team-quota`), or it asked for privileged or host access.
- For a real symptom you can't explain, suggest a **Radar AI investigation** on the resource. Write findings up in `docs/incidents/` (template there).
- Game-level signals are in Dash0: `game.checkins`, `game.checkins.rejected{reason}`, `game.circle.radius`, check-in latency. See `docs/observability.md`.

## Limits

- **Budget for everything in the cluster:** 2 CPU / 4 GiB of requests, 4 CPU / 8 GiB of limits, 4 PVCs / 20 GiB. The api HPA is capped at 3 to fit.
- No privileged, hostPath, hostNetwork or hostPID pods. No LoadBalancer or NodePort Services.
- Leave the pre-installed platform alone: Argo CD, Argo Rollouts, Prometheus, CloudNativePG, Radar 1.19 (don't upgrade it), AppProject `team-__TEAM__`, Secret `default/kubeconfig`.
- **Never** put a kubeconfig, token or API key in the repo, a commit, a log or your output. The repo and images are public.

## Load and demo traffic

`./deploy/deploy.sh loadtest --players 100 --rate 20 --seconds 120` simulates players (bounded). Watch the api HPA in Radar and check-ins per booth in Dash0. Don't generate unbounded load, and don't break things on purpose.
