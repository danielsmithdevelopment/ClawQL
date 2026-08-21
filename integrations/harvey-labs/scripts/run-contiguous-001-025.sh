#!/usr/bin/env bash
# Contiguous firm-knowledge 001–025 on ts-clawql-data-v2 (Node pre-ingest + MCP data_query).
set -euo pipefail

WT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
STACK_VERSION="$(node "${WT}/integrations/harvey-labs/scripts/lab-stack-version.mjs" | python3 -c 'import json,sys; print(json.load(sys.stdin)["stack_version"])')"
LOG="${LOG:-/tmp/harvey-lab-contiguous-001-025-${STACK_VERSION}.log}"
AGG="${AGG:-${WT}/integrations/harvey-labs/results/ts-v2/aggregate-contiguous-001-025.json}"
VAULT_ROOT="${CLAWQL_LAB_VAULT_ROOT:-${CLAWQL_HOME:-$HOME/.ClawQL}/HarveyLABVault}"

export HARVEY_LABS="${HARVEY_LABS:-/tmp/harvey-labs-work2/harvey-labs}"
export CLAWQL_LAB_SKIP_CLONE=1
export CLAWQL_LAB_PODMAN_VIA_DOCKER="${CLAWQL_LAB_PODMAN_VIA_DOCKER:-1}"
export LAB_ARMS=nemotron-clawql
export CLAWQL_LAB_IDP_SIDECARS=1
export CLAWQL_LAB_TIKA_URL="${CLAWQL_LAB_TIKA_URL:-http://127.0.0.1:9998}"
export CLAWQL_LAB_LANGEXTRACT_URL="${CLAWQL_LAB_LANGEXTRACT_URL:-http://127.0.0.1:8090}"
export LANGEXTRACT_BASE_URL="${LANGEXTRACT_BASE_URL:-http://127.0.0.1:8090}"
export CLAWQL_LAB_MCP_PORT="${CLAWQL_LAB_MCP_PORT:-8082}"
export CLAWQL_LAB_STACK_VERSION="${STACK_VERSION}"
export CLAWQL_LAB_PREINGEST_SCRIPT="${WT}/integrations/harvey-labs/scripts/lab-pre-ingest.mjs"
export CLAWQL_LAB_MCP_PROXY="${WT}/integrations/harvey-labs/scripts/lab-mcp-proxy.mjs"
export CLAWQL_ENABLE_DATA="${CLAWQL_ENABLE_DATA:-1}"
export PYTHONUNBUFFERED=1

mkdir -p "$(dirname "$AGG")"
AGG="$AGG" STACK_VERSION="$STACK_VERSION" python3 - <<'PY'
import json, os
from pathlib import Path
Path(os.environ["AGG"]).write_text(json.dumps({
  "run_id": f"harvey-lab-contiguous-001-025-{os.environ['STACK_VERSION']}",
  "stack_version": os.environ["STACK_VERSION"],
  "pipeline": "ts-clawql-data-v2 contiguous 001-025",
  "arms": "nemotron-clawql",
  "agent_model": "openai/mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit",
  "judge_model": "ollama/qwen3.6:35b",
  "tasks": {},
  "summary": {"done": 0, "all_pass_count": 0, "perfect_001_010": False, "perfect_001_025": False},
}, indent=2))
PY

python3 "${WT}/integrations/harvey-labs/scripts/apply_clawql_adapter.py" \
  --harvey-labs "${HARVEY_LABS}" \
  --openrouter-hooks || true

for i in $(seq 1 25); do
  t=$(printf '%03d' "$i")
  vault="${VAULT_ROOT}/firm-knowledge__tasks__${t}"
  if [[ -d "$vault" ]]; then
    find "$vault" -name '.clawql-lab-ingest-complete' -delete 2>/dev/null || true
    rm -f "$vault/lab/matters.duckdb" 2>/dev/null || true
  fi
done

