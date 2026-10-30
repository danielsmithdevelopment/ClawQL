#!/usr/bin/env bash
# Birth Infinity agent_scale latency probe inside 8G cgroup (swap disabled).
# publishable: true
set -euo pipefail

INFINITY_ROOT="${INFINITY_ROOT:-/workspace/.tools/infinity}"
BIN="$INFINITY_ROOT/target/release/examples/agent_scale"
CGROUP_8G="${CGROUP_8G:-/sys/fs/cgroup/system.slice/pod-mhqbokhclzf6nm5eskz7yy4chu-3054d5f8/cursor-agent/bench8g}"
MEMORY_MAX_BYTES="${MEMORY_MAX_BYTES:-8589934592}"
AGENTS="${AGENTS_FIT:-77500}"
WAVE="${WAVE_FIT:-2500}"
TURNS="${TURNS:-20}"
PROBE_SAMPLE="${PROBE_SAMPLE:-100}"
# baseline + mids + lastFit
PROBE_AT="${PROBE_AT:-2500,12500,27500,52500,77500}"
LOG="${LOG:-/opt/cursor/artifacts/infinity-fit-latency.log}"
RAW="${RAW:-/opt/cursor/artifacts/infinity-fit-latency.raw}"
OUT="${OUT:-/workspace/docs/benchmarks/program-density/infinity-on-pi/evidence-infinity-fit-latency.json}"

if [[ ! -x "$BIN" ]]; then
  (cd "$INFINITY_ROOT" && cargo build --release -p infinity-agent-core --example agent_scale)
fi
if [[ ! -f "$CGROUP_8G/memory.max" ]]; then
  echo "cgroup memory.max missing at $CGROUP_8G" >&2
  exit 1
fi

echo "$MEMORY_MAX_BYTES" >"$CGROUP_8G/memory.max"
echo "0" >"$CGROUP_8G/memory.swap.max"
echo "1" >"$CGROUP_8G/memory.oom.group" || true
echo 0 >"$CGROUP_8G/memory.peak" 2>/dev/null || true
echo 0 >"$CGROUP_8G/memory.swap.peak" 2>/dev/null || true

: >"$LOG"
: >"$RAW"
set +e
bash -c "
  set -e
  echo \$\$ >'$CGROUP_8G/cgroup.procs'
  echo cgroup=\$(cat /proc/self/cgroup) >&2
  echo memory.max=\$(cat '$CGROUP_8G/memory.max') >&2
  echo memory.swap.max=\$(cat '$CGROUP_8G/memory.swap.max') >&2
  exec env AGENTS='$AGENTS' TURNS='$TURNS' WAVE='$WAVE' \
    PROBE_SAMPLE='$PROBE_SAMPLE' PROBE_AT='$PROBE_AT' LATENCY_PROBE=1 \
    '$BIN'
" >"$RAW" 2>"$LOG"
ec=$?
set -e

{
  echo "INFINITY_FIT_EXIT=$ec"
  echo "memory.events=$(tr '\n' ' ' <"$CGROUP_8G/memory.events" 2>/dev/null || true)"
  echo "memory.peak=$(cat "$CGROUP_8G/memory.peak" 2>/dev/null || true)"
  echo "memory.current=$(cat "$CGROUP_8G/memory.current" 2>/dev/null || true)"
  echo "memory.swap.max=$(cat "$CGROUP_8G/memory.swap.max" 2>/dev/null || true)"
  echo "memory.swap.peak=$(cat "$CGROUP_8G/memory.swap.peak" 2>/dev/null || true)"
} | tee -a "$LOG"

node --import tsx scripts/benchmarks/program-density/finalize-infinity-fit-latency.mjs \
  --log "$LOG" --raw "$RAW" --out "$OUT" --agents "$AGENTS" --exit "$ec" \
  --cgroup "$CGROUP_8G" --memory-max "$MEMORY_MAX_BYTES" --probe-at "$PROBE_AT"

exit "$ec"
