# Kubernetes with Radar and Argo CD

## What runs where
| Workload | Kind | Notes |
|---|---|---|
| `api` | Deployment (2) + HPA (2–6) + Service | Probes: `/healthz` (process up), `/readyz` (Elasticsearch reachable) |
| `web` | Deployment (2) + Service | nginx serves the 3D game at `/` and the console at `/console/`, and proxies `/api` to the `api` Service ([`deploy/web`](../deploy/web)) |
| `otel-collector` | Deployment + Service + Role | Namespace-scoped RBAC, so it works in a team namespace |
| `es-setup` | Job (Argo CD PreSync hook) | Creates indices, upserts booths. Idempotent |

All manifests: [`deploy/k8s`](../deploy/k8s). Validated in CI with `kubectl kustomize` + kubeconform.

## GitOps with Argo CD
1. A PR is reviewed by Gitar, then CI runs (typecheck, unit, e2e + axe, ES smoke, k8s validation, image builds).
2. On merge to `main`, CI pushes `ghcr.io/anonymousminh/salty-cluster-{api,web}:sha-<commit>`.
3. To deploy, open a PR that bumps `newTag` in `deploy/k8s/kustomization.yaml`. Gitar reviews the deploy too.
4. Argo CD (`deploy/argocd/application.yaml`) syncs `main` automatically with prune + self-heal.

```bash
kubectl apply -n argocd -f deploy/argocd/application.yaml
```
If the organizers gave you a namespace, change `namespace:` in `deploy/k8s/kustomization.yaml` and `destination.namespace` in the Application.

## Secrets
Created by hand (never committed):
```bash
kubectl -n salty-cluster create secret generic salty-secrets \
  --from-literal=ES_URL=... --from-literal=ES_API_KEY=... \
  --from-literal=ORGANIZER_TOKEN=... --from-literal=PLAYER_SALT=... --from-literal=BOOTH_CODE_SECRET=... \
  --from-literal=DASH0_OTLP_ENDPOINT=... --from-literal=DASH0_AUTH_TOKEN=...
```
The API refuses to start in production with the default organizer token.

## Radar
Point Radar at the cluster and the `salty-cluster` namespace, and connect Radar MCP to your coding agent.

| When | Use Radar for |
|---|---|
| First deploy | Topology: web → api → Elasticsearch, collector receiving traffic |
| Every Argo CD sync | Rollout view: catch CrashLoopBackOff / ImagePullBackOff right away |
| Game day | Watch the api HPA scale during the opening rush |
| Something's wrong | **AI investigation**: "Why is the api not ready?", "Why did es-setup fail?" |

## Load test for the Radar demo
Port-forward the API and run the simulator to produce real traffic:
```bash
kubectl -n salty-cluster port-forward svc/api 8080:80
```
```bash
API_URL=http://localhost:8080 pnpm simulate -- --players 200 --rate 40 --seconds 300
```
Watch the `api` HPA scale in Radar and the check-in latency in Dash0 at the same time.

Likely real issues worth investigating (and writing up in `docs/incidents/`):
- `api` not ready → wrong `ES_URL`/API key in the secret (readiness fails, liveness doesn't, so no restart loop)
- `es-setup` job failing → Elasticsearch not reachable from the namespace
- `web` 502s → api Service name/port mismatch in `deploy/web/nginx.conf`
- CPU throttling under load → raise limits / HPA settings
