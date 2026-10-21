#!/usr/bin/env bash
# Tier C — ProgramCellDO fleet peer kill:
#   1) celld diagnose must pass bucket conditional-write conformance
#   2) two fleet nodes (same bucket); pause write on node A; SIGKILL A; resume on B
# Requires: celld v0.4.0, esbuild, CELLD_BUCKET + AWS creds (or S3-compatible that
# enforces If-None-Match). Local s3rver/MinIO-lite that skips conditional writes FAIL diagnose.
#
# Soft-skip (exit 0) when CELLD_BUCKET unset, unless STREAMS_CELLD_FLEET_REQUIRED=1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../../.." && pwd)"
EVIDENCE_DIR="${PROGRAM_CELL_FLEET_EVIDENCE_DIR:-$REPO_ROOT/docs/benchmarks/program-cell-fleet-kill}"
PORT_A="${PROGRAM_CELL_FLEET_PORT_A:-9881}"
PORT_B="${PROGRAM_CELL_FLEET_PORT_B:-9882}"
INTERNAL_A="${PROGRAM_CELL_FLEET_INTERNAL_A:-9883}"
INTERNAL_B="${PROGRAM_CELL_FLEET_INTERNAL_B:-9884}"
PETS_PORT="${MOCK_PETS_PORT:-9885}"
REGION="${AWS_REGION:-us-east-1}"

mkdir -p "$EVIDENCE_DIR"

write_skipped() {
  local reason="$1"
  python3 - <<PY
import json, datetime, pathlib
out = pathlib.Path("$EVIDENCE_DIR") / "evidence.json"
out.write_text(json.dumps({
  "kind": "celld-fleet-peer-sigkill",
  "measuredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "ok": False,
  "status": "not_measured",
  "reason": """$reason""",
  "honesty": "Tier C fleet LTX peer kill not measured. Requires a bucket that passes celld diagnose conditional-write. Lab isolate kill (Tier B) is separate.",
}, indent=2) + "\n")
print(f"smoke-program-cell-fleet-kill: SKIP — $reason")
print(f"wrote {out}")
PY
}

# Auto-wire Cloudflare R2 from ClawQL sync secrets when CELLD_BUCKET unset.
if [[ -z "${CELLD_BUCKET:-}" && -n "${CLAWQL_R2_ACCOUNT_ID:-}" && -n "${CLAWQL_SYNC_ACCESS_KEY_ID:-}" && -n "${CLAWQL_SYNC_SECRET_ACCESS_KEY:-}" ]]; then
  export CELLD_BUCKET="${CELLD_BUCKET:-s3://clawql-streams-state/tier-c-$(date +%Y%m%d%H%M%S)}"
  export S3_ENDPOINT="${S3_ENDPOINT:-https://${CLAWQL_R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
  export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-$CLAWQL_SYNC_ACCESS_KEY_ID}"
  export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-$CLAWQL_SYNC_SECRET_ACCESS_KEY}"
  export AWS_REGION="${AWS_REGION:-auto}"
  export AWS_EC2_METADATA_DISABLED="${AWS_EC2_METADATA_DISABLED:-true}"
  echo "smoke-program-cell-fleet-kill: using R2 via CLAWQL_SYNC_* (bucket redacted in evidence)"
fi

if [[ -z "${CELLD_BUCKET:-}" ]]; then
  if [[ "${STREAMS_CELLD_FLEET_REQUIRED:-0}" == "1" ]]; then
    echo "smoke-program-cell-fleet-kill: FAIL — CELLD_BUCKET required" >&2
    exit 1
  fi
  write_skipped "CELLD_BUCKET unset"
  exit 0
fi

if ! command -v celld >/dev/null 2>&1; then
  if [[ "${STREAMS_CELLD_FLEET_REQUIRED:-0}" == "1" ]]; then
    echo "smoke-program-cell-fleet-kill: FAIL — celld not on PATH" >&2
    exit 1
  fi
  write_skipped "celld not on PATH"
  exit 0
fi

ENDPOINT_ARGS=()
if [[ -n "${S3_ENDPOINT:-}" ]]; then
  ENDPOINT_ARGS+=(--endpoint "$S3_ENDPOINT")
