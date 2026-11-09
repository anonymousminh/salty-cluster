#!/usr/bin/env bash
# MeetSpace / Salty-Cluster: deploy end to end from your laptop.
#
#   cp deploy/.env.deploy.example deploy/.env.deploy   # fill in credentials
#   ./deploy/deploy.sh all                              # everything below, in order
#
# Steps (each can be run on its own, and each is safe to re-run):
#   check      tools, kubectl context and permissions, images pullable
#   secrets    generate ORGANIZER_TOKEN / PLAYER_SALT / BOOTH_CODE_SECRET once (saved to the env file)
#   elastic    create a least-privilege Elasticsearch API key (if ES_API_KEY is empty) and verify it
#   k8s        namespace + salty-secrets (+ ghcr pull secret if GHCR_TOKEN is set)
#   argocd     install Argo CD if missing, wait until it is ready
#   app        apply the Argo CD Application, wait for sync, the es-setup job and healthy pods
#   expose     ingress or LoadBalancer for a public URL (EXPOSE in the env file)
#   verify     end-to-end checks through the web service: game, console, API, booths, collector logs
#   github     branch ruleset on main + Dash0 browser variables (needs `gh` and repo admin)
#   loadtest   simulated players against the cluster (Radar/Dash0 demo traffic)
#   pin SHA    set both image tags to sha-SHA in kustomization.yaml (commit it through a PR)
#   status     what is running, and the URLs
#
# Works with macOS's bash 3.2. Needs: kubectl, curl, openssl, node; gh for `github`; pnpm (or npx) for `loadtest`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/.env.deploy}"
REPO="anonymousminh/salty-cluster"
APP_NAME="salty-cluster"
SECRET_NAME="salty-secrets"
IMAGES="salty-cluster-api salty-cluster-web"
INDICES='["booths","checkins","players","game"]'

# ---------- output ----------
if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'; else B=""; G=""; Y=""; R=""; N=""; fi
step() { printf '\n%s==> %s%s\n' "$B" "$*" "$N"; }
ok() { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
die() {
  printf '  %s✗ %s%s\n' "$R" "$*" "$N" >&2
  exit 1
}

# ---------- env file ----------
load_env() {
  [ -f "$ENV_FILE" ] || die "No $ENV_FILE. Run: cp deploy/.env.deploy.example deploy/.env.deploy and fill it in."
  chmod 600 "$ENV_FILE" 2>/dev/null || true
  # Parse KEY=VALUE lines as data (never executed), so passwords with $, `, < or spaces are safe.
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | '#'*) continue ;; esac
    key="${line%%=*}"
    val="${line#*=}"
    case "$key" in *[!A-Za-z0-9_]* | [0-9]* | '') die "bad line in $ENV_FILE: $line" ;; esac
    # Optional surrounding quotes.
    case "$val" in \"*\") val="${val#\"}" && val="${val%\"}" ;; \'*\') val="${val#\'}" && val="${val%\'}" ;; esac
    export "$key=$val"
  done <"$ENV_FILE"
  NAMESPACE="${NAMESPACE:-salty-cluster}"
}

# Write KEY=VALUE into the env file (replace or append), and export it.
set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" 'BEGIN { FS = OFS = "=" } $1 == k { print k "=" v; next } { print }' "$ENV_FILE" >"$tmp"
  else
    cat "$ENV_FILE" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  cat "$tmp" >"$ENV_FILE"
  rm -f "$tmp"
  export "$key=$value"
}

need_var() {
  local v
  for v in "$@"; do
    [ -n "${!v:-}" ] || die "$v is empty in $ENV_FILE"
    case "${!v}" in *'<'*'>'*) die "$v still has a <placeholder> in $ENV_FILE" ;; esac
  done
}

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "'$1' is not installed. $2"; }

json_get() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=s?JSON.parse(s):{};const r=process.argv[1].split(".").reduce((o,k)=>o==null?o:o[k],v);process.stdout.write(r==null?"":String(r))})' "$1"; }

