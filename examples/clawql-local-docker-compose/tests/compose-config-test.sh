#!/usr/bin/env bash
# Validate Tier 1 Compose renders ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

OUT="$(mktemp)"
trap 'rm -f "${OUT}"' EXIT

export POSTGRES_PASSWORD=compose-config-test
export PAPERLESS_SECRET_KEY=compose-config-test-secret
export PAPERLESS_ADMIN_PASSWORD=compose-config-test-admin

ENV_FILE="${ROOT}/.env.example"
docker compose -f docker-compose.yml --env-file "${ENV_FILE}" config >"${OUT}"

python3 - "${OUT}" <<'PY'
import sys

text = open(sys.argv[1], encoding="utf-8").read()
required = [
    "clawql-mcp-http",
    "apache/tika",
    "gotenberg/gotenberg",
    "paperless-ngx",
    "redis:",
    "postgres:",
    "TIKA_BASE_URL",
    "GOTENBERG_BASE_URL",
    "PAPERLESS_BASE_URL",
    "CLAWQL_ENABLE_PAGEINDEX",
]
for needle in required:
    if needle not in text:
        print(f"ERROR: docker compose config missing {needle!r}")
        sys.exit(1)
print("OK: Tier 1 docker-compose.yml config valid")
PY

docker compose -f docker-compose.yml -f docker-compose.presidio.override.yml --env-file "${ENV_FILE}" config >"${OUT}"

python3 - "${OUT}" <<'PY'
import sys

text = open(sys.argv[1], encoding="utf-8").read()
required = [
    "presidio-analyzer",
    "presidio-anonymizer",
    "CLAWQL_ENABLE_PRESIDIO",
]
for needle in required:
    if needle not in text:
        print(f"ERROR: presidio override config missing {needle!r}")
        sys.exit(1)
print("OK: Presidio override config valid")
PY
