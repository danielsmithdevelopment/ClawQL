#!/usr/bin/env bash
# Ordered IDP hop smoke against docker-compose.idp-smoke.yml.
# Invoked by smoke-idp-pipeline-b23.sh when IDP_SMOKE_TIER=compose|live.
#
# Pipeline order (DEFAULT_IDP_PIPELINE):
#   1 nextcloud_download  2 docling  3 tika  4 gotenberg  5 stirling
#   6 paperless  7 onyx  8 nextcloud_upload  9 coneshare
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT}/examples/clawql-local-docker-compose/docker-compose.idp-smoke.yml"
WORK="${IDP_SMOKE_WORK_DIR:-${ROOT}/artifacts/idp-b23-smoke/work}"
OUT_DIR="${IDP_SMOKE_OUT_DIR:-${ROOT}/artifacts/idp-b23-smoke}"
CORR="${IDP_SMOKE_CORR:-idp-b23-$(date -u +%Y%m%d%H%M%S)}"
RESULT_LOG="${OUT_DIR}/results.tsv"

mkdir -p "${WORK}" "${OUT_DIR}"
touch "${RESULT_LOG}"

record() {
  local status="$1" name="$2"
  shift 2
  local detail="${*:-}"
  printf '%s\t%s\t%s\n' "${status}" "${name}" "${detail}" >>"${RESULT_LOG}"
  case "${status}" in
    OK) echo "OK: ${name}${detail:+ — ${detail}}" ;;
    SKIP) echo "SKIP: ${name}${detail:+ — ${detail}}" ;;
    FAIL) echo "FAIL: ${name}${detail:+ — ${detail}}" >&2 ;;
  esac
}

wait_http() {
  local url="$1" tries="${2:-60}"
  local _
  for _ in $(seq 1 "${tries}"); do
    if curl -sf -o /dev/null "${url}"; then return 0; fi
    sleep 2
  done
  return 1
}

if ! command -v docker >/dev/null 2>&1; then
  record SKIP compose_stack "docker not available"
  exit 0
fi

PROFILES=()
if [[ "${IDP_SMOKE_INCLUDE_DOCLING:-0}" == "1" ]]; then
  PROFILES+=(--profile docling)
fi

echo "== Compose IDP stack up (staggered: core → paperless → nextcloud) =="
# Stagger boots so Paperless migrate + Nextcloud install do not fight for RAM on GHA.
docker compose -f "${COMPOSE_FILE}" "${PROFILES[@]}" up -d \
  tika gotenberg stirling redis postgres
docker compose -f "${COMPOSE_FILE}" "${PROFILES[@]}" up -d paperless-ngx
if [[ "${IDP_SMOKE_INCLUDE_DOCLING:-0}" == "1" ]]; then
  docker compose -f "${COMPOSE_FILE}" --profile docling up -d docling
fi

cleanup() {
  if [[ "${IDP_SMOKE_COMPOSE_KEEP:-0}" != "1" ]]; then
    docker compose -f "${COMPOSE_FILE}" --profile docling down --remove-orphans -v >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

dump_compose_diag() {
  echo "== compose diag ==" >&2
  docker compose -f "${COMPOSE_FILE}" ps -a >&2 || true
  echo "---- host probes ----" >&2
  for url in \
    "http://127.0.0.1:8000/" \
    "http://127.0.0.1:8000/api/" \
    "http://127.0.0.1:8000/api/token/" \
    "http://127.0.0.1:18081/status.php" \
    "http://127.0.0.1:18080/" \
    "http://127.0.0.1:9998/version" \
    "http://127.0.0.1:3000/health"
  do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "${url}" 2>/dev/null || echo err)"
    echo "  ${code}  ${url}" >&2
  done
  for c in clawql-idp-paperless clawql-idp-stirling clawql-idp-nextcloud clawql-idp-tika clawql-idp-gotenberg; do
    echo "---- logs ${c} (tail) ----" >&2
    docker logs --tail 80 "${c}" 2>&1 || true
  done
}

# --- Health waits ---
ok_core=1
wait_http "http://127.0.0.1:9998/version" 45 || ok_core=0
wait_http "http://127.0.0.1:3000/health" 45 || ok_core=0
# Stirling may need longer first boot
stirling_ok=0
for _ in $(seq 1 90); do
  if curl -sf -o /dev/null "http://127.0.0.1:18080/api/v1/info/status" \
    || curl -sf -o /dev/null "http://127.0.0.1:18080/" ; then
    stirling_ok=1
    break
  fi
  sleep 2
