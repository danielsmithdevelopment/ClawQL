#!/usr/bin/env bash
# Harvey LAB ts-v2 smoke — task firm-knowledge/tasks/001, arm nemotron-clawql.
# Final working config:
#   - Tika: native arm64 JVM up on :9998 (started separately, stable)
#   - MCP auth: server loads ClawQL/.env (CLAWQL_AUTH_MODE=*** + CLAWQL_API_KEY).
#     Pre-ingest client reads CLAWQL_API_KEY from env -> sends x-api-key -> 401 clears.
#   - We source .env in bash ONLY so the client sees the key; no key ever leaves the process.
set -uo pipefail

# Pull the key into the process env via bash (NOT zsh, so no dotenv prompt).
set -a
# shellcheck disable=SC1091
source /Users/danielsmith/ClawQL/.env 2>/dev/null || true
set +a

# Sanity: did we actually get the key?
if [[ -z "${CLAWQL_API_KEY:-}" ]]; then
  echo "FATAL: CLAWQL_API_KEY not present after sourcing .env (is it commented out?)"
  exit 3
fi
echo "KEY_PRESENT=yes AUTH_MODE=${CLAWQL_AUTH_MODE:-unset}"

# Runtime env for the runner.
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
export CLAWQL_LAB_SKIP_CLONE=1
export CLAWQL_LAB_PODMAN_VIA_DOCKER=1
export HARVEY_LABS=/tmp/harvey-labs-work3/harvey-labs
export LAB_TASK=firm-knowledge/tasks/001
export LAB_RUN_ID=ts-v2-smoke-001-20261114
export LAB_ARMS=nemotron-clawql
export CLAWQL_LAB_STACK_VERSION=ts-clawql-data-v2

cd /Users/danielsmith/ClawQL
exec bash benchmarks/harvey-labs/scripts/run-lab-local.sh 2>&1 | tee ~/HarveyLAB-smoke-001-final5.log