k() { kubectl "$@"; }
kn() { kubectl -n "$NAMESPACE" "$@"; }

# ---------- steps ----------
cmd_check() {
  step "Checking tools and cluster access"
  need_cmd kubectl "https://kubernetes.io/docs/tasks/tools/ (macOS: brew install kubectl)"
  need_cmd curl ""
  need_cmd openssl ""
  need_cmd node "Install Node 22 (macOS: brew install node@22)"
  ok "kubectl, curl, openssl, node"

  local ctx
  ctx="$(k config current-context 2>/dev/null)" || die "kubectl has no current context. Get the kubeconfig from the organizers (or: kind create cluster)."
  k version --request-timeout=10s >/dev/null 2>&1 || die "Cannot reach the cluster for context '$ctx'."
  ok "cluster reachable (context: $ctx)"

  local ns_in_git
  ns_in_git="$(awk '/^namespace:/ { print $2 }' "$ROOT/deploy/k8s/kustomization.yaml")"
  [ "$ns_in_git" = "$NAMESPACE" ] ||
    die "NAMESPACE=$NAMESPACE but deploy/k8s/kustomization.yaml says '$ns_in_git'. Change kustomization.yaml and deploy/argocd/application.yaml through a PR first."

  local verb
  for verb in "create deployments" "create secrets" "create jobs"; do
    # shellcheck disable=SC2086
    if k auth can-i $verb -n "$NAMESPACE" >/dev/null 2>&1; then ok "can $verb in $NAMESPACE"; else warn "cannot $verb in $NAMESPACE (fine if the namespace doesn't exist yet and you can create it)"; fi
  done

  local img tag code token
  tag="$(awk '/^[[:space:]]*newTag:/ { print $2; exit }' "$ROOT/deploy/k8s/kustomization.yaml" | tr -d '"')"
  for img in $IMAGES; do
    token="$(curl -fsS "https://ghcr.io/token?scope=repository:${REPO%%/*}/$img:pull" | json_get token || true)"
    code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" \
      -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json' \
      "https://ghcr.io/v2/${REPO%%/*}/$img/manifests/$tag")"
    if [ "$code" = "200" ]; then
      ok "ghcr.io/${REPO%%/*}/$img:$tag is public"
    elif [ -n "${GHCR_TOKEN:-}" ]; then
      warn "ghcr.io/${REPO%%/*}/$img:$tag not anonymously pullable (HTTP $code); will use the GHCR_TOKEN pull secret"
    else
      die "ghcr.io/${REPO%%/*}/$img:$tag not pullable (HTTP $code). Wait for CI on main, then make the package public (GitHub -> Packages -> $img -> settings), or set GHCR_USER/GHCR_TOKEN."
    fi
  done
}

cmd_secrets() {
  step "App secrets"
  local v
  for v in ORGANIZER_TOKEN PLAYER_SALT BOOTH_CODE_SECRET; do
    if [ -n "${!v:-}" ]; then
      ok "$v already set"
    else
      set_env "$v" "$(openssl rand -hex 24)"
      ok "$v generated and saved to $(basename "$ENV_FILE")"
    fi
  done
  warn "Keep $(basename "$ENV_FILE"): changing BOOTH_CODE_SECRET invalidates printed QR codes."
}

es_curl() { curl -sS --max-time 20 "$@"; }

