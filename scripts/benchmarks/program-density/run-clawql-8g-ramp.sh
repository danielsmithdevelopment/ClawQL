#!/usr/bin/env bash
# Birth ClawQL resident ramp inside 8G memory.max cgroup.
set -euo pipefail
CGROUP_8G="${CGROUP_8G:-/sys/fs/cgroup/system.slice/pod-mhqbokhclzf6nm5eskz7yy4chu-3054d5f8/cursor-agent/bench8g}"
ROOT="${ROOT:-/workspace}"
LOG=/opt/cursor/artifacts/clawql-8g-ramp.log
echo "8589934592" >"$CGROUP_8G/memory.max"
echo "1" >"$CGROUP_8G/memory.oom.group" || true
export CLAWQL_8G_CGROUP="$CGROUP_8G"
set +e
bash -c "
  echo \$\$ >'$CGROUP_8G/cgroup.procs'
  echo cgroup=\$(cat /proc/self/cgroup) >&2
  echo memory.max=\$(cat '$CGROUP_8G/memory.max') >&2
  cd '$ROOT'
  exec node --expose-gc --max-old-space-size=8192 --import tsx scripts/benchmarks/program-density/run-clawql-8g-ramp.mjs
" 2> >(tee "$LOG" >&2)
ec=$?
set -e
{
  echo "CLAWQL_8G_EXIT=$ec"
  echo "memory.events=$(tr '\n' ' ' <"$CGROUP_8G/memory.events" 2>/dev/null || true)"
  echo "memory.peak=$(cat "$CGROUP_8G/memory.peak" 2>/dev/null || true)"
} | tee -a "$LOG"
exit 0