done
[[ "${stirling_ok}" == "1" ]] || ok_core=0

# Paperless: docker healthcheck hits `/` successfully; `/api/` status codes vary by version.
# Prefer container health, fall back to host HTTP on `/` or `/api/`.
paperless_ok=0
last_api=""
last_root=""
pl_health=""
for _ in $(seq 1 150); do
  pl_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' clawql-idp-paperless 2>/dev/null || echo missing)"
  if [[ "${pl_health}" == "healthy" ]]; then
    paperless_ok=1
    break
  fi
  last_api="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:8000/api/" 2>/dev/null || true)"
  last_root="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:8000/" 2>/dev/null || true)"
  if [[ "${last_root}" =~ ^(200|301|302)$ ]] \
    || [[ "${last_api}" =~ ^(200|301|302|401|403)$ ]]; then
    paperless_ok=1
    break
  fi
  sleep 3
done
[[ "${paperless_ok}" == "1" ]] || ok_core=0

nextcloud_ok=0
if [[ "${paperless_ok}" == "1" ]]; then
  # Start Nextcloud after Paperless is healthy to reduce RAM spikes
  docker compose -f "${COMPOSE_FILE}" up -d nextcloud
  for _ in $(seq 1 120); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:18081/status.php" 2>/dev/null || true)"
    if [[ "${code}" == "200" ]]; then
      nextcloud_ok=1
      break
    fi
    sleep 3
  done
fi
[[ "${nextcloud_ok}" == "1" ]] || ok_core=0

if [[ "${ok_core}" != "1" ]]; then
  dump_compose_diag
  record FAIL compose_stack_health \
    "tika/gotenberg/stirling=${stirling_ok} paperless=${paperless_ok}(health=${pl_health:-?} api=${last_api:-?} root=${last_root:-?}) nextcloud=${nextcloud_ok}"
  exit 1
fi
record OK compose_stack_health "tika gotenberg stirling paperless nextcloud"

# --- Stage 1: nextcloud_download (upload fixture then download) ---
NC_USER="admin"
NC_PASS="admin"
NC_BASE="http://127.0.0.1:18081"
FIXTURE_TXT="${WORK}/inbox-smoke.txt"
printf 'ClawQL IDP B2.3 smoke SSN 123-45-6789 deal=%s\n' "${CORR}" >"${FIXTURE_TXT}"
curl -sf -u "${NC_USER}:${NC_PASS}" -X MKCOL "${NC_BASE}/remote.php/dav/files/${NC_USER}/IDP" >/dev/null 2>&1 || true
curl -sf -u "${NC_USER}:${NC_PASS}" -X MKCOL "${NC_BASE}/remote.php/dav/files/${NC_USER}/IDP/inbox" >/dev/null 2>&1 || true
curl -sf -u "${NC_USER}:${NC_PASS}" -X MKCOL "${NC_BASE}/remote.php/dav/files/${NC_USER}/IDP/processed" >/dev/null 2>&1 || true
if curl -sf -u "${NC_USER}:${NC_PASS}" -T "${FIXTURE_TXT}" \
  "${NC_BASE}/remote.php/dav/files/${NC_USER}/IDP/inbox/smoke.txt" \
  && curl -sf -u "${NC_USER}:${NC_PASS}" \
    -o "${WORK}/downloaded-smoke.txt" \
    "${NC_BASE}/remote.php/dav/files/${NC_USER}/IDP/inbox/smoke.txt" \
  && grep -q "ClawQL IDP" "${WORK}/downloaded-smoke.txt"
then
  record OK stage_nextcloud_download
else
  record FAIL stage_nextcloud_download "WebDAV upload/download failed"
fi

# --- Stage 2: docling ---
if [[ -n "${DOCLING_BASE_URL:-}" ]]; then
  if curl -sf "${DOCLING_BASE_URL%/}/health" >/dev/null 2>&1 \
    || curl -sf "${DOCLING_BASE_URL%/}/docs" >/dev/null 2>&1; then
    record OK stage_docling "external ${DOCLING_BASE_URL}"
  else
    record FAIL stage_docling "DOCLING_BASE_URL set but health failed"
  fi
elif [[ "${IDP_SMOKE_INCLUDE_DOCLING:-0}" == "1" ]]; then
  if wait_http "http://127.0.0.1:5001/health" 60 \
    || wait_http "http://127.0.0.1:5001/docs" 30; then
    record OK stage_docling "compose profile docling"
  else
    record FAIL stage_docling "docling profile up but not healthy"
  fi
