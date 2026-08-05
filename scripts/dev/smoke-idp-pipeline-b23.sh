#!/usr/bin/env bash
# B-2.3 IDP pipeline smoke — scheduled / dispatch only (not OpenBench pr_active).
#
# Tiers:
#   offline (default)  Helm NATS IDP templates + vitest pipeline dry_run + plan artifact
#   compose            offline + local Tika/Gotenberg health (docker compose)
#   live               offline + HTTP webhook dry_run against CLAWQL_HTTP_BASE
#
# Usage:
#   bash scripts/dev/smoke-idp-pipeline-b23.sh
#   IDP_SMOKE_TIER=compose bash scripts/dev/smoke-idp-pipeline-b23.sh
#   IDP_SMOKE_TIER=live CLAWQL_HTTP_BASE=… CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN=… \
#     bash scripts/dev/smoke-idp-pipeline-b23.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

TIER="${IDP_SMOKE_TIER:-offline}"
OUT_DIR="${IDP_SMOKE_OUT_DIR:-${ROOT}/artifacts/idp-b23-smoke}"
CORR="idp-b23-$(date -u +%Y%m%d%H%M%S)"
RESULT_LOG="${OUT_DIR}/results.tsv"
mkdir -p "${OUT_DIR}"
: >"${RESULT_LOG}"

record() {
  # record STATUS name [detail…]
  local status="$1"
  local name="$2"
  shift 2
  local detail="${*:-}"
  printf '%s\t%s\t%s\n' "${status}" "${name}" "${detail}" >>"${RESULT_LOG}"
  case "${status}" in
    OK) echo "OK: ${name}${detail:+ — ${detail}}" ;;
    SKIP) echo "SKIP: ${name}${detail:+ — ${detail}}" ;;
    FAIL) echo "FAIL: ${name}${detail:+ — ${detail}}" >&2 ;;
  esac
}

echo "== B-2.3 IDP pipeline smoke (tier=${TIER}, corr=${CORR}) =="

# --- Tier offline: Helm NATS IDP wiring ---
if command -v helm >/dev/null 2>&1; then
  if SMOKE_HELM_ONLY=1 bash "${ROOT}/scripts/dev/smoke-nats-idp-webhooks.sh"; then
    record OK helm_nats_idp_templates
  else
    record FAIL helm_nats_idp_templates "smoke-nats-idp-webhooks.sh helm-only failed"
  fi
else
  record SKIP helm_nats_idp_templates "helm not installed"
fi

# --- Tier offline: unit + dry_run pipeline ---
if [[ -f node_modules/.bin/vitest ]] || [[ -d node_modules/vitest ]]; then
  if npx vitest run \
    packages/clawql-documents/src/pipeline/idp-pipeline.test.ts \
    packages/clawql-documents/src/pipeline/runner.test.ts \
    packages/clawql-documents/src/effect/idp-pipeline-effect.test.ts \
    --reporter=dot
  then
    record OK vitest_idp_pipeline_dry_run
  else
    record FAIL vitest_idp_pipeline_dry_run "vitest failed"
  fi
else
  record SKIP vitest_idp_pipeline_dry_run "node_modules missing (run npm ci first)"
fi