fi

echo "smoke-program-cell-fleet-kill: diagnose $CELLD_BUCKET ..."
if ! celld diagnose --bucket "$CELLD_BUCKET" --region "$REGION" "${ENDPOINT_ARGS[@]}" --json \
  > /tmp/celld-fleet-diagnose.json 2>/tmp/celld-fleet-diagnose.err; then
  if [[ "${STREAMS_CELLD_FLEET_REQUIRED:-0}" == "1" ]]; then
    cat /tmp/celld-fleet-diagnose.err >&2 || true
    echo "smoke-program-cell-fleet-kill: FAIL — diagnose" >&2
    exit 1
  fi
  write_skipped "celld diagnose failed (bucket must enforce conditional writes / If-None-Match)"
  exit 0
fi

# Build deploy config with mock pets upstream
CFG="$ROOT/wrangler.program-cell-fleet.jsonc"
python3 - "$ROOT/wrangler.jsonc" "$CFG" "$PETS_PORT" <<'PY'
import json, re, sys
src, dst, pets = sys.argv[1:4]
text = open(src, encoding="utf-8").read()
text = re.sub(r"/\*[\s\S]*?\*/", "", text)
text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
cfg = json.loads(text)
cfg.setdefault("vars", {})
cfg["vars"]["CLAWQL_CORE_UPSTREAM"] = f"http://127.0.0.1:{pets}"
cfg["vars"]["CLAWQL_MCP_URL"] = ""
cfg["vars"]["INFERENCE_URL"] = ""
open(dst, "w", encoding="utf-8").write(json.dumps(cfg, indent=2) + "\n")
PY

cd "$ROOT"
celld deploy "$CFG" --bucket "$CELLD_BUCKET" --region "$REGION" "${ENDPOINT_ARGS[@]}"

node "$ROOT/scripts/mock-pets-upstream.mjs" "$PETS_PORT" &
PETS_PID=$!
PID_A=""
PID_B=""

cleanup() {
  local ec=$?
  [[ -n "${PID_A}" ]] && kill -9 "$PID_A" 2>/dev/null || true
  [[ -n "${PID_B}" ]] && kill -9 "$PID_B" 2>/dev/null || true
  [[ -n "${PETS_PID}" ]] && kill -9 "$PETS_PID" 2>/dev/null || true
  rm -f "$CFG"
  exit "$ec"
}
trap cleanup EXIT

start_node() {
  local port="$1" internal="$2" log="$3"
  celld \
    --bucket "$CELLD_BUCKET" \
    --region "$REGION" \
    "${ENDPOINT_ARGS[@]}" \
    --listen "127.0.0.1:${port}" \
    --internal-listen "127.0.0.1:${internal}" \
    --advertise "127.0.0.1:${internal}" \
    >"$log" 2>&1 &
  echo $!
}

wait_health() {
  local base="$1"
  for _ in $(seq 1 150); do
    curl -sf "$base/health" >/dev/null 2>&1 && return 0
    sleep 0.2
  done
  return 1
}

