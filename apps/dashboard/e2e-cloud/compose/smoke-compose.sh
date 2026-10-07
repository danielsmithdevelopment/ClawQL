#!/usr/bin/env bash
# CI / local smoke for Cloud E2E Compose stacks (Keycloak realm + multi-gateway/NATS).
# Does not require the dashboard — validates IdP + replica-kill arrange surfaces.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
KC_COMPOSE="$ROOT/apps/dashboard/e2e-cloud/compose/keycloak/docker-compose.yml"
GW_COMPOSE="$ROOT/apps/dashboard/e2e-cloud/compose/multi-gateway/docker-compose.yml"
KILL="$ROOT/apps/dashboard/e2e-cloud/compose/multi-gateway/kill-replica.sh"
KC=http://127.0.0.1:18089

cleanup() {
  docker compose -f "$GW_COMPOSE" down -v --remove-orphans >/dev/null 2>&1 || true
  docker compose -f "$KC_COMPOSE" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== docker compose config =="
docker compose -f "$KC_COMPOSE" config -q
docker compose -f "$GW_COMPOSE" config -q

echo "== keycloak up =="
docker compose -f "$KC_COMPOSE" up -d
for _ in $(seq 1 60); do
  if curl -fsS "$KC/" >/dev/null 2>&1; then
    echo keycloak-http-up
    break
  fi
  sleep 2
done
curl -fsS "$KC/" >/dev/null

echo "== keycloak admin token + realm users =="
TOKEN=""
USERS=""
for _ in $(seq 1 60); do
  TOKEN="$(
    curl -fsS -X POST "$KC/realms/master/protocol/openid-connect/token" \
      -H 'content-type: application/x-www-form-urlencoded' \
      -d 'grant_type=password&client_id=admin-cli&username=admin&password=admin' \
      2>/dev/null \
      | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])' 2>/dev/null \
      || true
  )"
  if [[ -n "$TOKEN" ]]; then
    USERS="$(curl -fsS -H "authorization: Bearer $TOKEN" \
      "$KC/admin/realms/clawql-e2e/users" 2>/dev/null || true)"
    if echo "$USERS" | python3 -c 'import sys,json; u=json.load(sys.stdin); assert any(x.get("username")=="jordan.park" for x in u); assert any(x.get("username")=="priya.shah" for x in u)' 2>/dev/null; then
      echo "realm-import-ready"
      break
    fi
  fi
  sleep 2
done
[[ -n "$USERS" ]] || { echo "ERROR: clawql-e2e realm users not ready" >&2; exit 1; }
echo "$USERS" | python3 -c 'import sys,json; u=json.load(sys.stdin); print("users-ok", len(u))'

# Ensure Support / Legal exist (realm import sometimes omits empty top-level groups).
ensure_group() {
  local name="$1"
  local found
  found="$(curl -fsS -H "authorization: Bearer $TOKEN" \
    "$KC/admin/realms/clawql-e2e/groups?search=${name}&exact=true" \
    | python3 -c "import sys,json; g=json.load(sys.stdin); print(next((x['id'] for x in g if x.get('name')=='$name'), ''))")"
  if [[ -z "$found" ]]; then
    echo "creating group $name"
    curl -fsS -X POST -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
      "$KC/admin/realms/clawql-e2e/groups" \
      -d "{\"name\":\"$name\"}" -o /dev/null -w "create-$name:%{http_code}\n"
    found="$(curl -fsS -H "authorization: Bearer $TOKEN" \
      "$KC/admin/realms/clawql-e2e/groups?search=${name}&exact=true" \
      | python3 -c "import sys,json; g=json.load(sys.stdin); print(next(x['id'] for x in g if x.get('name')=='$name'))")"
  fi
  echo "$found"
}

SUPPORT_ID="$(ensure_group Support)"
LEGAL_ID="$(ensure_group Legal)"
[[ -n "$SUPPORT_ID" && -n "$LEGAL_ID" ]] || { echo "ERROR: groups missing Support=$SUPPORT_ID Legal=$LEGAL_ID" >&2; exit 1; }
echo "groups-ok Support=$SUPPORT_ID Legal=$LEGAL_ID"

JORDAN_ID="$(echo "$USERS" | python3 -c 'import sys,json; print(next(x["id"] for x in json.load(sys.stdin) if x.get("username")=="jordan.park"))')"

# Join then remove so arrange is idempotent whether import attached the group.
curl -fsS -X PUT -H "authorization: Bearer $TOKEN" \
  "$KC/admin/realms/clawql-e2e/users/${JORDAN_ID}/groups/${SUPPORT_ID}" \
  -o /dev/null -w 'join-support:%{http_code}\n' || true
code="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE -H "authorization: Bearer $TOKEN" \
  "$KC/admin/realms/clawql-e2e/users/${JORDAN_ID}/groups/${SUPPORT_ID}")"
echo "remove-support:$code"
[[ "$code" == "204" || "$code" == "200" || "$code" == "404" ]] || {
  echo "ERROR: unexpected remove-support status $code" >&2
  exit 1
}
echo "keycloak-arrange-ok"

echo "== multi-gateway + nats up =="
docker compose -f "$GW_COMPOSE" up -d
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:18080/healthz >/dev/null 2>&1 \
    && curl -fsS http://127.0.0.1:18081/healthz >/dev/null 2>&1 \
    && curl -fsS http://127.0.0.1:18222/healthz >/dev/null 2>&1; then
    echo gateways-nats-up
    break
  fi
  sleep 2
done
curl -fsS http://127.0.0.1:18080/healthz >/dev/null
curl -fsS http://127.0.0.1:18081/healthz >/dev/null
curl -fsS http://127.0.0.1:18222/healthz >/dev/null

echo "== kill gateway-a =="
bash "$KILL" gateway-a
sleep 1
if curl -fsS http://127.0.0.1:18080/healthz >/dev/null 2>&1; then
  echo "ERROR: gateway-a still healthy after kill" >&2
  exit 1
fi
curl -fsS http://127.0.0.1:18081/healthz >/dev/null
curl -fsS http://127.0.0.1:18222/healthz >/dev/null
echo "compose-kill-ok remaining=gateway-b+nats"

echo "ALL_COMPOSE_SMOKE_OK"
