#!/usr/bin/env bash
# Dedicated Virtual Gateway alpha boot:
#   1) pull + verify team vault (fail closed)
#   2) start Managed Edge Gateway (/mcp + /v1) on CLAWQL_GATEWAY_PORT
#
# Credentials must be in env (or loaded by caller / SSM) — never baked into the image.
# Requires clawql-mcp with `clawql gateway` (Managed Edge Gateway CLI).
set -euo pipefail

CLAWQL_HOME="${CLAWQL_HOME:-${HOME}/.ClawQL}"
export CLAWQL_HOME

VAULT_BOOTSTRAP="${CLAWQL_TEAM_VAULT_BOOTSTRAP:-/usr/local/bin/bootstrap-team-vault.sh}"
if [ ! -x "${VAULT_BOOTSTRAP}" ]; then
  # Repo / CI fallback
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  VAULT_BOOTSTRAP="${SCRIPT_DIR}/bootstrap-team-vault.sh"
fi

if [ ! -x "${VAULT_BOOTSTRAP}" ]; then
  echo "[bootstrap-dedicated-gateway] bootstrap-team-vault.sh not found" >&2
  exit 1
fi

echo "[bootstrap-dedicated-gateway] Seeding team vault…"
"${VAULT_BOOTSTRAP}"

if ! command -v clawql >/dev/null 2>&1; then
  echo "[bootstrap-dedicated-gateway] clawql CLI missing" >&2
  exit 1
fi

if ! clawql gateway --help >/dev/null 2>&1 && ! clawql help gateway >/dev/null 2>&1; then
  # Prefer a soft check: `gateway create` will hard-fail with a clear message if missing.
  :
fi

export CLAWQL_GATEWAY_HOST="${CLAWQL_GATEWAY_HOST:-0.0.0.0}"
export CLAWQL_DEDICATED_VG="${CLAWQL_DEDICATED_VG:-1}"
TEAM="${CLAWQL_GATEWAY_TEAM:-${CLAWQL_TENANT_ID:-default}}"
PORT="${CLAWQL_GATEWAY_PORT:-8080}"

echo "[bootstrap-dedicated-gateway] Starting Managed Edge Gateway (team=${TEAM}, port=${PORT}, host=${CLAWQL_GATEWAY_HOST})"
clawql gateway create --profile process --team "${TEAM}" --port "${PORT}" --yes --home "${CLAWQL_HOME}"

echo "[bootstrap-dedicated-gateway] Dedicated VG alpha ready — /mcp + /v1 on :${PORT}"
