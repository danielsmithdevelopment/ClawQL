#!/usr/bin/env bash
# Bootstrap available peers against the Obsidian equal-arm vault and measure
# the 12-attack corpus. Then re-run the smoke board merging peer-results/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HARNESS="$ROOT/scripts/benchmarks/multi-attack-injection"
RESULTS_DIR="${MAI_PEER_RESULTS_DIR:-$ROOT/docs/benchmarks/security-suite/multi-attack-injection/peer-results}"
mkdir -p "$RESULTS_DIR"
export MAI_PEER_RESULTS_DIR="$RESULTS_DIR"

echo "== multi-attack peer measure (Obsidian Memory/ equal-arm) =="
echo "peer-results → $RESULTS_DIR"

echo ""
echo "---- Obot ----"
bash "$HARNESS/ci-obot-peer.sh" || echo "ci-obot-peer: non-zero (pending artifacts may still exist)"

echo ""
echo "---- Bifrost ----"
bash "$HARNESS/ci-bifrost-peer.sh"

echo ""
echo "---- Executor ----"
bash "$HARNESS/ci-executor-peer.sh"

echo ""
echo "== re-run smoke board merging peer-results =="
export MAI_OUT="${MAI_OUT:-$ROOT/docs/benchmarks/security-suite/multi-attack-injection/results-smoke.json}"
# Clear live peer URLs so board prefers on-disk peer-results (not stale env)
unset OBOT_MCP_URL OBOT_MCP_URL_DENY BIFROST_MCP_URL BIFROST_MCP_URL_DENY \
  EXECUTOR_MCP_URL EXECUTOR_MCP_URL_BLOCK MAI_SHARED_VAULT_ROOT GOV_SHARED_VAULT_ROOT \
  OBOT_MCP_TOKEN BIFROST_VK EXECUTOR_MCP_TOKEN EXECUTOR_API_KEY || true
export MAI_PEER_RESULTS_DIR="$RESULTS_DIR"
node "$HARNESS/run-board.mjs"

echo "done"
ls -la "$RESULTS_DIR"
