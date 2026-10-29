#!/usr/bin/env bash
# Run Infinity agent_scale slope CSV (+ optional 8G cgroup ramp).
# publishable:false — cloud-agent KVM harness debugging only.
#
# Cgroup note: the process must be *born* inside the memory cgroup (charges do
# not reliably migrate for pages allocated before the move).
# Swap: always set memory.swap.max=0 so memory.max is a hard RAM ceiling.
set -euo pipefail

INFINITY_ROOT="${INFINITY_ROOT:-/workspace/.tools/infinity}"
OUT_DIR="${OUT_DIR:-/workspace/docs/benchmarks/program-density/infinity-on-pi}"
AGENTS="${AGENTS:-20000}"
TURNS="${TURNS:-20}"
WAVE="${WAVE:-2000}"
REP="${REP:-1}"
CGROUP_8G="${CGROUP_8G:-/sys/fs/cgroup/system.slice/pod-mhqbokhclzf6nm5eskz7yy4chu-3054d5f8/cursor-agent/bench8g}"
WORKLOAD_CG="${WORKLOAD_CG:-/sys/fs/cgroup/system.slice/pod-mhqbokhclzf6nm5eskz7yy4chu-3054d5f8/cursor-agent/workload}"
RUN_8G="${RUN_8G:-0}"
MEMORY_MAX_BYTES="${MEMORY_MAX_BYTES:-8589934592}"

BIN="$INFINITY_ROOT/target/release/examples/agent_scale"
if [[ ! -x "$BIN" ]]; then
  echo "building agent_scale..."
  (cd "$INFINITY_ROOT" && cargo build --release -p infinity-agent-core --example agent_scale)
fi

mkdir -p "$OUT_DIR" /opt/cursor/artifacts

run_one() {
  local agents="$1" wave="$2" label="$3" use_cgroup="$4"
  local raw="/opt/cursor/artifacts/infinity-slope-${label}.raw"
  local csv="$OUT_DIR/infinity-slope-${label}.csv"
  local log="/opt/cursor/artifacts/infinity-slope-${label}.log"
  : >"$raw"
  : >"$log"

  if [[ "$use_cgroup" == "1" ]]; then
    if [[ ! -f "$CGROUP_8G/memory.max" ]]; then
      echo "cgroup memory.max missing at $CGROUP_8G" >&2
      exit 1
    fi
    echo "$MEMORY_MAX_BYTES" >"$CGROUP_8G/memory.max"
    echo "0" >"$CGROUP_8G/memory.swap.max"
    echo "1" >"$CGROUP_8G/memory.oom.group" || true
    set +e
    # Birth inside cgroup: move this shell, then exec the binary in-place.
    bash -c "
      set -e
      echo \$\$ >'$CGROUP_8G/cgroup.procs'
      echo \"cgroup=\$(cat /proc/self/cgroup)\" >&2
      echo \"memory.max=\$(cat '$CGROUP_8G/memory.max')\" >&2
      echo \"memory.swap.max=\$(cat '$CGROUP_8G/memory.swap.max')\" >&2
      exec env AGENTS='$agents' TURNS='$TURNS' WAVE='$wave' '$BIN'
    " >"$raw" 2>"$log"
    ec=$?
    set -e
    {
      echo "INFINITY_EXIT=$ec"
      echo "memory.events=$(tr '\n' ' ' <"$CGROUP_8G/memory.events" 2>/dev/null || true)"
      echo "memory.peak=$(cat "$CGROUP_8G/memory.peak" 2>/dev/null || true)"
      echo "memory.current=$(cat "$CGROUP_8G/memory.current" 2>/dev/null || true)"
      echo "memory.swap.max=$(cat "$CGROUP_8G/memory.swap.max" 2>/dev/null || true)"
      echo "memory.swap.current=$(cat "$CGROUP_8G/memory.swap.current" 2>/dev/null || true)"
      echo "memory.swap.peak=$(cat "$CGROUP_8G/memory.swap.peak" 2>/dev/null || true)"
    } | tee -a "$log"
  else
    AGENTS="$agents" TURNS="$TURNS" WAVE="$wave" "$BIN" >"$raw" 2>"$log"
  fi

  {
    echo "---rep=${REP}---"
    grep -E '^[0-9]+,[0-9]+$' "$raw" || true
  } >"$csv"
  cat "$raw" >>"$log"
  echo "wrote $csv ($(grep -cE '^[0-9]+,' "$csv" || true) points)"
}

if [[ "$RUN_8G" == "1" ]]; then
  run_one "${AGENTS_8G:-100000}" "${WAVE_8G:-2500}" "8g-rep${REP}" 1
else
  run_one "$AGENTS" "$WAVE" "rep${REP}" 0
fi
