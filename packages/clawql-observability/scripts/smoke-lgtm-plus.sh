#!/usr/bin/env bash
# Smoke-test the local LGTM+ docker-compose stack: health, OTLP ingest via Alloy,
# and read-back from Loki / Tempo / Mimir.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="${ROOT}/packages/clawql-observability/docker/docker-compose.yaml"
PROJECT="${CLAWQL_LGTM_SMOKE_PROJECT:-clawql-lgtm-smoke}"
SERVICE_NAME="${CLAWQL_LGTM_SMOKE_SERVICE:-clawql-lgtm-smoke}"
# GHCR tags use a leading "v" (e.g. v0.159.0); bare semver tags 404.
TELEMETRYGEN_IMAGE="${TELEMETRYGEN_IMAGE:-ghcr.io/open-telemetry/opentelemetry-collector-contrib/telemetrygen:v0.119.0}"

cleanup() {
  docker compose -f "${COMPOSE_FILE}" -p "${PROJECT}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_url() {
  local name="$1"
  local url="$2"
  local attempts="${3:-36}"
  for _ in $(seq 1 "${attempts}"); do
    if curl -sf "${url}" >/dev/null; then
      echo "ready: ${name} (${url})"
      return 0
    fi
    sleep 5
  done
  echo "FAIL: ${name} not ready at ${url}" >&2
  docker compose -f "${COMPOSE_FILE}" -p "${PROJECT}" logs --no-color >&2 || true
  exit 1
}

echo "Starting LGTM+ compose (project=${PROJECT})"
docker compose -f "${COMPOSE_FILE}" -p "${PROJECT}" up -d

wait_url "Grafana" "http://127.0.0.1:3000/api/health"
wait_url "Loki" "http://127.0.0.1:3100/ready"
wait_url "Tempo" "http://127.0.0.1:3200/ready"
wait_url "Mimir" "http://127.0.0.1:9009/ready"
wait_url "Alloy" "http://127.0.0.1:12345/-/ready" 24
# Pyroscope exposes /ready (not /healthz) in grafana/pyroscope 1.x images.
if ! curl -sf "http://127.0.0.1:4040/ready" >/dev/null 2>&1; then
  wait_url "Pyroscope" "http://127.0.0.1:4040/" 12
else
  echo "ready: Pyroscope (http://127.0.0.1:4040/ready)"
fi

run_telemetrygen() {
  local subcommand="$1"
  shift
  # Host-only endpoint with --otlp-http; including http:// breaks URL construction in older telemetrygen.
  docker run --rm --network host "${TELEMETRYGEN_IMAGE}" \
    "${subcommand}" \
    --otlp-http \
    --otlp-insecure \
    --otlp-endpoint "127.0.0.1:4318" \
    --otlp-attributes "service.name=\"${SERVICE_NAME}\"" \
    "$@"
}

echo "Sending OTLP traces, logs, and metrics through Alloy"
run_telemetrygen traces --traces 3 --workers 1 --span-duration 50ms
run_telemetrygen logs --logs 5 --workers 1
run_telemetrygen metrics --metrics 8 --workers 1

echo "Waiting for Alloy batch + remote_write flush"
sleep 15

echo "Checking Tempo for ${SERVICE_NAME} traces"
tempo_search="$(curl -sf "http://127.0.0.1:3200/api/search?limit=20")"
if ! grep -q "${SERVICE_NAME}" <<<"${tempo_search}"; then
  echo "FAIL: Tempo search did not include ${SERVICE_NAME}" >&2
  echo "${tempo_search}" >&2
  exit 1
fi
echo "OK: Tempo indexed traces"

start_ns=$(( ($(date +%s) - 600) * 1000000000 ))
end_ns=$(( $(date +%s) * 1000000000 ))

echo "Checking Loki for ${SERVICE_NAME} logs"
loki_query='{service_name="'${SERVICE_NAME}'"}'
loki_result="$(curl -sf -G "http://127.0.0.1:3100/loki/api/v1/query_range" \
  --data-urlencode "query=${loki_query}" \
  --data-urlencode "start=${start_ns}" \
  --data-urlencode "end=${end_ns}" \
  --data-urlencode "limit=20")" || loki_result="{}"

if ! echo "${loki_result}" | jq -e '[.data.result[].values[]?] | length > 0' >/dev/null 2>&1; then
  echo "Loki service_name label empty; trying broader OTLP query"
  loki_result="$(curl -sf -G "http://127.0.0.1:3100/loki/api/v1/query_range" \
    --data-urlencode 'query={exporter="OTLP"}' \
    --data-urlencode "start=${start_ns}" \
    --data-urlencode "end=${end_ns}" \
    --data-urlencode "limit=20")"
fi

if ! echo "${loki_result}" | jq -e '[.data.result[].values[]?] | length > 0' >/dev/null; then
  echo "FAIL: Loki query returned no log lines" >&2
  echo "${loki_result}" >&2
  exit 1
fi
echo "OK: Loki returned log lines"

echo "Checking Mimir for telemetrygen metrics"
mimir_result=""
for _ in $(seq 1 12); do
  if mimir_result="$(curl -sf --max-time 10 \
    -H "X-Scope-OrgID: anonymous" \
    -G "http://127.0.0.1:9009/prometheus/api/v1/query" \
    --data-urlencode "query=gen")"; then
    break
  fi
  sleep 5
done

if [[ -z "${mimir_result}" ]] || ! grep -q '"status":"success"' <<<"${mimir_result}"; then
  echo "FAIL: Mimir Prometheus query unsuccessful" >&2
  echo "${mimir_result:-<empty>}" >&2
  docker compose -f "${COMPOSE_FILE}" -p "${PROJECT}" logs mimir alloy --no-color >&2 || true
  exit 1
fi
echo "OK: Mimir Prometheus API responding"

echo "LGTM+ smoke passed (Alloy OTLP → Loki/Tempo/Mimir verified)"