else
  record SKIP stage_docling "set IDP_SMOKE_INCLUDE_DOCLING=1 (large ~4GiB image) or DOCLING_BASE_URL"
fi

# --- Stage 3: tika ---
code="$(curl -sS -o "${WORK}/tika-out.txt" -w '%{http_code}' \
  -X PUT "http://127.0.0.1:9998/tika" \
  -H "Accept: text/plain" \
  -H "Content-Type: text/plain" \
  --data-binary @"${FIXTURE_TXT}" || true)"
if [[ "${code}" == "200" && -s "${WORK}/tika-out.txt" ]]; then
  record OK stage_tika
else
  record FAIL stage_tika "HTTP ${code}"
fi

# --- Stage 4: gotenberg (HTML → PDF) ---
cat >"${WORK}/smoke.html" <<HTML
<html><body><h1>ClawQL IDP B2.3</h1><p>SSN 123-45-6789 correlation ${CORR}</p></body></html>
HTML
code="$(curl -sS -o "${WORK}/smoke.pdf" -w '%{http_code}' \
  -X POST "http://127.0.0.1:3000/forms/chromium/convert/html" \
  -F "files=@${WORK}/smoke.html;filename=index.html" || true)"
if [[ "${code}" == "200" && -s "${WORK}/smoke.pdf" ]]; then
  # Prefer LibreOffice path used by DEFAULT_IDP_PIPELINE when chromium works as smoke stand-in
  record OK stage_gotenberg "chromium html→pdf ($(wc -c <"${WORK}/smoke.pdf") bytes)"
else
  # Fallback: libreoffice convert endpoint with the html renamed .odt won't work;
  # try libreoffice with a tiny docx isn't available — fail clearly.
  record FAIL stage_gotenberg "HTTP ${code}"
fi

# --- Stage 5: stirling auto-redact ---
code="$(curl -sS -o "${WORK}/redacted.pdf" -w '%{http_code}' \
  -X POST "http://127.0.0.1:18080/api/v1/security/auto-redact" \
  -F "fileInput=@${WORK}/smoke.pdf;type=application/pdf" \
  -F "listOfText=SSN|123-45-6789" \
  -F "useRegex=true" \
  -F "wholeWordSearch=false" \
  -F "redactColor=#000000" \
  -F "customPadding=0.1" \
  -F "convertPDFToImage=false" || true)"
if [[ "${code}" == "200" && -s "${WORK}/redacted.pdf" ]]; then
  record OK stage_stirling "auto-redact ($(wc -c <"${WORK}/redacted.pdf") bytes)"
else
  # Some Stirling builds need X-API-KEY even when empty login; retry once without list regex
  code2="$(curl -sS -o "${WORK}/redacted.pdf" -w '%{http_code}' \
    -X POST "http://127.0.0.1:18080/api/v1/security/auto-redact" \
    -H "X-API-KEY: " \
    -F "fileInput=@${WORK}/smoke.pdf;type=application/pdf" \
    -F "listOfText=123-45-6789" \
    -F "useRegex=false" \
    -F "wholeWordSearch=true" || true)"
  if [[ "${code2}" == "200" && -s "${WORK}/redacted.pdf" ]]; then
    record OK stage_stirling "auto-redact retry ($(wc -c <"${WORK}/redacted.pdf") bytes)"
  else
    record FAIL stage_stirling "HTTP ${code}/${code2}"
  fi
fi

# --- Stage 6: paperless archive ---
TOKEN_JSON="$(curl -sS -X POST "http://127.0.0.1:8000/api/token/" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' || true)"
PL_TOKEN="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))' <<<"${TOKEN_JSON}" 2>/dev/null || true)"
if [[ -z "${PL_TOKEN}" ]]; then
  record FAIL stage_paperless "could not obtain API token: ${TOKEN_JSON:0:200}"
else
  UP_PDF="${WORK}/redacted.pdf"
  [[ -s "${UP_PDF}" ]] || UP_PDF="${WORK}/smoke.pdf"
  code="$(curl -sS -o "${WORK}/paperless-upload.json" -w '%{http_code}' \
    -X POST "http://127.0.0.1:8000/api/documents/post_document/" \
    -H "Authorization: Token ${PL_TOKEN}" \
    -F "document=@${UP_PDF};type=application/pdf" \
    -F "title=clawql-idp-b23-${CORR}" || true)"
  if [[ "${code}" == "200" || "${code}" == "201" || "${code}" == "202" ]]; then
    record OK stage_paperless "HTTP ${code}"
  else
    record FAIL stage_paperless "HTTP ${code} body=$(head -c 160 "${WORK}/paperless-upload.json" 2>/dev/null || true)"
  fi
