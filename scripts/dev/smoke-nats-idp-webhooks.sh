#!/usr/bin/env bash
# Smoke: Nextcloud inbox + Coneshare webhooks for NATS IDP enablement.
# Usage:
#   CLAWQL_HTTP_BASE=http://localhost:8080 \
#   CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN=dev \
#   CLAWQL_CONESHARE_WEBHOOK_TOKEN=dev \
#   bash scripts/dev/smoke-nats-idp-webhooks.sh
#
# Helm template checks (no cluster):
#   SMOKE_HELM_ONLY=1 bash scripts/dev/smoke-nats-idp-webhooks.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

HELM_ONLY="${SMOKE_HELM_ONLY:-0}"
BASE="${CLAWQL_HTTP_BASE:-http://127.0.0.1:8080}"
NC_TOKEN="${CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN:-}"
CS_TOKEN="${CLAWQL_CONESHARE_WEBHOOK_TOKEN:-}"
CORR="nats-idp-smoke-$(date -u +%Y%m%d%H%M%S)"

echo "== Helm template: NATS IDP document consumers =="
TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT
helm template smoke-nats charts/clawql-mcp --namespace clawql \
  --set envFromSecret=clawql-lint-provider-env \
  --set kyverno.imageSignaturePolicy.enabled=false \
  -f charts/clawql-mcp/values-nats-idp.example.yaml \
  --set nats.keda.enabled=true \
  --set enableWorkflow=true >"${TMP}"

python3 - "${TMP}" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
checks = [
    (r"CLAWQL_NATS_CONSUMER_IDP_PIPELINE", "idp pipeline consumer env"),
    (r"CLAWQL_NATS_CONSUMER_CONESHARE_FOLLOWUP", "coneshare followup consumer env"),
    (r'consumer: "clawql-idp-pipeline"', "KEDA idp-pipeline trigger"),
    (r'consumer: "clawql-coneshare-followup"', "KEDA coneshare trigger"),
    (r'consumer: "clawql-hitl-resume"', "KEDA HITL trigger"),
]
for pattern, label in checks:
    if not re.search(pattern, text):
        print(f"ERROR: missing {label}")
        sys.exit(1)
print("helm template OK (document + HITL KEDA triggers)")
PY

if [[ "${HELM_ONLY}" == "1" ]]; then
  echo "OK: smoke-nats-idp-webhooks.sh (helm-only)"
  exit 0
fi

echo "== HTTP webhook smoke against ${BASE} =="
if [[ -z "${NC_TOKEN}" ]]; then
  echo "SKIP nextcloud webhook: set CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN" >&2
else
  code="$(curl -sS -o /tmp/clawql-nc-smoke.json -w '%{http_code}' \
    -X POST "${BASE}/idp/nextcloud/webhook" \
    -H "Authorization: Bearer ${NC_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"document_path\":\"IDP/inbox/smoke-w2.pdf\",\"processed_path\":\"IDP/processed/smoke-w2.pdf\",\"redact_list\":\"SSN,EIN\",\"dry_run\":true,\"correlation_id\":\"${CORR}\"}")"
  echo "POST /idp/nextcloud/webhook → HTTP ${code}"
  cat /tmp/clawql-nc-smoke.json
  echo
  [[ "${code}" == "200" ]] || { echo "ERROR: expected HTTP 200 from nextcloud webhook" >&2; exit 1; }
  python3 - <<'PY'
import json
j=json.load(open("/tmp/clawql-nc-smoke.json",encoding="utf-8"))
assert j.get("ok") is True, j
print("nextcloud webhook ok; nats_published=", j.get("nats_published"))
PY
fi

if [[ -z "${CS_TOKEN}" ]]; then
  echo "SKIP coneshare webhook: set CLAWQL_CONESHARE_WEBHOOK_TOKEN" >&2
else
  code="$(curl -sS -o /tmp/clawql-cs-smoke.json -w '%{http_code}' \
    -X POST "${BASE}/idp/coneshare/webhook" \
    -H "Authorization: Bearer ${CS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"event_type\":\"viewer.opened\",\"share_link_id\":\"smoke-share\",\"viewer_email\":\"analyst@example.com\",\"correlation_id\":\"${CORR}\"}")"
  echo "POST /idp/coneshare/webhook → HTTP ${code}"
  cat /tmp/clawql-cs-smoke.json
  echo
  [[ "${code}" == "200" ]] || { echo "ERROR: expected HTTP 200 from coneshare webhook" >&2; exit 1; }
  python3 - <<'PY'
import json
j=json.load(open("/tmp/clawql-cs-smoke.json",encoding="utf-8"))
assert j.get("ok") is True, j
print("coneshare webhook ok")
PY
fi

if [[ -z "${NC_TOKEN}" && -z "${CS_TOKEN}" ]]; then
  echo "WARN: no webhook tokens set — only Helm checks ran" >&2
fi

echo "OK: smoke-nats-idp-webhooks.sh"
