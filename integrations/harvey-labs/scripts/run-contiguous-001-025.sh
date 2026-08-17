#!/usr/bin/env bash
# Contiguous firm-knowledge 001–025 confirmation + first look at 011–025.
# Uses known-good sequential run-lab-local.sh (no fictional --task-range flag).
set -euo pipefail

WT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOG="${LOG:-/tmp/harvey-lab-contiguous-001-025.log}"
AGG="${AGG:-${WT}/integrations/harvey-labs/results/aggregate-contiguous-001-025.json}"

export HARVEY_LABS="${HARVEY_LABS:-/tmp/harvey-labs-work2/harvey-labs}"
export CLAWQL_LAB_SKIP_CLONE=1
export CLAWQL_LAB_PODMAN_VIA_DOCKER=1
export LAB_ARMS=nemotron-clawql
export CLAWQL_LAB_IDP_SIDECARS=1
export CLAWQL_LAB_TIKA_URL="${CLAWQL_LAB_TIKA_URL:-http://127.0.0.1:9998}"
export CLAWQL_LAB_LANGEXTRACT_URL="${CLAWQL_LAB_LANGEXTRACT_URL:-http://127.0.0.1:8090}"
export LANGEXTRACT_BASE_URL="${LANGEXTRACT_BASE_URL:-http://127.0.0.1:8090}"
export CLAWQL_LAB_MCP_PORT="${CLAWQL_LAB_MCP_PORT:-8082}"
export PYTHONUNBUFFERED=1

mkdir -p "$(dirname "$AGG")"
AGG="$AGG" python3 - <<'PY'
import json, os
from pathlib import Path
Path(os.environ["AGG"]).write_text(json.dumps({
  "run_id": "harvey-lab-contiguous-001-025",
  "pipeline": "final overlay contiguous 001-025",
  "arms": "nemotron-clawql",
  "agent_model": "openai/mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit",
  "judge_model": "ollama/qwen3.6:35b",
  "tasks": {},
  "summary": {"done": 0, "all_pass_count": 0, "perfect_001_010": False, "perfect_001_025": False},
}, indent=2))
PY

python3 "${WT}/integrations/harvey-labs/scripts/apply_clawql_adapter.py" \
  --harvey-labs "${HARVEY_LABS}" || true

# Fresh DuckDB/ingest for each task under final detectors.
for i in $(seq 1 25); do
  t=$(printf '%03d' "$i")
  vault="/Users/danielsmith/.ClawQL/HarveyLABVault/firm-knowledge__tasks__${t}"
  if [[ -d "$vault" ]]; then
    find "$vault" -name '.clawql-lab-ingest-complete' -delete 2>/dev/null || true
    rm -f "$vault/lab/matters.duckdb" 2>/dev/null || true
  fi
done

{
  echo "CONTIGUOUS 001-025 START $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "ETA ~3-6h wall (001-010 alone ~1.5-2.5h historically)"
  for i in $(seq 1 25); do
    t=$(printf '%03d' "$i")
    echo "======== TASK firm-knowledge/tasks/${t} $(date -u +%Y-%m-%dT%H:%M:%SZ) ========"
    export LAB_TASK="firm-knowledge/tasks/${t}"
    export CLAWQL_LAB_RUN_ID="harvey-lab-contiguous-001-025-${t}"
    set +e
    bash "${WT}/integrations/harvey-labs/scripts/run-lab-local.sh"
    ec=$?
    set -e
    echo "TASK firm-knowledge/tasks/${t} exit=${ec} $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    TASK="$t" EC="$ec" AGG="$AGG" LOG="$LOG" python3 - <<'PY'
import json, os, re
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
        "wall_clock_seconds": (sc.get("cost") or {}).get("wall_clock_seconds"),
    })
log = Path(os.environ["LOG"])
if log.exists():
    lines = log.read_text(errors="ignore").splitlines()
    duck = [ln for ln in lines if f"firm-knowledge__tasks__{t}" in ln and "DuckDB" in ln]
    if duck:
        entry["pre_ingest"] = duck[-1]
        m = re.search(r"maintenance_fc true=(\d+) null=(\d+)", duck[-1])
        if m:
            entry["maintenance_fc_true"] = int(m.group(1))
            entry["maintenance_fc_null"] = int(m.group(2))
        m = re.search(r"hsr_sr_dated=(\d+)", duck[-1])
        if m:
            entry["hsr_sr_dated"] = int(m.group(1))
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
  echo "CONTIGUOUS 001-025 END $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat "$AGG"
} 2>&1 | tee "$LOG"
