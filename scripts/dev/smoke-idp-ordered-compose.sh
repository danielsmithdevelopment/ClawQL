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
    "http://127.0.0.1:18082/health" \
    "http://127.0.0.1:8999/api/v1/_health/" \
    "http://127.0.0.1:18081/status.php" \
    "http://127.0.0.1:18080/" \
    "http://127.0.0.1:9998/version" \
    "http://127.0.0.1:3000/health"
  do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "${url}" 2>/dev/null || echo err)"
    echo "  ${code}  ${url}" >&2
  done
  for c in \
    clawql-idp-paperless clawql-idp-stirling clawql-idp-nextcloud \
    clawql-idp-onyx-api clawql-idp-coneshare-web \
    clawql-idp-tika clawql-idp-gotenberg
  do
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

# --- Stage 7: onyx (compose upsert_ingestion_doc, or external secrets) ---
# Free Stirling RAM before pulling/starting Onyx on GHA runners.
docker stop clawql-idp-stirling >/dev/null 2>&1 || true

ONYX_BASE="${ONYX_BASE_URL:-}"
ONYX_TOKEN="${ONYX_API_TOKEN:-}"
if [[ -z "${ONYX_BASE}" || -z "${ONYX_TOKEN}" ]]; then
  echo "== Start Onyx (minimal postgres-backed API) =="
  docker compose -f "${COMPOSE_FILE}" up -d onyx-postgres onyx-api
  onyx_ok=0
  for _ in $(seq 1 120); do
    oh="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' clawql-idp-onyx-api 2>/dev/null || echo missing)"
    if [[ "${oh}" == "healthy" ]]; then
      onyx_ok=1
      break
    fi
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:18082/health" 2>/dev/null || true)"
    if [[ "${code}" == "200" ]]; then
      onyx_ok=1
      break
    fi
    sleep 3
  done
  if [[ "${onyx_ok}" != "1" ]]; then
    dump_compose_diag
    record FAIL stage_onyx "onyx-api never healthy"
  else
    ONYX_BASE="http://127.0.0.1:18082"
    DOC_ID="idp-b23-${CORR}"
    ingest_body="$(python3 - "${DOC_ID}" "${CORR}" <<'PY'
