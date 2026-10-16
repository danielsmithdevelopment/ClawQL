#!/usr/bin/env bash
# Follow-up after phase2: finalize agentgateway from checkpoint + measure executor_v2.
set -u
cd /workspace
export EXECUTOR_BIN="${EXECUTOR_BIN:-/tmp/executor-v2/node_modules/.bin/executor}"
export EXECUTOR_V2_API_KEY="${EXECUTOR_V2_API_KEY:-$(cat /tmp/executor-v2-data/api_key.txt)}"
export EXECUTOR_HOST="${EXECUTOR_HOST:-http://127.0.0.1:4312}"
export EXECUTOR_DATA_DIR="${EXECUTOR_DATA_DIR:-/tmp/executor-v2-data}"

LOG="${LOG:-/tmp/http-conc-ag-exec-followup.log}"
: >"$LOG"
SEED="${SEED:-/workspace/docs/benchmarks/cloudflare-multiturn/http-concurrency-curves.json.checkpoint.json}"
AG_OUT=/tmp/http-concurrency-curves-ag.json
EXEC_OUT=/tmp/http-concurrency-curves-exec.json
PHASE2=/tmp/http-concurrency-curves-phase2.json
FINAL=/workspace/docs/benchmarks/cloudflare-multiturn/http-concurrency-curves.json

cleanup_orphans() {
  local pids
  pids=$(ps -eo pid,args | grep -E 'agentgateway -f /tmp/http-conc|cf-rest-mcp\.mjs|cloudflare-replay-mock\.mjs|mcpjungle start' | grep -v grep | awk '{print $1}' || true)
  for p in $pids; do kill "$p" 2>/dev/null || true; done
  sleep 2
  for p in $pids; do kill -9 "$p" 2>/dev/null || true; done
}

echo "ag_refine_from_checkpoint start=$(date -u +%FT%TZ)" | tee -a "$LOG"
CURVE=1 THRESHOLDS=100,250,500 CONC_STEP_MS=10000 REPS=1 \
  ARMS=agentgateway \
  SEED_STEPS_JSON="$SEED" \
  OUT="$AG_OUT" \
  node scripts/benchmarks/http-concurrency-heap-ab.mjs >>"$LOG" 2>&1
ec_ag=$?
echo "AG_EXIT:$ec_ag" | tee -a "$LOG"
cleanup_orphans

# One uncapped probe past checkpoint max to try to clear 500ms (may OOM — ok).
echo "ag_probe_120 start=$(date -u +%FT%TZ) avail_kb=$(awk '/MemAvailable/{print $2}' /proc/meminfo)" | tee -a "$LOG"
# If refine-only left @500 without a break, try n=120 once via a tiny inline by re-running
# without seed but CONC - skip; merge script notes host_oom from checkpoint metadata.

echo "executor start=$(date -u +%FT%TZ)" | tee -a "$LOG"
CURVE=1 THRESHOLDS=100,250,500 CONC_STEP_MS=10000 REPS=3 \
  ARMS=executor_v2 \
  OUT="$EXEC_OUT" \
  node scripts/benchmarks/http-concurrency-heap-ab.mjs >>"$LOG" 2>&1
ec_ex=$?
echo "EXEC_EXIT:$ec_ex" | tee -a "$LOG"
cleanup_orphans

node scripts/benchmarks/merge-http-concurrency-phases.mjs "$PHASE2" "$AG_OUT" /tmp/http-conc-merge-tmp.json >>"$LOG" 2>&1
node scripts/benchmarks/merge-http-concurrency-phases.mjs /tmp/http-conc-merge-tmp.json "$EXEC_OUT" "$FINAL" >>"$LOG" 2>&1
ecm=$?
echo "EXIT:$ec_ag/$ec_ex/$ecm" | tee -a "$LOG"
cp -f "$LOG" /opt/cursor/artifacts/http-conc-ag-exec-followup.log || true
cp -f "$FINAL" /opt/cursor/artifacts/http-concurrency-curves.json || true
exit $(( ec_ag != 0 || ec_ex != 0 || ecm != 0 ? 1 : 0 ))
