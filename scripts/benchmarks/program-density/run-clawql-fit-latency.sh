#!/usr/bin/env bash
# Birth ClawQL fit-latency probe inside 8G memory.max cgroup (swap disabled).
# publishable: false
set -euo pipefail

CGROUP_8G="${CGROUP_8G:-/sys/fs/cgroup/system.slice/pod-mhqbokhclzf6nm5eskz7yy4chu-3054d5f8/cursor-agent/bench8g}"
MEMORY_MAX_BYTES="${MEMORY_MAX_BYTES:-8589934592}"
LOG="${LOG:-/opt/cursor/artifacts/clawql-fit-latency.log}"
OUT="${CLAWQL_FIT_OUT:-/workspace/docs/benchmarks/program-density/infinity-on-pi/evidence-clawql-fit-latency.json}"

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
set +e
bash -c "
  set -e
  echo \$\$ >'$CGROUP_8G/cgroup.procs'
  echo cgroup=\$(cat /proc/self/cgroup) >&2
  echo memory.max=\$(cat '$CGROUP_8G/memory.max') >&2
  echo memory.swap.max=\$(cat '$CGROUP_8G/memory.swap.max') >&2
  export CLAWQL_FIT_CGROUP='$CGROUP_8G'
  export CLAWQL_FIT_OUT='$OUT'
  exec node --expose-gc --max-old-space-size=8192 --import tsx \
    packages/clawql-api/src/program/density/fit-latency-cli.ts '$OUT'
" 2>>"$LOG" | tee -a "$LOG"
ec=${PIPESTATUS[0]}
set -e

{
  echo "CLAWQL_FIT_EXIT=$ec"
  echo "memory.events=$(tr '\n' ' ' <"$CGROUP_8G/memory.events" 2>/dev/null || true)"
  echo "memory.peak=$(cat "$CGROUP_8G/memory.peak" 2>/dev/null || true)"
  echo "memory.current=$(cat "$CGROUP_8G/memory.current" 2>/dev/null || true)"
  echo "memory.swap.max=$(cat "$CGROUP_8G/memory.swap.max" 2>/dev/null || true)"
  echo "memory.swap.peak=$(cat "$CGROUP_8G/memory.swap.peak" 2>/dev/null || true)"
} | tee -a "$LOG"

exit "$ec"
