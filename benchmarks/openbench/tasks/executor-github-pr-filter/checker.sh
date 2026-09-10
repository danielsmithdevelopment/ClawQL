#!/usr/bin/env bash
# Validates executor-cmp-001 JSON report when present (offline harness gate).
set -euo pipefail

REPORT=""
if [ -f "executor-cmp-001.json" ]; then
  REPORT="executor-cmp-001.json"
elif [ -n "${EXECUTOR_CMP_REPORT:-}" ] && [ -f "${EXECUTOR_CMP_REPORT}" ]; then
  REPORT="${EXECUTOR_CMP_REPORT}"
fi

if [ -z "$REPORT" ] || [ ! -f "$REPORT" ]; then
  echo "FAIL: missing executor-cmp-001.json in workspace — run: npm run benchmark:executor-comparison" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 - <<'PY' "$REPORT"
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text(encoding="utf-8"))
required = ["layer1", "layer2", "task", "matchedConditions"]
for key in required:
    if key not in data:
        print(f"FAIL: report missing {key!r}", flush=True)
        raise SystemExit(1)

l1 = data["layer1"]
l2 = data["layer2"]
if l1.get("split") != "tool_defs" or l2.get("split") != "tool_result":
    print("FAIL: layer split fields must be tool_defs / tool_result", flush=True)
    raise SystemExit(1)

codemode = l1.get("clawqlMeasured", {}).get("gatewayCodemodeOnly", {}).get("codemodeOnlyTokens")
exec_pub = l1.get("executorPublished", {}).get("codemodeToolDefsTokens")
if not isinstance(codemode, int) or codemode <= 0:
    print("FAIL: invalid clawql codemode token count", flush=True)
    raise SystemExit(1)
if not isinstance(exec_pub, int) or exec_pub <= 0:
    print("FAIL: invalid executor published reference", flush=True)
    raise SystemExit(1)

raw = l2.get("executor", {}).get("toolResultTokens")
proj = l2.get("clawql", {}).get("toolResultTokens")
if not isinstance(raw, int) or not isinstance(proj, int) or proj <= 0:
    print("FAIL: invalid layer2 token counts", flush=True)
    raise SystemExit(1)
if raw <= proj:
    print(
        f"FAIL: expected raw tool result > projected (got raw={raw} projected={proj})",
        flush=True,
    )
    raise SystemExit(1)

print(
    f"PASS: layer1 clawql codemode={codemode} vs executor pub={exec_pub}; "
    f"layer2 raw={raw} vs projected={proj}",
    flush=True)
PY
then
  echo "SCORE: 1.0"
  exit 0
fi

echo "SCORE: 0.0"
exit 1