# --- Tier offline: DEFAULT_IDP_PIPELINE stage inventory artifact ---
python3 - "${OUT_DIR}" "${TIER}" "${CORR}" <<'PY'
import json, sys
from pathlib import Path
out_dir, tier, corr = sys.argv[1], sys.argv[2], sys.argv[3]
stages = [
    "nextcloud_download",
    "docling",
    "tika",
    "gotenberg",
    "stirling",
    "paperless",
    "onyx",
    "nextcloud_upload",
    "coneshare",
]
out = {
    "ok": True,
    "tier": tier,
    "correlation_id": corr,
    "mode": "offline_plan",
    "dryRunOnly": True,
    "stages_planned": stages,
    "stages_passed": len(stages),
    "source": "idp-pipeline-b23-smoke",
    "note": "Plan inventory only — live vendor hops require compose/live tier + secrets.",
}
Path(out_dir, "pipeline-smoke.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
print(f"wrote {out_dir}/pipeline-smoke.json")
PY
record OK pipeline_smoke_artifact

# --- Tier compose: Tika + Gotenberg health ---
if [[ "${TIER}" == "compose" || "${TIER}" == "live" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    record SKIP compose_tika_gotenberg "docker not available"
  else
    COMPOSE_FILE="${ROOT}/examples/clawql-local-docker-compose/docker-compose.yml"
    echo "== Compose: start tika + gotenberg =="
    if docker compose -f "${COMPOSE_FILE}" up -d tika gotenberg; then
      ok_tika=0
      ok_got=0
      for _ in $(seq 1 30); do
        if curl -sf "http://127.0.0.1:9998/version" >/dev/null 2>&1; then ok_tika=1; fi
        if curl -sf "http://127.0.0.1:3000/health" >/dev/null 2>&1; then ok_got=1; fi
        if [[ "${ok_tika}" == "1" && "${ok_got}" == "1" ]]; then break; fi
        sleep 2
      done
      if [[ "${ok_tika}" == "1" && "${ok_got}" == "1" ]]; then
        record OK compose_tika_gotenberg_health
        code="$(curl -sS -o /tmp/idp-b23-tika.txt -w '%{http_code}' \
          -X PUT "http://127.0.0.1:9998/tika" \
          -H "Accept: text/plain" \
          --data-binary $'ClawQL IDP B2.3 smoke\n' || true)"
        if [[ "${code}" == "200" ]] && grep -qi "ClawQL" /tmp/idp-b23-tika.txt; then
          record OK compose_tika_parse_put
        else
          record FAIL compose_tika_parse_put "HTTP ${code}"
        fi
      else
        record FAIL compose_tika_gotenberg_health "tika=${ok_tika} gotenberg=${ok_got}"
      fi
      if [[ "${IDP_SMOKE_COMPOSE_KEEP:-0}" != "1" ]]; then
        docker compose -f "${COMPOSE_FILE}" stop tika gotenberg >/dev/null 2>&1 || true
      fi
    else
      record FAIL compose_tika_gotenberg "docker compose up failed"
    fi
  fi
fi

# --- Tier live: remote ClawQL HTTP webhooks (dry_run) ---
if [[ "${TIER}" == "live" ]]; then
  if [[ -z "${CLAWQL_HTTP_BASE:-}" ]]; then
    record SKIP live_http_webhooks "set CLAWQL_HTTP_BASE"
  elif [[ -z "${CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN:-}" && -z "${CLAWQL_CONESHARE_WEBHOOK_TOKEN:-}" ]]; then
    record SKIP live_http_webhooks "set CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN and/or CLAWQL_CONESHARE_WEBHOOK_TOKEN"
  else
    if bash "${ROOT}/scripts/dev/smoke-nats-idp-webhooks.sh"; then
      record OK live_http_webhooks
    else
      record FAIL live_http_webhooks "smoke-nats-idp-webhooks.sh failed"
    fi
  fi
fi

# --- Summary ---
python3 - "${OUT_DIR}" "${TIER}" "${CORR}" "${RESULT_LOG}" <<'PY'
import json, sys
from pathlib import Path

out_dir, tier, corr, log_path = sys.argv[1:5]
passed, skipped, failed = [], [], []
for line in Path(log_path).read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    parts = line.split("\t", 2)
    status, name = parts[0], parts[1]
    if status == "OK":
        passed.append(name)
    elif status == "SKIP":
        skipped.append(name)
    elif status == "FAIL":
        failed.append(name)

summary = {
    "ok": len(failed) == 0,
    "tier": tier,
    "correlation_id": corr,
    "passed": passed,
    "skipped": skipped,
    "failed": failed,
    "source": "idp-pipeline-b23-smoke",
}
Path(out_dir, "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2))
raise SystemExit(0 if summary["ok"] else 1)
PY