{
  echo "CONTIGUOUS 001-025 START stack=${STACK_VERSION} $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for i in $(seq 1 25); do
    t=$(printf '%03d' "$i")
    echo "======== TASK firm-knowledge/tasks/${t} $(date -u +%Y-%m-%dT%H:%M:%SZ) ========"
    export LAB_TASK="firm-knowledge/tasks/${t}"
    export CLAWQL_LAB_RUN_ID="harvey-lab-contiguous-001-025-${STACK_VERSION}-${t}"
    set +e
    bash "${WT}/integrations/harvey-labs/scripts/run-lab-local.sh"
    ec=$?
    set -e
    echo "TASK firm-knowledge/tasks/${t} exit=${ec} $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    TASK="$t" EC="$ec" AGG="$AGG" LOG="$LOG" STACK_VERSION="$STACK_VERSION" python3 - <<'PY'
import json, os, re
from pathlib import Path
agg_path = Path(os.environ["AGG"])
agg = json.loads(agg_path.read_text())
t = os.environ["TASK"]
ec = int(os.environ["EC"])
task = f"firm-knowledge/tasks/{t}"
base = Path(os.environ.get("HARVEY_LABS", "/tmp/harvey-labs-work2/harvey-labs")) / "results" / task
cands = sorted(
    base.glob("NVIDIA-Nemotron-3-5-Lightning-30B-A3B-4bit/*/scores.json"),
    key=lambda p: p.stat().st_mtime,
)
entry = {"exit": ec, "stack_version": os.environ["STACK_VERSION"]}
if cands:
    sc = json.loads(cands[-1].read_text())
    entry.update({
        "all_pass": 1.0 if sc.get("all_pass") else 0.0,
        "criterion_pass_rate": (sc.get("n_passed") or 0) / max(sc.get("n_criteria") or 1, 1),
        "n_passed": sc.get("n_passed"),
        "n_criteria": sc.get("n_criteria"),
        "run_id": sc.get("run_id"),
        "summary": sc.get("summary"),
        "wall_clock_seconds": (sc.get("cost") or {}).get("wall_clock_seconds"),
    })
log = Path(os.environ["LOG"])
if log.exists():
    lines = log.read_text(errors="ignore").splitlines()
    node = [ln for ln in lines if "ClawQL pre-ingest: Node DuckDB" in ln and f"tasks/{t}" in ln]
    if not node:
        node = [ln for ln in lines if "ClawQL pre-ingest: Node DuckDB" in ln]
    if node:
        entry["pre_ingest"] = node[-1]
        m = re.search(r"matters=(\d+)", node[-1])
        if m:
            entry["matter_count"] = int(m.group(1))
        m = re.search(r"open_facts=(\d+)", node[-1])
        if m:
            entry["open_facts"] = int(m.group(1))
agg["tasks"][task] = entry
done = len(agg["tasks"])
ap = sum(1 for v in agg["tasks"].values() if v.get("all_pass") == 1.0)
agg["summary"] = {
    "done": done,
    "all_pass_count": ap,
    "all_pass_rate": ap / max(done, 1),
    "perfect_001_010": all(
        agg["tasks"].get(f"firm-knowledge/tasks/{x}", {}).get("all_pass") == 1.0
        for x in [f"{i:03d}" for i in range(1, 11)]
    ) and all(f"firm-knowledge/tasks/{i:03d}" in agg["tasks"] for i in range(1, 11)),
    "perfect_001_025": ap == 25 and done == 25,
    "failed": [
        k for k, v in sorted(agg["tasks"].items())
        if v.get("all_pass") != 1.0
    ],
}
agg_path.write_text(json.dumps(agg, indent=2))
print(json.dumps({"task": task, **entry}, indent=2)[:1200])
PY
  done
  echo "CONTIGUOUS 001-025 END stack=${STACK_VERSION} $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat "$AGG"
} 2>&1 | tee "$LOG"