cmd_elastic() {
  step "Elasticsearch"
  need_var ES_URL
  ES_URL="${ES_URL%/}"
  if [ -z "${ES_API_KEY:-}" ]; then
    need_var ES_ADMIN_USER ES_ADMIN_PASSWORD
    local body res key
    body="{\"name\":\"meetspace-api\",\"role_descriptors\":{\"meetspace\":{\"cluster\":[\"monitor\"],\"indices\":[{\"names\":$INDICES,\"privileges\":[\"all\"]}]}}}"
    res="$(es_curl -u "$ES_ADMIN_USER:$ES_ADMIN_PASSWORD" -H 'Content-Type: application/json' -X POST "$ES_URL/_security/api_key" -d "$body")" ||
      die "Could not reach $ES_URL"
    key="$(printf '%s' "$res" | json_get encoded)"
    [ -n "$key" ] || die "Elasticsearch refused to create the API key: $res"
    set_env ES_API_KEY "$key"
    ok "created API key 'meetspace-api' (cluster: monitor; indices booths/checkins/players/game: all) and saved it"
  else
    ok "using ES_API_KEY from $(basename "$ENV_FILE")"
  fi

  local who version
  who="$(es_curl -H "Authorization: ApiKey $ES_API_KEY" "$ES_URL/_security/_authenticate" | json_get username)"
  [ -n "$who" ] || die "ES_API_KEY does not authenticate against $ES_URL"
  version="$(es_curl -H "Authorization: ApiKey $ES_API_KEY" "$ES_URL/" | json_get version.number)"
  ok "API key works (Elasticsearch $version)"
  case "$version" in 8.* | 9.*) ;; *) warn "Elasticsearch $version is untested; 8.x and 9.x are supported." ;; esac
}

cmd_k8s() {
  step "Namespace and secrets"
  need_var ES_URL ES_API_KEY ORGANIZER_TOKEN PLAYER_SALT BOOTH_CODE_SECRET DASH0_OTLP_ENDPOINT DASH0_AUTH_TOKEN
  if k get namespace "$NAMESPACE" >/dev/null 2>&1; then
    ok "namespace $NAMESPACE exists"
  else
    k create namespace "$NAMESPACE" >/dev/null && ok "created namespace $NAMESPACE"
  fi

  # Values go through a private temp file (not argv, which other local processes can read).
  # create --dry-run | apply = create or update, without printing values.
  local envf
  envf="$(mktemp)"
  chmod 600 "$envf"
  {
    printf 'ES_URL=%s\n' "${ES_URL%/}"
    printf 'ES_API_KEY=%s\n' "$ES_API_KEY"
    printf 'ORGANIZER_TOKEN=%s\n' "$ORGANIZER_TOKEN"
    printf 'PLAYER_SALT=%s\n' "$PLAYER_SALT"
    printf 'BOOTH_CODE_SECRET=%s\n' "$BOOTH_CODE_SECRET"
    printf 'DASH0_OTLP_ENDPOINT=%s\n' "$DASH0_OTLP_ENDPOINT"
    printf 'DASH0_AUTH_TOKEN=%s\n' "$DASH0_AUTH_TOKEN"
  } >"$envf"
  if ! kn create secret generic "$SECRET_NAME" --from-env-file="$envf" --dry-run=client -o yaml | kn apply -f - >/dev/null; then
    rm -f "$envf"
    die "could not apply secret $SECRET_NAME"
  fi
  rm -f "$envf"
  ok "secret $SECRET_NAME applied"

  if [ -n "${GHCR_TOKEN:-}" ]; then
    need_var GHCR_USER
    kn create secret docker-registry ghcr-pull --docker-server=ghcr.io --docker-username="$GHCR_USER" --docker-password="$GHCR_TOKEN" \
      --dry-run=client -o yaml | kn apply -f - >/dev/null
    kn patch serviceaccount default -p '{"imagePullSecrets":[{"name":"ghcr-pull"}]}' >/dev/null
    ok "ghcr pull secret attached to the default service account"
  fi

  # Pods started before the secret changed keep the old values: restart them if they exist.
  local d restarted=""
  for d in api otel-collector; do
    if kn get deployment "$d" >/dev/null 2>&1; then kn rollout restart deployment "$d" >/dev/null && restarted="$restarted $d"; fi
  done
  [ -z "$restarted" ] || ok "restarted to pick up the secret:$restarted"
}

