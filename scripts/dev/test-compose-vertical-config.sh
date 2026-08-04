#!/usr/bin/env bash
# Validate vertical Docker Compose stacks render ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)).
# Usage:
#   scripts/dev/test-compose-vertical-config.sh              # all verticals
#   scripts/dev/test-compose-vertical-config.sh lending healthcare
#
# Prefers `docker compose … config`. When Docker is unavailable (some CI/dev
# sandboxes), falls back to a static file check of compose + env templates.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

declare -A MCP_CONTAINER=(
  [lending]=clawql-lending-mcp
  [healthcare]=clawql-healthcare-mcp
  [legal]=clawql-legal-mcp
  [education]=clawql-education-mcp
)

VERTICALS=("$@")
if [[ ${#VERTICALS[@]} -eq 0 ]]; then
  VERTICALS=(lending healthcare legal education)
fi

export CLAWQL_LABEL_STUDIO_API_TOKEN=compose-config-test-token
export CLAWQL_HITL_WEBHOOK_TOKEN=compose-config-test-webhook

HAVE_DOCKER=0
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  HAVE_DOCKER=1
fi

for vertical in "${VERTICALS[@]}"; do
  ENV_FILE="${ROOT}/docker/compose/${vertical}.env.example"
  COMPOSE_FILE="${ROOT}/docker/compose/${vertical}.compose.yml"
  MCP="${MCP_CONTAINER[$vertical]:-}"
  if [[ -z "${MCP}" || ! -f "${ENV_FILE}" || ! -f "${COMPOSE_FILE}" ]]; then
    echo "ERROR: unknown or missing vertical ${vertical}"
    exit 1
  fi

  if [[ "${HAVE_DOCKER}" -eq 1 ]]; then
    OUT="$(mktemp)"
    trap 'rm -f "${OUT}"' RETURN
    docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" config >"${OUT}"
    python3 - "${OUT}" "${MCP}" "${vertical}" <<'PY'
import sys

text = open(sys.argv[1], encoding="utf-8").read()
mcp = sys.argv[2]
vertical = sys.argv[3]
required = [
    mcp,
    "docling:",
    "classifier:",
    "langextract:",
    "label-studio:",
    "CLAWQL_ENABLE_HITL_LABEL_STUDIO",
    "CLAWQL_ENABLE_ANYDOC",
    "DOCLING_BASE_URL",
    "CLASSIFIER_BASE_URL",
]
for needle in required:
    if needle not in text:
        print(f"ERROR: {vertical}.compose.yml config missing {needle!r}")
        sys.exit(1)
print(f"OK: {vertical}.compose.yml config valid (docker compose)")
PY
  else
    python3 - "${COMPOSE_FILE}" "${ENV_FILE}" "${MCP}" "${vertical}" <<'PY'
import sys
from pathlib import Path

compose = Path(sys.argv[1]).read_text(encoding="utf-8")
env = Path(sys.argv[2]).read_text(encoding="utf-8")
mcp = sys.argv[3]
vertical = sys.argv[4]
for needle in (
    f"container_name: {mcp}",
    "docling:",
    "classifier:",
    "langextract:",
    "label-studio:",
    "CLAWQL_ENABLE_HITL_LABEL_STUDIO",
    "CLAWQL_ENABLE_ANYDOC",
    "DOCLING_BASE_URL",
    "CLASSIFIER_BASE_URL",
    "../../deployment/samples/",
):
    if needle not in compose:
        print(f"ERROR: {vertical}.compose.yml missing {needle!r}")
        sys.exit(1)
for needle in ("CLAWQL_HOST_PORT=", "CLAWQL_HITL_WEBHOOK_TOKEN=", "CLAWQL_LABEL_STUDIO_API_TOKEN="):
    if needle not in env:
        print(f"ERROR: {vertical}.env.example missing {needle!r}")
        sys.exit(1)
print(f"OK: {vertical}.compose.yml static check valid (docker unavailable)")
PY
  fi
done