import json, sys
doc_id, corr = sys.argv[1], sys.argv[2]
print(json.dumps({
  "document": {
    "id": doc_id,
    "semantic_identifier": f"ClawQL IDP B2.3 smoke {corr}",
    "title": f"clawql-idp-b23-{corr}",
    "source": "ingestion_api",
    "from_ingestion_api": True,
    "sections": [{"type": "text", "text": f"ClawQL IDP B2.3 ordered smoke correlation {corr}. SSN redacted upstream."}],
    "metadata": {"pipeline": "idp-b23", "correlation_id": corr},
  }
}))
PY
)"
    # Register first admin (ignore already-exists), then login for session cookie.
    # Prefer cookie auth for upsert — /admin/api-key is Business-tier gated on recent Onyx.
    reg_code="$(curl -sS -o "${WORK}/onyx-register.json" -w '%{http_code}' \
      -X POST "${ONYX_BASE}/auth/register" \
      -H "Content-Type: application/json" \
      -d '{"email":"admin@example.com","password":"Adminadmin1!","is_active":true,"is_superuser":true,"is_verified":true,"role":"admin"}' || true)"
    COOKIE_JAR="${WORK}/onyx-cookies.txt"
    rm -f "${COOKIE_JAR}"
    login_code="$(curl -sS -o "${WORK}/onyx-login.json" -w '%{http_code}' \
      -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
      -X POST "${ONYX_BASE}/auth/login" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      --data-urlencode "username=admin@example.com" \
      --data-urlencode "password=Adminadmin1!" || true)"
    # Optional API key when EE/license flags allow it
    key_json="$(curl -sS -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
      -X POST "${ONYX_BASE}/admin/api-key" \
      -H "Content-Type: application/json" \
      -d '{"name":"idp-b23-smoke","role":"admin"}' 2>/dev/null || true)"
    ONYX_TOKEN="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("api_key") or "")' <<<"${key_json}" 2>/dev/null || true)"

    # Discover ingest paths from live OpenAPI (server root may be / or /api).
    mapfile -t ONYX_INGEST_PATHS < <(python3 - "${ONYX_BASE}" <<'PY' || true
import json, sys, urllib.request
base = sys.argv[1].rstrip("/")
paths = [
    "/onyx-api/ingestion",
    "/onyx-api/ingestion/",
    "/api/onyx-api/ingestion",
    "/api/onyx-api/ingestion/",
    "/api/ingestion",
    "/ingestion",
]
for suffix in ("/openapi.json", "/api/openapi.json"):
    try:
        with urllib.request.urlopen(base + suffix, timeout=10) as r:
            spec = json.load(r)
        for p in spec.get("paths", {}):
            if "ingestion" in p and "document_id" not in p:
                if p not in paths:
                    paths.insert(0, p if p.startswith("/") else "/" + p)
                # also try with /api prefix when openapi is rooted at /api
                if not p.startswith("/api/") and ("/api" + p) not in paths:
                    paths.insert(0, "/api" + p)
        break
    except Exception:
        pass
print("\n".join(paths))
PY
)
    upsert_ok=0
    auth_mode=""
    last_probe=""
    for path in "${ONYX_INGEST_PATHS[@]}"; do
      [[ -n "${path}" ]] || continue
      if [[ -n "${ONYX_TOKEN}" ]]; then
        code="$(curl -sS -o "${WORK}/onyx-ingest.json" -w '%{http_code}' \
          -X POST "${ONYX_BASE}${path}" \
          -H "Authorization: Bearer ${ONYX_TOKEN}" \
          -H "Content-Type: application/json" \
          -d "${ingest_body}" || true)"
        last_probe="bearer ${path}->${code}"
        if [[ "${code}" == "200" || "${code}" == "201" ]]; then
          upsert_ok=1
          auth_mode="api-key ${path} HTTP ${code}"
          break
        fi
      fi
      code="$(curl -sS -o "${WORK}/onyx-ingest.json" -w '%{http_code}' \
        -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
        -X POST "${ONYX_BASE}${path}" \
        -H "Content-Type: application/json" \
        -d "${ingest_body}" || true)"
      last_probe="cookie ${path}->${code}"
      if [[ "${code}" == "200" || "${code}" == "201" ]]; then
        upsert_ok=1
        auth_mode="session-cookie ${path} HTTP ${code}"
        break
      fi
    done
    if [[ "${upsert_ok}" == "1" ]]; then
      record OK stage_onyx "compose upsert_ingestion_doc via ${auth_mode} (reg=${reg_code} login=${login_code})"
    else
      # Save openapi path list for debugging
      printf '%s\n' "${ONYX_INGEST_PATHS[@]}" >"${WORK}/onyx-ingest-paths.txt"
      curl -sS -o "${WORK}/onyx-openapi-head.json" \
        "${ONYX_BASE}/openapi.json" 2>/dev/null \
        || curl -sS -o "${WORK}/onyx-openapi-head.json" \
          "${ONYX_BASE}/api/openapi.json" 2>/dev/null || true
      record FAIL stage_onyx "reg=${reg_code} login=${login_code} last=${last_probe} upsert=$(head -c 200 "${WORK}/onyx-ingest.json" 2>/dev/null || true)"
    fi
  fi
else
  code="$(curl -sS -o "${WORK}/onyx.json" -w '%{http_code}' \
    -X POST "${ONYX_BASE%/}/search/send-search-message" \
    -H "Authorization: Bearer ${ONYX_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"search_query":"clawql idp smoke","num_hits":1,"include_content":true}' || true)"
  if [[ "${code}" == "200" ]]; then
    record OK stage_onyx "external search HTTP 200"
  else
    record FAIL stage_onyx "external HTTP ${code}"
  fi
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