cmd_argocd() {
  step "Argo CD"
  if k get crd applications.argoproj.io >/dev/null 2>&1; then
    ok "Argo CD already installed"
  else
    case "${INSTALL_ARGOCD:-auto}" in
      no) die "Argo CD is not installed and INSTALL_ARGOCD=no." ;;
    esac
    k create namespace argocd >/dev/null 2>&1 || true
    k apply -n argocd --server-side --force-conflicts -f "https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION:-stable}/manifests/install.yaml" >/dev/null
    ok "installed Argo CD (${ARGOCD_VERSION:-stable})"
  fi
  k -n argocd rollout status deployment/argocd-server --timeout=300s >/dev/null
  k -n argocd rollout status deployment/argocd-repo-server --timeout=300s >/dev/null
  ok "Argo CD is ready"
  if k -n argocd get secret argocd-initial-admin-secret >/dev/null 2>&1; then
    ok "UI: kubectl -n argocd port-forward svc/argocd-server 8443:443  ->  https://localhost:8443 (user admin)"
    ok "password: kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 --decode"
  fi
}

wait_for() {
  # wait_for <description> <timeout seconds> <command...>: retry until the command succeeds.
  local what="$1" timeout="$2" start
  shift 2
  start="$(date +%s)"
  until "$@" >/dev/null 2>&1; do
    [ $(($(date +%s) - start)) -lt "$timeout" ] || return 1
    sleep 5
  done
  ok "$what"
}

app_synced() { [ "$(k -n argocd get application "$APP_NAME" -o jsonpath='{.status.sync.status}/{.status.health.status}' 2>/dev/null)" = "Synced/Healthy" ]; }
job_done() { [ "$(kn get job es-setup -o jsonpath='{.status.succeeded}' 2>/dev/null)" = "1" ]; }

cmd_app() {
  step "Deploying with Argo CD"
  k get secret "$SECRET_NAME" -n "$NAMESPACE" >/dev/null 2>&1 || die "Secret $SECRET_NAME missing: run ./deploy/deploy.sh k8s first."
  k apply -n argocd -f "$ROOT/deploy/argocd/application.yaml" >/dev/null
  ok "Application $APP_NAME applied (syncs deploy/k8s from main)"

  if ! wait_for "es-setup job completed (indices + booths)" 420 job_done; then
    warn "es-setup did not complete. Last logs:"
    kn logs job/es-setup --tail=30 2>&1 | sed 's/^/    /' || true
    die "Fix the cause (usually ES_URL/ES_API_KEY), then re-run: ./deploy/deploy.sh k8s app"
  fi
  local d
  for d in api web otel-collector; do
    kn rollout status deployment "$d" --timeout=300s >/dev/null || {
      kn get pods -l "app.kubernetes.io/name=$d" 2>&1 | sed 's/^/    /'
      die "deployment $d is not ready. Check it in Radar or: kubectl -n $NAMESPACE describe deploy/$d"
    }
    ok "deployment $d ready"
  done
  wait_for "Argo CD reports Synced/Healthy" 300 app_synced || warn "Argo CD is not Synced/Healthy yet; check the Argo CD UI."
}

cmd_expose() {
  step "Public URL"
  case "${EXPOSE:-none}" in
    ingress)
      need_var PUBLIC_HOST
      sed -e "s/meetspace.example.com/$PUBLIC_HOST/" -e "s/ingressClassName: nginx/ingressClassName: ${INGRESS_CLASS:-nginx}/" \
        "$ROOT/deploy/k8s/optional/ingress.yaml" | kn apply -f - >/dev/null
      ok "ingress for $PUBLIC_HOST (class ${INGRESS_CLASS:-nginx}). Point DNS at your ingress controller; add TLS per your cluster."
      ;;
    loadbalancer)
      kn patch service web -p '{"spec":{"type":"LoadBalancer"}}' >/dev/null
      local ip=""
      lb_ready() { ip="$(kn get service web -o jsonpath='{.status.loadBalancer.ingress[0].ip}{.status.loadBalancer.ingress[0].hostname}')" && [ -n "$ip" ]; }
      if wait_for "load balancer ready" 300 lb_ready; then lb_ready && ok "public URL: http://$ip/  (console: http://$ip/console/)"; else warn "no external IP yet: kubectl -n $NAMESPACE get svc web -w"; fi
      ;;
    none) ok "EXPOSE=none: use  kubectl -n $NAMESPACE port-forward svc/web 8080:80  ->  http://localhost:8080" ;;
    *) die "EXPOSE must be ingress, loadbalancer or none" ;;
  esac
}

