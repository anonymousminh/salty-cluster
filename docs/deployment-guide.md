# Deployment guide: from zero to a hosted game

This takes you from an empty laptop to MeetSpace running on Kubernetes with a public URL. On the way it wires in
all four sponsor tools. Follow the parts in order; each one ends with a check.

| Part | You end up with | Time |
|---|---|---|
| [0. Accounts and tools](#0-accounts-and-tools) | Everything installed and signed up | 20 min |
| [1. Run locally](#1-run-locally-no-cloud-needed) | Game + console + API on your laptop | 5 min |
| [2. GitHub: rules, Gitar, CI](#2-github-rules-gitar-ci-sonar--gitar-track) | PRs reviewed by Gitar, CI green, images in ghcr.io | 20 min |
| [3. Elasticsearch](#3-elasticsearch-elastic-track) | A cluster, an API key, indices and booths | 15 min |
| [4. Dash0](#4-dash0-dash0-track) | Tokens, dataset, browser monitoring | 10 min |
| [5. Kubernetes + Argo CD](#5-kubernetes--argo-cd) | The app running in your namespace, deployed by GitOps | 25 min |
| [6. Public URL](#6-public-url) | `https://<your-host>/` for players, `/console/` for organizers | 10 min |
| [7. Radar](#7-radar-radar--ai-sre-track) | Cluster visible in Radar, MCP connected | 10 min |
| [8. Observe in Dash0](#8-observe-in-dash0-dashboard-slos-agent0) | Dashboard, SLOs, Agent0 | 20 min |
| [9. Game day](#9-game-day-runbook) | Running the event | — |
| [10. Troubleshooting](#10-troubleshooting) | | |

---

## Sponsor tool checklist

What is already in the code, and what someone on the team has to do in each tool. The judges look for the right-hand column.

| Tool | Already in the repo | You must do (and screenshot for the demo) |
|---|---|---|
| **Elasticsearch** | The only datastore. Geo query for the circle, aggregations for the underdog bonus and leaderboard, optimistic concurrency for shrinks (`apps/api/src/es/queries.ts`). A real-Elasticsearch smoke game runs in CI. | Create the cluster and API key (Part 3). |
| **Dash0** | OTel SDK in the API (traces, `game.*` metrics, logs with trace ids). A collector exports to Dash0 with Kubernetes metadata and events. Browser monitoring (Dash0 Web SDK) in the game and console. | Create tokens and a dataset (Part 4). Build the dashboard and SLOs, and use Agent0/MCP on a real issue (Part 8). |
| **Radar** | Kubernetes manifests with clean labels, probes, limits and HPA, so Radar's views are meaningful. | Connect Radar to the cluster, use Radar MCP, and run an AI investigation on a real issue (Part 7). Nothing in code can do this for you. |
| **Sonar (Gitar)** | Review instructions, PR template, CODEOWNERS and the CI that Gitar diagnoses (`docs/gitar.md`, `.github/`). | Install Gitar, paste the instructions, turn on branch rules, and land every feature through reviewed PRs (Part 2). |

---

## 0. Accounts and tools

### Accounts
| Account | Why | Notes |
|---|---|---|
| GitHub (access to `anonymousminh/salty-cluster`) | Code, CI, image registry (ghcr.io) | Someone needs **admin** on the repo for Part 2 |
| Elastic Cloud | Elasticsearch | A free trial is enough. Any recent 8.x or 9.x works |
| Dash0 | Observability | Use the hackathon org if one was provided |
| A Kubernetes cluster | Hosting | Use the cluster/namespace the organizers gave your team, or your own (managed cluster, or `kind` locally for a dry run) |
| Gitar | AI code review (Sonar track) | Installed as a GitHub app on the repo |
| Radar | Kubernetes UI + AI SRE | Desktop app or in-cluster install; see its README |

### Tools on your laptop
| Tool | Version | Check |
|---|---|---|
| Node.js | 22 | `node -v` |
| pnpm | 11 (via corepack) | `corepack enable && pnpm -v` |
| Docker | any recent | `docker info` (for local Elasticsearch; optional) |
| kubectl | matches your cluster ±1 minor | `kubectl version --client` |
| Git | any | |

```bash
git clone https://github.com/anonymousminh/salty-cluster.git
```
```bash
cd salty-cluster && corepack enable && pnpm install
```

**Check:** `pnpm typecheck && pnpm test` passes.

---

## 1. Run locally (no cloud needed)

Fastest path: no Docker, with an in-memory store (dev only, data resets on restart).
```bash
pnpm dev:memory      # API on :8080
```
```bash
pnpm dev             # 3D game on http://localhost:5173
```
```bash
pnpm dev:console     # console on http://localhost:5174/console/
```
1. Open http://localhost:5174/console/#/organizer, enter token `dev-organizer`, and press **▶ Start**.
2. Open http://localhost:5173, fill in the lobby, and walk to a booth (WASD, `E` to talk). Or open `?demo=booth` to jump straight there.
3. Optional traffic: `API_URL=http://localhost:8080 pnpm simulate -- --players 40 --seconds 60`.

With real Elasticsearch (Docker):
```bash
cp .env.example .env
```
```bash
docker compose up -d                 # Elasticsearch :9200 + OTel Collector :4318
```
```bash
pnpm es:setup && pnpm seed && pnpm dev:api
```

**Check:** the ☰ Demo drawer in the game says **🟢 Live game server**, and a check-in shows up on the console's big screen.

---

## 2. GitHub: rules, Gitar, CI (Sonar / Gitar track)

1. **Install Gitar** on the repository: install its GitHub App and give it access to `salty-cluster`. Follow the hackathon's Sonar/Gitar instructions for the install link and plan.
2. **Review instructions:** paste the block from [`docs/gitar.md`](gitar.md#review-instructions-for-gitar) into Gitar's repository instructions.
3. **Turn on CI auto-fix** in Gitar's settings (CI failure diagnosis + auto-apply), if your plan offers it.
4. **Branch ruleset** (Settings → Rules → Rulesets → New branch ruleset, target `main`):
   - Require a pull request before merging, with 1 approval
   - Require status checks to pass: `typecheck-test`, `e2e`, `es-smoke`, `k8s-validate`, `images (api)`, `images (web)` (they appear after the first CI run)
   - Require conversation resolution
   - Block force pushes
5. **CODEOWNERS:** add teammates' handles per area in `.github/CODEOWNERS`.
6. **Browser monitoring at build time:** under Settings → Secrets and variables → Actions → **Variables**, add `VITE_DASH0_ENDPOINT` and `VITE_DASH0_AUTH_TOKEN` (from Part 4). These are variables, not secrets, on purpose: the browser token is public in the bundle anyway.
7. Merge the first PR. CI pushes `ghcr.io/anonymousminh/salty-cluster-api` and `-web` with tags `main` and `sha-<commit>`.
8. **Make the images pullable.** On GitHub → your profile/org → Packages, open each of `salty-cluster-api` and `salty-cluster-web` → Package settings → change visibility to **Public**. To keep them private instead, see [Private images](#private-images).

**Check:** a test PR shows a Gitar review and green CI. Both packages appear under Packages.

**From now on:** every change goes through a PR. Log each Gitar catch or CI auto-fix in the evidence table in `docs/gitar.md`.

---

## 3. Elasticsearch (Elastic track)

1. In Elastic Cloud, **create a deployment** (Elasticsearch + Kibana; the default size is fine). Note the **Elasticsearch endpoint**, e.g. `https://<id>.<region>.cloud.es.io:443`.
2. Open **Kibana → Dev Tools** and create an API key limited to the game's indices:
   ```json
   POST /_security/api_key
   {
     "name": "meetspace-api",
     "role_descriptors": {
       "meetspace": {
         "cluster": ["monitor"],
         "indices": [{ "names": ["booths", "checkins", "players", "game"], "privileges": ["all"] }]
       }
     }
   }
   ```
   Copy the **`encoded`** value from the response. That is `ES_API_KEY`.
3. Optional: create the indices and booths from your laptop now (the cluster's setup job does it too):
   ```bash
   ES_URL=https://<id>.<region>.cloud.es.io:443 ES_API_KEY=<encoded> BOOTH_CODE_SECRET=<secret> pnpm es:setup
   ```
   ```bash
   ES_URL=https://<id>.<region>.cloud.es.io:443 ES_API_KEY=<encoded> BOOTH_CODE_SECRET=<secret> pnpm seed
   ```

**Check:** in Dev Tools, `GET booths/_count` returns 16.

`BOOTH_CODE_SECRET` determines every booth's QR code. Choose it once and keep it, or printed QR stickers stop working.

---

## 4. Dash0 (Dash0 track)

1. **Dataset:** create one named `salty-cluster` (Settings → Datasets). The collector and browser builds send to that name. To use another name, change `Dash0-Dataset` in `deploy/k8s/collector-config.yaml` and `VITE_DASH0_DATASET` in CI.
2. **Endpoints** (Settings → Endpoints): note the **OTLP via gRPC** endpoint (e.g. `ingress.<region>.aws.dash0.com:4317`) for the collector, and the **OTLP via HTTP** URL for browsers.
3. **Auth tokens** (Settings → Auth Tokens). Create two:
   - `collector`: Ingesting, for the cluster → `DASH0_AUTH_TOKEN`
   - `browser`: Ingesting only, limited to the `salty-cluster` dataset → `VITE_DASH0_AUTH_TOKEN` (the GitHub variable from Part 2)

**Check:** nothing to see yet. Data arrives after Part 5.

---

## 5. Kubernetes + Argo CD

### 5.1 Point kubectl at the cluster
```bash
kubectl config current-context
```
```bash
kubectl auth can-i create deployments -n salty-cluster
```
If the organizers gave you a namespace with a different name, change `namespace:` in `deploy/k8s/kustomization.yaml` and `destination.namespace` in `deploy/argocd/application.yaml`, then merge that through a PR. Use your namespace instead of `salty-cluster` in every command below.

No cluster yet? For a dry run: `kind create cluster --name meetspace`.

### 5.2 Create the namespace and the secret
The secret must exist **before** the first sync: the setup job and the pods read it.
```bash
kubectl create namespace salty-cluster
```
```bash
kubectl -n salty-cluster create secret generic salty-secrets \
  --from-literal=ES_URL='https://<id>.<region>.cloud.es.io:443' \
  --from-literal=ES_API_KEY='<encoded API key>' \
  --from-literal=ORGANIZER_TOKEN='<long random string>' \
  --from-literal=PLAYER_SALT='<long random string>' \
  --from-literal=BOOTH_CODE_SECRET='<the secret from Part 3>' \
  --from-literal=DASH0_OTLP_ENDPOINT='ingress.<region>.aws.dash0.com:4317' \
  --from-literal=DASH0_AUTH_TOKEN='<collector token>'
```
Generate random strings with `openssl rand -base64 32`. The API refuses to start with the default organizer token.

### 5.3 Install Argo CD (skip if the cluster already has it)
```bash
kubectl create namespace argocd
```
```bash
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```
```bash
kubectl -n argocd rollout status deploy/argocd-server
```
UI and admin password:
```bash
kubectl -n argocd port-forward svc/argocd-server 8443:443
```
```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
```
Open https://localhost:8443 and log in as `admin`. If the repo is **private**, add it under Settings → Repositories (HTTPS + a GitHub token with read access).

### 5.4 Create the Application
```bash
kubectl apply -n argocd -f deploy/argocd/application.yaml
```
Argo CD now syncs `deploy/k8s` from `main`:
1. **PreSync:** the `es-setup` Job creates any missing indices and upserts the 16 booths.
2. The `api` (2 replicas + HPA), `web` (2 replicas) and `otel-collector` Deployments roll out.

**Check:**
```bash
kubectl -n salty-cluster get pods
```
All pods show `Running` and `READY 1/1`, and the `es-setup` job shows `Completed`.
```bash
kubectl -n salty-cluster port-forward svc/web 8080:80
```
http://localhost:8080 shows the game, and http://localhost:8080/console/ shows the console. In the game's ☰ Demo drawer you should see **🟢 Live game server**.

### 5.5 Deploy a new version
Every merge to `main` builds `:main` and `:sha-<commit>`. The manifests start on `newTag: main`, so restarting picks up the newest `main` build. For reproducible deploys (recommended once things work):
1. Open a PR that sets both `newTag` values in `deploy/k8s/kustomization.yaml` to `sha-<full commit sha>`.
2. Gitar reviews it and CI validates it. Merge it.
3. Argo CD syncs automatically. Watch the rollout in Radar.

To roll back, revert that PR.

### Private images
To keep the ghcr.io packages private, give the cluster a pull secret:
```bash
kubectl -n salty-cluster create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=<github user> --docker-password=<token with read:packages>
```
```bash
kubectl -n salty-cluster patch serviceaccount default -p '{"imagePullSecrets":[{"name":"ghcr-pull"}]}'
```

---

## 6. Public URL

Only the `web` Service needs to be exposed. It serves the game at `/` and the console at `/console/`, and proxies `/api` inside the cluster. Pick one:

| Option | When | How |
|---|---|---|
| Ingress (recommended) | The cluster has an ingress controller (ask the organizers for the class and host) | Edit `host` and `ingressClassName` in `deploy/k8s/optional/ingress.yaml`, then `kubectl -n salty-cluster apply -f deploy/k8s/optional/ingress.yaml`. Add TLS per your controller |
| LoadBalancer | Cloud cluster, no ingress | `kubectl -n salty-cluster patch svc web -p '{"spec":{"type":"LoadBalancer"}}'`, then use the `EXTERNAL-IP` |
| Port-forward | Demo from your laptop only | `kubectl -n salty-cluster port-forward svc/web 8080:80` |

To keep exposure under GitOps, add the ingress to `resources` in `kustomization.yaml` in a PR once the host is known.

**Check:** on your phone, open `https://<host>/` and play. Then print the QR codes from `https://<host>/console/#/organizer`: they encode the host you open the console on, so print them from the public URL.

---

## 7. Radar (Radar / AI SRE track)

1. **Install Radar** following its README (desktop app/CLI using your kubeconfig, or the in-cluster install). Point it at the cluster and the `salty-cluster` namespace.
2. **Look around once:** topology web → api, the collector, the `es-setup` job history, the api HPA.
3. **Connect Radar MCP** to your coding agent (Claude Code, Cursor, …) per Radar's docs. From then on, ask cluster questions from the editor: "Why is the api not ready?", "Which pods restarted in the last hour?"
4. **Use Radar during the build, not just at the end.** Watch every Argo CD rollout there. When something breaks, run an **AI investigation** first.
5. **Create a real issue to investigate** (safe ones):
   - Load: `kubectl -n salty-cluster port-forward svc/api 8081:80`, then `API_URL=http://localhost:8081 pnpm simulate -- --players 200 --rate 40 --seconds 300`. Watch the HPA scale, or the CPU throttle.
   - Misconfiguration: temporarily put a wrong `ES_API_KEY` in the secret and restart the api. Readiness fails while liveness stays up, so pods are not ready but don't restart. Ask Radar AI why.
6. Write each finding up in `docs/incidents/` (template there): symptom, the Radar investigation, root cause, fix PR, verification.

**Check:** you have at least one incident write-up with Radar screenshots and a linked fix PR.

---

## 8. Observe in Dash0 (dashboard, SLOs, Agent0)

1. **Confirm data:** in Dash0's explorer, filter the `salty-cluster` dataset by `service.name = api`. Play a check-in and find its trace: `POST /api/booths/:id/checkin` → `checkin.score` → Elasticsearch spans. With browser monitoring on, the same trace starts at the `game` service.
2. **Dashboard "Salty-Cluster Game Health"**, as listed in [`docs/observability.md`](observability.md#dashboard-and-slos-build-in-dash0):
   - check-ins/min by booth, with `game.circle.radius` overlaid
   - rejections by `reason`
   - check-in p95 latency and error rate
   - web vitals and `fps_low` events from the game
   - pod restarts and CPU
3. **SLOs:** check-ins succeed (99.5%), check-ins are fast (p95 < 500 ms, 99%), leaderboard is fresh (99.5%).
4. **Agent0 / Dash0 MCP:** connect the Dash0 MCP server to your coding agent. During the load test, ask: "Why are check-ins being rejected in the last 15 minutes?" or "Which spans got slower since the last deploy?" Fix whatever is real and write it up in `docs/incidents/`.

**Check:** the dashboard shows the simulated traffic following the circle when you shrink it in the console.

---

## 9. Game-day runbook

| When | Who | Action |
|---|---|---|
| Day before | Organizer | Print the QR sheet from `/console/#/organizer` on the public URL, and stick one per booth |
| 30 min before | Ops | Radar: all pods ready. Dash0: SLOs green. Optionally `pnpm simulate` briefly, then **Reset** in the console |
| Start | Organizer | Console → **▶ Start**. Put `/console/#/screen` on the big screen |
| Every 15–20 min | Organizer | **Schedule shrink** (players see the countdown), toward under-visited areas (click the map to pick the target) |
| During | Ops | Watch the Dash0 dashboard and Radar. Investigate anything odd |
| End | Organizer | Console → **■ End**. Read the top 3 off the big screen |

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Pods `ImagePullBackOff` | ghcr.io package private, or tag not built yet | Make the package public, or add a pull secret (Part 5). Check that the tag exists under Packages |
| `es-setup` job fails | Wrong `ES_URL`/`ES_API_KEY`, or the key lacks privileges | `kubectl -n salty-cluster logs job/es-setup`. Recreate the key with the role from Part 3 |
| api `0/1 READY`, not restarting | `/readyz` can't reach Elasticsearch (liveness is fine on purpose) | Same as above. Ask Radar AI to investigate |
| api `CrashLoopBackOff`, logs say ORGANIZER_TOKEN | Default token in production | Set `ORGANIZER_TOKEN` in the secret |
| Game shows "⚪ Offline demo" in the cluster | `/api` not reachable through web | Check `kubectl -n salty-cluster get svc api` and the `proxy_pass` in `deploy/web/nginx.conf` |
| No data in Dash0 | Collector endpoint/token/dataset wrong | `kubectl -n salty-cluster logs deploy/otel-collector`. Check that the dataset exists |
| No browser data in Dash0 | Variables missing at image build time | Set the GitHub **Variables** from Part 2, then rebuild (merge any PR) |
| QR codes say "not valid" | `BOOTH_CODE_SECRET` changed after printing | Restore the old secret, or reprint |
| Check-ins say "in the storm" everywhere | Circle too small or in the wrong place | Console → Move circle |
