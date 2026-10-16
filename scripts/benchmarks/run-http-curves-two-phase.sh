#!/usr/bin/env bash
# Two-phase uncapped HTTP curves: AG+Executor first on a clean host, then ClawQL+MJ.
# No predetermined client caps — climb until p99/errors. Merge into OUT.
set -u
cd /workspace
export EXECUTOR_BIN="${EXECUTOR_BIN:-/tmp/executor-v2/node_modules/.bin/executor}"
export EXECUTOR_V2_API_KEY="${EXECUTOR_V2_API_KEY:-$(cat /tmp/executor-v2-data/api_key.txt)}"
export EXECUTOR_HOST="${EXECUTOR_HOST:-http://127.0.0.1:4312}"
export EXECUTOR_DATA_DIR="${EXECUTOR_DATA_DIR:-/tmp/executor-v2-data}"

LOG="${LOG:-/tmp/http-conc-curves.log}"
OUT="${OUT:-/workspace/docs/benchmarks/cloudflare-multiturn/http-concurrency-curves.json}"
OUT2="${OUT2:-/tmp/http-concurrency-curves-phase2.json}"
: >"$LOG"

cleanup_orphans() {
  local pids
  pids=$(ps -eo pid,args | grep -E 'agentgateway -f /tmp/http-conc|cf-rest-mcp\.mjs|cloudflare-replay-mock\.mjs|mcpjungle start' | grep -v grep | awk '{print $1}' || true)
  for p in $pids; do kill "$p" 2>/dev/null || true; done
  sleep 2
  for p in $pids; do kill -9 "$p" 2>/dev/null || true; done
}

echo "phase1_ag_exec start=$(date -u +%FT%TZ) avail_kb=$(awk '/MemAvailable/{print $2}' /proc/meminfo)" | tee -a "$LOG"
CURVE=1 THRESHOLDS=100,250,500 CONC_STEP_MS=10000 REPS=3 \
  ARMS=agentgateway,executor_v2 \
  OUT="$OUT" \
  node scripts/benchmarks/http-concurrency-heap-ab.mjs >>"$LOG" 2>&1
ec1=$?
echo "PHASE1_EXIT:$ec1" | tee -a "$LOG"
cp -f "$OUT" /opt/cursor/artifacts/http-concurrency-curves-phase1.json 2>/dev/null || true
cp -f "${OUT}.checkpoint.json" /opt/cursor/artifacts/http-conc-checkpoint.json 2>/dev/null || true
cleanup_orphans
sleep 2

echo "phase2_clawql_mj start=$(date -u +%FT%TZ) avail_kb=$(awk '/MemAvailable/{print $2}' /proc/meminfo)" | tee -a "$LOG"
CURVE=1 THRESHOLDS=100,250,500 CONC_STEP_MS=10000 REPS=3 \
  ARMS=clawql_bun_smol,clawql_node_256,mcpjungle \
  OUT="$OUT2" \
  node scripts/benchmarks/http-concurrency-heap-ab.mjs >>"$LOG" 2>&1
ec2=$?
echo "PHASE2_EXIT:$ec2" | tee -a "$LOG"
cleanup_orphans

node scripts/benchmarks/merge-http-concurrency-phases.mjs "$OUT" "$OUT2" "$OUT" >>"$LOG" 2>&1
ecm=$?
echo "EXIT:$ec1/$ec2/$ecm" | tee -a "$LOG"
cp -f "$LOG" /opt/cursor/artifacts/http-conc-curves.log || true
cp -f "$OUT" /opt/cursor/artifacts/http-concurrency-curves.json || true
exit $(( ec1 != 0 || ec2 != 0 || ecm != 0 ? 1 : 0 ))
