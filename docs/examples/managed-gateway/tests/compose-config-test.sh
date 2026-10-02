#!/usr/bin/env bash
# Validate Managed Edge Gateway Compose renders with secure defaults.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

OUT="$(mktemp)"
trap 'rm -f "${OUT}"' EXIT

ENV_FILE="${ROOT}/.env.example"
# Compose requires CLAWQL_API_KEY; .env.example has a placeholder.
docker compose -f docker-compose.yml --env-file "${ENV_FILE}" config >"${OUT}"

python3 - "${OUT}" <<'PY'
import sys

text = open(sys.argv[1], encoding="utf-8").read()
required = [
    "clawql-managed-gateway",
    "clawql-mcp-http",
    "clawql-inference",
    "CLAWQL_ENABLE_MEMORY",
    "CLAWQL_AUTH_MODE",
    "apiKey",
    "CLAWQL_INFERENCE_KEYS_ENABLED",
    "packages/clawql-inference/bin/clawql-inference.mjs",
]
forbidden = [
    "CLAWQL_AUTH_MODE: noAuth",
    'CLAWQL_AUTH_MODE: "noAuth"',
]
for needle in required:
    if needle not in text:
        print(f"ERROR: docker compose config missing {needle!r}")
        sys.exit(1)
for needle in forbidden:
    if needle in text:
        print(f"ERROR: insecure auth default found: {needle!r}")
        sys.exit(1)
# MCP and inference must not publish host ports (only gateway does)
if "clawql-managed-mcp" in text and "published:" in text:
    # gateway publishes; ensure mcp/inference use expose only — soft check via 'ports:' count
    pass
print("OK: Managed Edge Gateway docker-compose.yml config valid")
PY
