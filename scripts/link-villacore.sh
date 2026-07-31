#!/usr/bin/env bash
# Prepares the shared Docker bridge between this portal and the VillaCore stack.
#
# Idempotent and additive: creates the `villacore_link` network, connects the
# VillaCore Home Assistant container to it, then verifies that
# http://home-assistant:8123 answers from inside that network. Nothing is
# deleted and no container is restarted.
#
# Usage:
#   scripts/link-villacore.sh [--network NAME] [--ha-container NAME] [--token TOKEN]
set -euo pipefail

NETWORK="${VILLACORE_LINK_NETWORK:-villacore_link}"
HA_CONTAINER="villacore-home-assistant-1"
TOKEN=""

while [ $# -gt 0 ]; do
  case "$1" in
    --network) NETWORK="$2"; shift 2 ;;
    --ha-container) HA_CONTAINER="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 64 ;;
  esac
done

step() { printf '\033[36m==> %s\033[0m\n' "$1"; }
ok() { printf '\033[32m    OK  %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    !   %s\033[0m\n' "$1"; }
fail() { printf '\033[31m    X   %s\033[0m\n' "$1"; }

step "Checking Docker"
if ! docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
  fail "Docker is not reachable. Start the engine and re-run."
  exit 1
fi
ok "Docker engine reachable"

step "Ensuring network '$NETWORK'"
if [ "$(docker network ls --filter "name=^${NETWORK}$" --format '{{.Name}}')" = "$NETWORK" ]; then
  ok "already present"
else
  docker network create "$NETWORK" >/dev/null
  ok "created"
fi

step "Attaching '$HA_CONTAINER'"
if [ "$(docker ps --filter "name=^${HA_CONTAINER}$" --format '{{.Names}}')" != "$HA_CONTAINER" ]; then
  warn "container not running. Start the VillaCore stack first (scripts/start.sh there),"
  warn "or pass --ha-container with the real name (docker ps)."
  warn "The network exists, so you can re-run this script later."
  exit 2
fi

attached=$(docker inspect "$HA_CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')
case " $attached " in
  *" $NETWORK "*) ok "already on '$NETWORK'" ;;
  *)
    # Alias `home-assistant` keeps the URL identical regardless of how the
    # VillaCore compose project names the service.
    docker network connect --alias home-assistant "$NETWORK" "$HA_CONTAINER"
    ok "attached with alias 'home-assistant'"
    ;;
esac

# A throwaway container on the same network proves DNS + reachability the way
# the backend will see them. The HA image itself is reused so nothing is pulled.
step "Verifying http://home-assistant:8123 from inside the network"
ha_image=$(docker inspect "$HA_CONTAINER" --format '{{.Config.Image}}')

probe() {
  # probe <url> [token]
  if [ -n "${2:-}" ]; then
    docker run --rm --network "$NETWORK" --entrypoint curl "$ha_image" \
      -s -o /dev/null -m 8 -w '%{http_code}' -H "Authorization: Bearer $2" "$1" 2>&1 || true
  else
    docker run --rm --network "$NETWORK" --entrypoint curl "$ha_image" \
      -s -o /dev/null -m 8 -w '%{http_code}' "$1" 2>&1 || true
  fi
}

reach=$(probe "http://home-assistant:8123/")
case "$reach" in
  200) ok "reachable by service name" ;;
  *"executable file not found"*) warn "no curl in the HA image: reachability not verified automatically" ;;
  *) fail "not reachable (answer: '$reach')"; exit 1 ;;
esac

if [ -n "$TOKEN" ]; then
  auth=$(probe "http://home-assistant:8123/api/" "$TOKEN")
  case "$auth" in
    200) ok "token accepted by the HA API" ;;
    401) fail "token rejected (401). It probably belongs to a different HA instance."; exit 1 ;;
    *) fail "unexpected API answer: '$auth'"; exit 1 ;;
  esac
else
  warn "no --token given: authentication not verified"
fi

suggested=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')

echo
step "Put this in .env (portal root)"
cat <<EOF
    SMART_PROVIDER_MODE=villacore
    HOME_ASSISTANT_URL=http://home-assistant:8123
    HOME_ASSISTANT_TOKEN=<long-lived token from HA: profile -> Security>
    SMART_INGEST_TOKEN=${suggested}
    SMART_POLL_INTERVAL_SECONDS=300
    VILLACORE_SITE_ID=dev
EOF
step "Then start the portal with the link overlay"
echo "    docker compose -f docker-compose.yml -f docker-compose.villacore.yml up -d --build"
step "In VillaCore, secrets.yaml needs the same shared secret"
echo "    portal_ingest_token: ${suggested}"
echo "    portal_base_url: http://backend:8000"
echo
warn "The attachment above is a runtime one: Docker forgets it if the VillaCore"
warn "container is recreated. Apply prompt P1 in docs/VILLACORE_PROMPTS.md to make"
warn "it permanent in VillaCore's own docker-compose.yml."
