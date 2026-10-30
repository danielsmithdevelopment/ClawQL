#!/usr/bin/env bash
# Offline smoke for Cost Plus Drugs × ClawQL governance demo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

export DEMO_DATA_DIR="${DEMO_DATA_DIR:-${ROOT}/.demo-data}"
rm -rf "${DEMO_DATA_DIR}"
mkdir -p "${DEMO_DATA_DIR}"

echo "== governance-demo (fixture prices) =="
node scripts/governance-demo.mjs

echo "== token compaction =="
CPD_OFFLINE=1 node scripts/token-compaction-demo.mjs

echo "== unit checks =="
node --test tests/governance-demo.test.mjs

if [[ "${CPD_LIVE_PRICE:-0}" == "1" ]]; then
  echo "== governance-demo (live public API) =="
  DEMO_DATA_DIR="${DEMO_DATA_DIR}/live" CPD_LIVE_PRICE=1 node scripts/governance-demo.mjs
  echo "== token compaction (live) =="
  node scripts/token-compaction-demo.mjs
fi

if [[ "${CPD_GATEWAY_SMOKE:-0}" == "1" ]]; then
  echo "== live ClawQL gateway smoke (needs npm run build) =="
  node scripts/gateway-smoke.mjs
fi

echo "OK: cost-plus-drugs-governance smoke passed"
