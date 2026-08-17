#!/usr/bin/env bash
# Re-run firm-knowledge tasks that failed in v2 after DuckDB field wiring fixes.
set -euo pipefail

WT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOG="${LOG:-/tmp/harvey-lab-local-fail-v3.log}"
AGG="${AGG:-${WT}/integrations/harvey-labs/results/aggregate-fail-v3.json}"

export HARVEY_LABS="${HARVEY_LABS:-/tmp/harvey-labs-work2/harvey-labs}"
export CLAWQL_LAB_SKIP_CLONE=1
export CLAWQL_LAB_PODMAN_VIA_DOCKER=1
export LAB_ARMS=nemotron-clawql
export CLAWQL_LAB_IDP_SIDECARS=1
export CLAWQL_LAB_TIKA_URL="${CLAWQL_LAB_TIKA_URL:-http://127.0.0.1:9998}"
export CLAWQL_LAB_LANGEXTRACT_URL="${CLAWQL_LAB_LANGEXTRACT_URL:-http://127.0.0.1:8090}"
export LANGEXTRACT_BASE_URL="${LANGEXTRACT_BASE_URL:-http://127.0.0.1:8090}"
export CLAWQL_LAB_MCP_PORT="${CLAWQL_LAB_MCP_PORT:-8082}"

mkdir -p "$(dirname "$AGG")"
AGG="$AGG" python3 - <<'PY'
import json, os
from pathlib import Path
Path(os.environ["AGG"]).write_text(json.dumps({
  "run_id": "harvey-lab-local-fail-v3",
  "pipeline": "deal_value+hsr_date+proof+client fixes",
  "tasks": {},
  "summary": {"done": 0, "all_pass_count": 0, "perfect": False},
}, indent=2))
PY

{
  echo "BATCH V3 START $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for t in 001 004 005 009; do
    echo "======== TASK firm-knowledge/tasks/${t} ========"
    export LAB_TASK="firm-knowledge/tasks/${t}"
    export CLAWQL_LAB_RUN_ID="harvey-lab-fail-v3-${t}"
    set +e
    bash "${WT}/integrations/harvey-labs/scripts/run-lab-local.sh"
    ec=$?
    set -e
    echo "TASK firm-knowledge/tasks/${t} exit=${ec}"
    TASK="$t" EC="$ec" AGG="$AGG" python3 - <<'PY'
import json, os
from pathlib import Path
agg_path = Path(os.environ["AGG"])
agg = json.loads(agg_path.read_text())
t = os.environ["TASK"]
ec = int(os.environ["EC"])
task = f"firm-knowledge/tasks/{t}"
base = Path("/tmp/harvey-labs-work2/harvey-labs/results") / task
cands = sorted(
    base.glob("NVIDIA-Nemotron-3-5-Lightning-30B-A3B-4bit/*/scores.json"),
    key=lambda p: p.stat().st_mtime,
)
entry = {"exit": ec}
if cands:
    sc = json.loads(cands[-1].read_text())
    entry.update({
        "all_pass": 1.0 if sc.get("all_pass") else 0.0,
        "criterion_pass_rate": (sc.get("n_passed") or 0) / max(sc.get("n_criteria") or 1, 1),
        "n_passed": sc.get("n_passed"),
        "n_criteria": sc.get("n_criteria"),
        "run_id": sc.get("run_id"),
        "summary": sc.get("summary"),
    })
agg["tasks"][task] = entry
agg["summary"]["done"] = len(agg["tasks"])
agg["summary"]["all_pass_count"] = sum(
    1 for v in agg["tasks"].values() if v.get("all_pass") == 1.0
)
agg["summary"]["all_pass_rate"] = (
    agg["summary"]["all_pass_count"] / max(agg["summary"]["done"], 1)
)
agg["summary"]["perfect"] = (
    agg["summary"]["all_pass_count"] == agg["summary"]["done"]
    and agg["summary"]["done"] > 0
)
agg_path.write_text(json.dumps(agg, indent=2))
print(json.dumps(entry, indent=2))
PY
  done
  echo "BATCH V3 END $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat "$AGG"
} 2>&1 | tee "$LOG"
