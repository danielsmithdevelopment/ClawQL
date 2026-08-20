#!/usr/bin/env bash
# Preflight for ts-clawql-data-v2 task-001 smoke (homelab).
# Does not start models — only verifies build + script paths + optional services.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fail=0

ok() { echo "OK  $*"; }
bad() { echo "FAIL $*" >&2; fail=1; }

echo "== ts-clawql-data-v2 preflight =="

if [[ -f "${ROOT}/dist/server-http.js" ]]; then
  ok "dist/server-http.js present"
else
  bad "dist/server-http.js missing — run: npm run build"
fi

if [[ -f "${ROOT}/packages/clawql-data/dist/index.js" ]] || [[ -f "${ROOT}/packages/clawql-data/dist/index.cjs" ]]; then
  ok "packages/clawql-data/dist present"
else
  bad "packages/clawql-data/dist missing — run: npm run build"
fi

for s in lab-pre-ingest.mjs lab-mcp-proxy.mjs lab-mcp-client.mjs lab-vault-seed.mjs; do
  p="${ROOT}/integrations/harvey-labs/scripts/${s}"
  if [[ -f "$p" ]]; then
    node --check "$p" && ok "${s} syntax"
  else
    bad "missing ${s}"
  fi
done

STACK="$(node "${ROOT}/integrations/harvey-labs/scripts/lab-stack-version.mjs" | python3 -c 'import json,sys; print(json.load(sys.stdin)["stack_version"])')"
if [[ "$STACK" == "ts-clawql-data-v2" ]]; then
  ok "stack_version=${STACK}"
else
  bad "unexpected stack_version=${STACK}"
fi

HARVEY="${HARVEY_LABS:-/tmp/harvey-labs-work2/harvey-labs}"
if [[ -f "${HARVEY}/pyproject.toml" ]] || [[ -d "${HARVEY}/.git" ]]; then
  ok "harvey-labs at ${HARVEY}"
  if [[ -d "${HARVEY}/tasks/firm-knowledge/dms/matters" ]] || [[ -d "${HARVEY}/tasks/firm-knowledge/tasks/001" ]]; then
    ok "firm-knowledge tasks present"
  else
    bad "firm-knowledge DMS/tasks not found under ${HARVEY}"
  fi
else
  bad "harvey-labs missing at ${HARVEY} (set HARVEY_LABS=...)"
fi

check_url() {
  local name="$1" url="$2"
  if curl -fsS -m 3 "$url" >/dev/null 2>&1; then
    ok "${name} reachable (${url})"
  else
    echo "WARN ${name} not reachable (${url}) — start before smoke"
  fi
}

check_url "MLX / agent upstream" "http://127.0.0.1:8081/v1/models"
check_url "clawql-inference" "http://127.0.0.1:8091/v1/models"
check_url "Ollama" "http://127.0.0.1:11434/api/tags"

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "Preflight failed. Fix FAILs before run-lab-local.sh." >&2
  exit 1
fi

echo ""
echo "Preflight passed (services may still need starting — see WARNs)."
echo "Next: see docs/benchmarks/harvey-lab-ts-v2-smoke-gate.md (Mac mini MLX paste guide)"
echo "Then: LAB_TASK=firm-knowledge/tasks/001 LAB_ARMS=nemotron-clawql bash integrations/harvey-labs/scripts/run-lab-local.sh"