fi

# --- Stage 7: onyx ---
if [[ -n "${ONYX_BASE_URL:-}" && -n "${ONYX_API_TOKEN:-}" ]]; then
  code="$(curl -sS -o "${WORK}/onyx.json" -w '%{http_code}' \
    -X POST "${ONYX_BASE_URL%/}/search/send-search-message" \
    -H "Authorization: Bearer ${ONYX_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"search_query":"clawql idp smoke","num_hits":1,"include_content":true}' || true)"
  if [[ "${code}" == "200" ]]; then
    record OK stage_onyx "external search HTTP 200"
  else
    record FAIL stage_onyx "HTTP ${code}"
  fi
else
  record SKIP stage_onyx "needs ONYX_BASE_URL + ONYX_API_TOKEN (multi-service stack; not in compose smoke)"
fi

# --- Stage 8: nextcloud_upload (processed) ---
UP_PDF="${WORK}/redacted.pdf"
[[ -s "${UP_PDF}" ]] || UP_PDF="${WORK}/smoke.pdf"
if [[ -s "${UP_PDF}" ]] && curl -sf -u "${NC_USER}:${NC_PASS}" -T "${UP_PDF}" \
  "${NC_BASE}/remote.php/dav/files/${NC_USER}/IDP/processed/smoke-redacted.pdf"
then
  record OK stage_nextcloud_upload
else
  record FAIL stage_nextcloud_upload
fi

# --- Stage 9: coneshare ---
if [[ -n "${CONESHARE_BASE_URL:-}" && -n "${CONESHARE_API_TOKEN:-}" ]]; then
  code="$(curl -sS -o "${WORK}/coneshare.json" -w '%{http_code}' \
    -X GET "${CONESHARE_BASE_URL%/}/" \
    -H "Authorization: Bearer ${CONESHARE_API_TOKEN}" || true)"
  if [[ "${code}" == "200" || "${code}" == "401" || "${code}" == "403" || "${code}" == "404" ]]; then
    # Reachability / auth surface is enough for smoke; full dataroom create is product-specific.
    record OK stage_coneshare "reachable HTTP ${code}"
  else
    record FAIL stage_coneshare "HTTP ${code}"
  fi
else
  record SKIP stage_coneshare "needs CONESHARE_BASE_URL + CONESHARE_API_TOKEN (external/commercial; not in compose smoke)"
fi

# --- Ordered artifact ---
python3 - "${OUT_DIR}" "${CORR}" "${RESULT_LOG}" <<'PY'
import json, sys
from pathlib import Path
out_dir, corr, log_path = sys.argv[1:4]
order = [
    "stage_nextcloud_download",
    "stage_docling",
    "stage_tika",
    "stage_gotenberg",
    "stage_stirling",
    "stage_paperless",
    "stage_onyx",
    "stage_nextcloud_upload",
    "stage_coneshare",
]
status = {}
for line in Path(log_path).read_text(encoding="utf-8").splitlines():
    parts = line.split("\t", 2)
    if len(parts) >= 2 and parts[1].startswith("stage_"):
        status[parts[1]] = parts[0]
stages = []
passed = 0
for name in order:
    st = status.get(name, "SKIP")
    stages.append({"stage": name.removeprefix("stage_"), "status": st})
    if st == "OK":
        passed += 1
failed = [s for s in stages if s["status"] == "FAIL"]
out = {
    "ok": len(failed) == 0,
    "correlation_id": corr,
    "mode": "compose_ordered",
    "dryRunOnly": False,
    "stages": stages,
    "stages_passed": passed,
    "stages_total": len(order),
    "source": "idp-pipeline-b23-ordered",
    "compose_included": ["nextcloud", "tika", "gotenberg", "stirling", "paperless"],
    "external_or_optional": {
        "docling": "IDP_SMOKE_INCLUDE_DOCLING=1 or DOCLING_BASE_URL",
        "onyx": "ONYX_BASE_URL + ONYX_API_TOKEN",
        "coneshare": "CONESHARE_BASE_URL + CONESHARE_API_TOKEN",
    },
}
Path(out_dir, "pipeline-smoke.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
print(json.dumps(out, indent=2))
raise SystemExit(0 if out["ok"] else 1)
PY