cmd_verify() {
  step "Verifying end to end (through the web service, like a browser)"
  local port=18080 pf base n status
  kn port-forward svc/web "$port:80" >/dev/null 2>&1 &
  pf=$!
  # shellcheck disable=SC2064
  trap "kill $pf 2>/dev/null || true" EXIT
  base="http://127.0.0.1:$port"
  # shellcheck disable=SC2329  # called through wait_for
  up() { curl -fsS --max-time 3 "$base/" >/dev/null; }
  wait_for "port-forward to web is up" 30 up || die "could not port-forward to svc/web"

  # Capture bodies first: `curl | grep -q` can fail under pipefail when grep exits early.
  local page
  page="$(curl -fsS "$base/")" || die "game page not served"
  case "$page" in *'id="root"'*) ok "3D game served at /" ;; *) die "/ did not return the game" ;; esac
  page="$(curl -fsS "$base/console/")" || die "console not served"
  case "$page" in *Console*) ok "console served at /console/" ;; *) die "/console/ did not return the console" ;; esac
  n="$(curl -fsS "$base/api/booths" | json_get length)" || die "/api/booths failed (is the api ready?)"
  if [ "${n:-0}" -gt 0 ]; then ok "API through nginx: $n booths in Elasticsearch"; else die "/api/booths returned no booths"; fi
  status="$(curl -fsS "$base/api/game" | json_get state.status)" || die "/api/game failed"
  ok "game status: $status"
  if curl -fsS -H "x-organizer-token: $ORGANIZER_TOKEN" "$base/api/organizer/stats" >/dev/null; then ok "organizer token accepted"; else die "organizer token rejected"; fi

  if kn logs deployment/otel-collector --since=10m 2>/dev/null | grep -iE 'unauthorized|permission denied|invalid token|connection refused' | head -3 | grep -q .; then
    warn "collector reports export errors (check DASH0_OTLP_ENDPOINT / DASH0_AUTH_TOKEN / dataset):"
    kn logs deployment/otel-collector --since=10m | grep -iE 'unauthorized|permission denied|invalid token|connection refused' | head -3 | sed 's/^/    /'
  else
    ok "collector shows no export errors (look for service.name=api in Dash0, dataset salty-cluster)"
  fi
  [ "$status" = "live" ] || warn "Game is '$status'. Open the console -> Organizer (your ORGANIZER_TOKEN) -> ▶ Start."
}

cmd_github() {
  step "GitHub: branch ruleset and Dash0 build variables"
  need_cmd gh "macOS: brew install gh, then gh auth login"
  gh auth status >/dev/null 2>&1 || die "Run: gh auth login"

  if [ -n "${VITE_DASH0_ENDPOINT:-}" ] && [ -n "${VITE_DASH0_AUTH_TOKEN:-}" ]; then
    gh variable set VITE_DASH0_ENDPOINT -R "$REPO" --body "$VITE_DASH0_ENDPOINT" >/dev/null
    gh variable set VITE_DASH0_AUTH_TOKEN -R "$REPO" --body "$VITE_DASH0_AUTH_TOKEN" >/dev/null
    ok "Actions variables set (the next image build on main includes browser monitoring)"
  else
    warn "VITE_DASH0_ENDPOINT / VITE_DASH0_AUTH_TOKEN empty: skipping browser monitoring variables"
  fi

  if gh api "repos/$REPO/rulesets" --jq '.[].name' 2>/dev/null | grep -qx 'protect-main'; then
    ok "ruleset protect-main already exists"
  else
    if gh api -X POST "repos/$REPO/rulesets" --input "$ROOT/deploy/github/ruleset-main.json" >/dev/null 2>&1; then
      ok "ruleset protect-main created: PRs + 1 approval + green CI + resolved conversations; no force-push to main"
    else
      warn "could not create the ruleset (needs repo admin). Ask the repo owner to run: ./deploy/deploy.sh github"
    fi
  fi
  warn "Gitar is a GitHub App: install it on $REPO and paste the review instructions from docs/gitar.md."
}

