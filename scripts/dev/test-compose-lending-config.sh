#!/usr/bin/env bash
# Validate lending vertical Compose renders ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

ENV_FILE="${ROOT}/docker/compose/lending.env.example"
COMPOSE_FILE="${ROOT}/docker/compose/lending.compose.yml"
OUT="$(mktemp)"
trap 'rm -f "${OUT}"' EXIT

export CLAWQL_LABEL_STUDIO_API_TOKEN=compose-config-test-token
export CLAWQL_HITL_WEBHOOK_TOKEN=compose-config-test-webhook

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" config >"${OUT}"

python3 - "${OUT}" <<'PY'
import sys

text = open(sys.argv[1], encoding="utf-8").read()
required = [
    "clawql-lending-mcp",
    "docling:",
    "classifier:",
    "langextract:",
    "label-studio:",
    "CLAWQL_ENABLE_HITL_LABEL_STUDIO",
    "DOCLING_BASE_URL",
    "CLASSIFIER_BASE_URL",
]
for needle in required:
    if needle not in text:
        print(f"ERROR: docker compose config missing {needle!r}")
        sys.exit(1)
print("OK: lending.compose.yml config valid")
PY