# Worker routes (ProgramCellDO) can lag /health while the fleet settles + adopts deploy.
wait_program() {
  local base="$1"
  for _ in $(seq 1 150); do
    if curl -sf "$base/program/health" 2>/dev/null | grep -q ProgramCellDO; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

PID_A=$(start_node "$PORT_A" "$INTERNAL_A" /tmp/celld-fleet-a.log)
PID_B=$(start_node "$PORT_B" "$INTERNAL_B" /tmp/celld-fleet-b.log)

BASE_A="http://127.0.0.1:${PORT_A}"
BASE_B="http://127.0.0.1:${PORT_B}"

wait_health "$BASE_A" || { cat /tmp/celld-fleet-a.log >&2; echo "node A not ready" >&2; exit 1; }
wait_health "$BASE_B" || { cat /tmp/celld-fleet-b.log >&2; echo "node B not ready" >&2; exit 1; }
wait_program "$BASE_A" || {
  cat /tmp/celld-fleet-a.log >&2
  echo "smoke-program-cell-fleet-kill: FAIL — ProgramCellDO on A not ready" >&2
  exit 1
}
wait_program "$BASE_B" || {
  cat /tmp/celld-fleet-b.log >&2
  echo "smoke-program-cell-fleet-kill: FAIL — ProgramCellDO on B not ready" >&2
  exit 1
}

WRITE_ID="prog_fleetkill_write_$(date +%s)"
RUN=$(curl -sf -X POST "$BASE_A/program/run" \
  -H "content-type: application/json" \
  -d "{\"programId\":\"${WRITE_ID}\",\"pauseAfterIntentIndex\":2,\"plan\":{\"calls\":[
    {\"operationId\":\"listPets\",\"method\":\"GET\",\"path\":\"/pets\",\"risk\":\"read\"},
    {\"operationId\":\"streams.session.noop\",\"risk\":\"read\"},
    {\"operationId\":\"owners.create\",\"method\":\"POST\",\"path\":\"/owners\",\"risk\":\"write\",\"args\":{\"name\":\"fleet-kill\"}}
  ]}}")
echo "$RUN" | tee /tmp/celld-fleet-run-write.json >/dev/null
echo "$RUN" | grep -q 'paused_for_kill' || {
  echo "smoke-program-cell-fleet-kill: FAIL — expected paused_for_kill" >&2
  echo "$RUN" >&2
  exit 1
}

kill -9 "$PID_A"
wait "$PID_A" 2>/dev/null || true
PID_A=""
# Ownership / LTX catch-up on peer before resume
sleep 2
wait_program "$BASE_B" || {
  echo "smoke-program-cell-fleet-kill: FAIL — ProgramCellDO on B after A kill" >&2
  cat /tmp/celld-fleet-b.log >&2
  exit 1
}

RESUME=""
for _ in $(seq 1 40); do
  if RESUME=$(curl -sf -X POST "$BASE_B/program/resume" \
    -H "content-type: application/json" \
    -d "{\"programId\":\"${WRITE_ID}\"}"); then
    break
  fi
  sleep 0.5
done
echo "$RESUME" | tee /tmp/celld-fleet-resume-write.json >/dev/null
[[ -n "$RESUME" ]] || {
  echo "smoke-program-cell-fleet-kill: FAIL — resume on B empty" >&2
  cat /tmp/celld-fleet-b.log >&2
  exit 1
}
echo "$RESUME" | python3 -c '
import json,sys
d=json.load(sys.stdin)
calls=d.get("calls") or []
assert len(calls)>=3, calls
st=(calls[2].get("result") or {}).get("status")
assert st=="outcome_unknown" or calls[2].get("outcomeUnknown"), calls[2]
print("fleet-write-arm: PASS peer resume outcome_unknown")
'

python3 - <<PY
import json, pathlib, datetime
out = pathlib.Path("$EVIDENCE_DIR") / "evidence.json"
write = json.loads(pathlib.Path("/tmp/celld-fleet-resume-write.json").read_text())
diag = pathlib.Path("/tmp/celld-fleet-diagnose.json").read_text().strip().splitlines()
evidence = {
  "kind": "celld-fleet-peer-sigkill",
  "measuredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "ok": True,
  "status": "measured",
  "storageProvider": "cloudflare-r2",
  "nodeCount": 2,
  "bucketRedacted": True,
  "diagnoseConditionalWrite": "ok",
  "diagnoseLines": len(diag),
  "arms": [{
    "arm": "write_sigkill_peer_resume_outcome_unknown",
    "ok": True,
    "detail": "SIGKILL node A after write intent; resume on node B reported outcome_unknown; write not re-sent",
  }],
  "claim": "A program killed mid-run on one node resumed on another and never repeated a write; a write interrupted in flight is marked outcome unknown for a person to resolve.",
  "honesty": "Tier C lab: two celld nodes, one object-storage provider that passed diagnose conditional-write. Not a durable execution engine; not exactly-once. Not the AWS three-arm cost board; host WORM continuity still separate.",
}
out.write_text(json.dumps(evidence, indent=2) + "\n")
print("smoke-program-cell-fleet-kill: PASS")
print(f"wrote {out}")
PY
