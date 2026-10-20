#!/usr/bin/env bash
# Peer multi-attack rows: print pending status until MCP URLs are wired.
# Injection is measurable for every gateway — pending ≠ not_offered.
set -euo pipefail

PEER="${1:-}"
COLUMN="${2:-defaults}"
if [[ -z "$PEER" ]]; then
  echo "usage: $0 <obot|bifrost|executor> [defaults|best_config]" >&2
  exit 2
fi

case "$PEER/$COLUMN" in
  obot/defaults) ENV_KEY=OBOT_MCP_URL ;;
  obot/best_config) ENV_KEY=OBOT_MCP_URL_DENY ;;
  bifrost/defaults) ENV_KEY=BIFROST_MCP_URL ;;
  bifrost/best_config) ENV_KEY=BIFROST_MCP_URL_DENY ;;
  executor/defaults) ENV_KEY=EXECUTOR_MCP_URL ;;
  executor/best_config) ENV_KEY=EXECUTOR_MCP_URL_BLOCK ;;
  *) echo "unknown peer/column: $PEER $COLUMN" >&2; exit 2 ;;
esac

if [[ -z "${!ENV_KEY:-}" ]]; then
  echo "{\"peer\":\"$PEER\",\"column\":\"$COLUMN\",\"status\":\"pending\",\"skipUnlessEnv\":\"$ENV_KEY\",\"note\":\"Injection resistance is measurable — wire $ENV_KEY against the 12-attack corpus. pending ≠ not_offered.\"}"
  exit 0
fi

echo "ci-peer-pending: $ENV_KEY is set but equal-arm peer runner is not implemented yet — treat as pending until run-peer.mjs lands" >&2
exit 3