# --- Stage 9: coneshare (compose dataroom + share link, or external secrets) ---
CS_BASE="${CONESHARE_BASE_URL:-}"
CS_TOKEN="${CONESHARE_API_TOKEN:-}"
if [[ -z "${CS_BASE}" || -z "${CS_TOKEN}" ]]; then
  echo "== Start ConeShare (open-source compose) =="
  docker compose -f "${COMPOSE_FILE}" up -d \
    coneshare-postgres coneshare-redis coneshare-web coneshare-celery
  cs_ok=0
  for _ in $(seq 1 120); do
    ch="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' clawql-idp-coneshare-web 2>/dev/null || echo missing)"
    if [[ "${ch}" == "healthy" ]]; then
      cs_ok=1
      break
    fi
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:8999/api/v1/_health/" 2>/dev/null || true)"
    if [[ "${code}" == "200" ]]; then
      cs_ok=1
      break
    fi
    sleep 3
  done
  if [[ "${cs_ok}" != "1" ]]; then
    dump_compose_diag
    record FAIL stage_coneshare "coneshare-web never healthy"
  else
    CS_BASE="http://127.0.0.1:8999"
    # Apply migrations then create smoke admin (idempotent).
    docker exec clawql-idp-coneshare-web \
      python3 manage.py migrate --noinput >/dev/null 2>&1 || true
    docker exec \
      -e DJANGO_SUPERUSER_USERNAME=admin \
      -e DJANGO_SUPERUSER_PASSWORD=adminadmin1 \
      -e DJANGO_SUPERUSER_EMAIL=admin@example.com \
      clawql-idp-coneshare-web \
      python3 manage.py createsuperuser --noinput >/dev/null 2>&1 || true
    # Upstream JWT obtain uses email (SimpleJWT / custom serializer), not username.
    token_json="$(curl -sS -X POST "${CS_BASE}/api/v1/token/" \
      -H "Content-Type: application/json" \
      -d '{"email":"admin@example.com","password":"adminadmin1"}' || true)"
    CS_TOKEN="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("access") or d.get("token") or "")' <<<"${token_json}" 2>/dev/null || true)"
    if [[ -z "${CS_TOKEN}" ]]; then
      # Fallback: some builds accept username or email+username together.
      token_json="$(curl -sS -X POST "${CS_BASE}/api/v1/token/" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","email":"admin@example.com","password":"adminadmin1"}' || true)"
      CS_TOKEN="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("access") or d.get("token") or "")' <<<"${token_json}" 2>/dev/null || true)"
    fi
    if [[ -z "${CS_TOKEN}" ]]; then
      # Capture non-HTML error detail for artifacts
      printf '%s' "${token_json}" >"${WORK}/coneshare-token-error.txt"
      record FAIL stage_coneshare "token create failed: $(python3 -c 'import sys; t=sys.stdin.read(); print(t[:240].replace(chr(10)," "))' <<<"${token_json}")"
    else
      # Upstream serializer requires `name` (title alone → 400).
      dr_code="$(curl -sS -o "${WORK}/coneshare-dataroom.json" -w '%{http_code}' \
        -X POST "${CS_BASE}/api/v1/datarooms/" \
        -H "Authorization: Bearer ${CS_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"clawql-idp-b23-${CORR}\",\"title\":\"clawql-idp-b23-${CORR}\",\"description\":\"IDP B2.3 ordered smoke\"}" || true)"
      sl_code="$(curl -sS -o "${WORK}/coneshare-share.json" -w '%{http_code}' \
        -X POST "${CS_BASE}/api/v1/share-links/" \
        -H "Authorization: Bearer ${CS_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"clawql-idp-b23-${CORR}-share\",\"title\":\"clawql-idp-b23-${CORR}-share\"}" || true)"
      if [[ "${dr_code}" == "200" || "${dr_code}" == "201" ]]; then
        record OK stage_coneshare "dataroom HTTP ${dr_code}; share-link HTTP ${sl_code}"
      else
        record FAIL stage_coneshare "dataroom HTTP ${dr_code} body=$(head -c 200 "${WORK}/coneshare-dataroom.json" 2>/dev/null || true)"
      fi
    fi
  fi
else
  code="$(curl -sS -o "${WORK}/coneshare.json" -w '%{http_code}' \
    -X GET "${CS_BASE%/}/api/v1/_health/" \
    -H "Authorization: Bearer ${CS_TOKEN}" || true)"
  if [[ "${code}" == "200" || "${code}" == "401" || "${code}" == "403" ]]; then
    record OK stage_coneshare "external health HTTP ${code}"
  else
    record FAIL stage_coneshare "external HTTP ${code}"
  fi
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
    "compose_included": [
        "nextcloud",
        "tika",
        "gotenberg",
        "stirling",
        "paperless",
        "onyx",
        "coneshare",
    ],
    "external_or_optional": {
        "docling": "IDP_SMOKE_INCLUDE_DOCLING=1 or DOCLING_BASE_URL",
    },
}
Path(out_dir, "pipeline-smoke.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
print(json.dumps(out, indent=2))
raise SystemExit(0 if out["ok"] else 1)
PY