cmd_loadtest() {
  step "Load test: simulated players against the cluster"
  local port=18081 pf pnpm_cmd
  kn port-forward svc/api "$port:80" >/dev/null 2>&1 &
  pf=$!
  # shellcheck disable=SC2064
  trap "kill $pf 2>/dev/null || true" EXIT
  sleep 3
  if command -v pnpm >/dev/null 2>&1; then pnpm_cmd="pnpm"; else pnpm_cmd="npx --yes pnpm@11.18.0"; fi
  (cd "$ROOT" && $pnpm_cmd install --frozen-lockfile >/dev/null && API_URL="http://127.0.0.1:$port" OTEL_SDK_DISABLED=true $pnpm_cmd --filter @meetspace/api simulate -- "$@")
  ok "watch the api HPA in Radar and check-ins per booth in Dash0"
}

cmd_pin() {
  local sha="${1:-}"
  [ -n "$sha" ] || die "usage: ./deploy/deploy.sh pin <full commit sha on main>"
  local file="$ROOT/deploy/k8s/kustomization.yaml" tmp
  tmp="$(mktemp)"
  awk -v t="sha-$sha" '/^[[:space:]]*newTag:/ { sub(/newTag:.*/, "newTag: " t) } { print }' "$file" >"$tmp" && cat "$tmp" >"$file" && rm -f "$tmp"
  ok "image tags set to sha-$sha in deploy/k8s/kustomization.yaml. Commit it on a branch and open a PR; Argo CD deploys it after merge."
}

cmd_status() {
  step "Status"
  kn get pods -o wide 2>/dev/null || warn "namespace $NAMESPACE not found"
  k -n argocd get application "$APP_NAME" -o jsonpath='{"Argo CD: "}{.status.sync.status}{" / "}{.status.health.status}{"\n"}' 2>/dev/null || true
  kn get ingress,svc web 2>/dev/null || true
}

cmd_all() {
  cmd_check
  cmd_secrets
  cmd_elastic
  cmd_k8s
  cmd_argocd
  cmd_app
  cmd_expose
  cmd_verify
  step "Done"
  ok "Organizer console: /console/#/organizer (token = ORGANIZER_TOKEN in $(basename "$ENV_FILE")). Press ▶ Start."
  ok "Next: ./deploy/deploy.sh github (repo admin), connect Radar, build the Dash0 dashboard (docs/deployment-guide.md Parts 7-8)."
}

STEPS=" check secrets elastic k8s argocd app expose verify github status all "

main() {
  local cmd="${1:-help}"
  case "$cmd" in
    help | -h | --help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//' ;;
    pin)
      shift
      cmd_pin "$@"
      ;;
    loadtest)
      shift
      load_env
      cmd_loadtest "$@"
      ;;
    *)
      # One or more steps in order, e.g. ./deploy/deploy.sh k8s app verify
      local s
      for s in "$@"; do case "$STEPS" in *" $s "*) ;; *) die "unknown step '$s' (see ./deploy/deploy.sh help)" ;; esac; done
      load_env
      for s in "$@"; do "cmd_$s"; done
      ;;
  esac
}

main "$@"
