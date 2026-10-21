#!/usr/bin/env bash
# ADR 0015 ProgramCellDO isolate kill-node:
#   write arm — SIGKILL after write intent → resume outcome_unknown
#   read arm  — SIGKILL before read call → resume re-runs interrupted read
# Requires celld v0.4.0 + esbuild. Local only — no AWS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PROGRAM_CELL_PORT:-9877}"
PETS_PORT="${MOCK_PETS_PORT:-9878}"
STATE_DIR="$ROOT/.celld/dev"
CFG="$ROOT/wrangler.program-cell-kill.jsonc"
BASE="http://127.0.0.1:${PORT}"
REPO_ROOT="$(cd "$ROOT/../../.." && pwd)"
EVIDENCE_DIR="${PROGRAM_CELL_EVIDENCE_DIR:-$REPO_ROOT/docs/benchmarks/program-cell-isolate-kill}"

if ! command -v celld >/dev/null 2>&1; then
  if [[ "${STREAMS_CELLD_SMOKE_REQUIRED:-0}" == "1" ]]; then
    echo "smoke-program-cell-kill: FAIL — celld not on PATH" >&2
    exit 1
  fi
  echo "smoke-program-cell-kill: celld not on PATH — skip" >&2
  exit 0
fi

node "$ROOT/scripts/program-cell-resume.test.mjs"

mkdir -p "$EVIDENCE_DIR"
rm -rf "${STATE_DIR}"
mkdir -p "$STATE_DIR"
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

node "$ROOT/scripts/mock-pets-upstream.mjs" "$PETS_PORT" &
PETS_PID=$!

CELLD_PID=""
cleanup() {
  local ec=$?
  [[ -n "${CELLD_PID}" ]] && kill "$CELLD_PID" 2>/dev/null || true
  [[ -n "${PETS_PID}" ]] && kill "$PETS_PID" 2>/dev/null || true
  sleep 0.2
  [[ -n "${CELLD_PID}" ]] && kill -9 "$CELLD_PID" 2>/dev/null || true
  [[ -n "${PETS_PID}" ]] && kill -9 "$PETS_PID" 2>/dev/null || true
  rm -f "$CFG"
  exit "$ec"
}
trap cleanup EXIT

start_celld() {
  cd "$ROOT"
  celld dev "$CFG" --port "$PORT" >/tmp/program-cell-celld.log 2>&1 &
  CELLD_PID=$!
  for _ in $(seq 1 80); do
    curl -sf "$BASE/health" >/dev/null 2>&1 && return 0
    sleep 0.15
  done
  echo "smoke-program-cell-kill: FAIL — celld not ready" >&2
  cat /tmp/program-cell-celld.log >&2 || true
  return 1
}

kill_celld() {
  kill -9 "$CELLD_PID" 2>/dev/null || true
  wait "$CELLD_PID" 2>/dev/null || true
  CELLD_PID=""
  sleep 0.4
}

start_celld

curl -sf "$BASE/program/health" | grep -q ProgramCellDO || {
  echo "smoke-program-cell-kill: FAIL — ProgramCellDO health" >&2
  cat /tmp/program-cell-celld.log >&2 || true
  exit 1
}

# --- Write arm ---
WRITE_ID="prog_isolatekill_write"
RUN=$(curl -sf -X POST "$BASE/program/run" \
  -H "content-type: application/json" \
  -d "{\"programId\":\"${WRITE_ID}\",\"pauseAfterIntentIndex\":2,\"plan\":{\"calls\":[
    {\"operationId\":\"listPets\",\"method\":\"GET\",\"path\":\"/pets\",\"risk\":\"read\"},
    {\"operationId\":\"streams.session.noop\",\"risk\":\"read\"},
    {\"operationId\":\"owners.create\",\"method\":\"POST\",\"path\":\"/owners\",\"risk\":\"write\",\"args\":{\"name\":\"kill-node\"}}
  ]}}")
echo "$RUN" | tee /tmp/program-cell-run-write.json >/dev/null
echo "$RUN" | grep -q 'paused_for_kill' || {
  echo "smoke-program-cell-kill: FAIL — write arm expected paused_for_kill" >&2
  echo "$RUN" >&2
  exit 1
}

kill_celld
start_celld

RESUME_W=$(curl -sf -X POST "$BASE/program/resume" \
  -H "content-type: application/json" \
  -d "{\"programId\":\"${WRITE_ID}\"}")
echo "$RESUME_W" | tee /tmp/program-cell-resume-write.json >/dev/null
echo "$RESUME_W" | python3 -c '
import json,sys
d=json.load(sys.stdin)
calls=d.get("calls") or []
assert len(calls)>=3, calls
assert calls[0].get("replayed") and calls[1].get("replayed")
st=(calls[2].get("result") or {}).get("status")
assert st=="outcome_unknown" or calls[2].get("outcomeUnknown"), calls[2]
print("write-arm: PASS outcome_unknown")
'

# --- Read arm (same celld process / state; new program id) ---
READ_ID="prog_isolatekill_read"
RUN_R=$(curl -sf -X POST "$BASE/program/run" \
  -H "content-type: application/json" \
  -d "{\"programId\":\"${READ_ID}\",\"pauseBeforeIndex\":2,\"plan\":{\"calls\":[
    {\"operationId\":\"listPets\",\"method\":\"GET\",\"path\":\"/pets\",\"risk\":\"read\"},
    {\"operationId\":\"streams.session.noop\",\"risk\":\"read\"},
    {\"operationId\":\"listPets\",\"method\":\"GET\",\"path\":\"/pets\",\"risk\":\"read\"}
  ]}}")
echo "$RUN_R" | tee /tmp/program-cell-run-read.json >/dev/null
echo "$RUN_R" | grep -q 'paused_for_kill' || {
  echo "smoke-program-cell-kill: FAIL — read arm expected paused_for_kill" >&2
  echo "$RUN_R" >&2
  exit 1
}
echo "$RUN_R" | grep -q 'before_intent' || {
  echo "smoke-program-cell-kill: FAIL — read arm expected pauseKind before_intent" >&2
  echo "$RUN_R" >&2
  exit 1
}

kill_celld
start_celld

RESUME_R=$(curl -sf -X POST "$BASE/program/resume" \
  -H "content-type: application/json" \
  -d "{\"programId\":\"${READ_ID}\"}")
echo "$RESUME_R" | tee /tmp/program-cell-resume-read.json >/dev/null
echo "$RESUME_R" | python3 -c '
import json,sys
d=json.load(sys.stdin)
calls=d.get("calls") or []
assert len(calls)>=3, calls
assert calls[0].get("replayed") and calls[1].get("replayed")
assert calls[2].get("resumed") is True, calls[2]
assert (calls[2].get("result") or {}).get("ok") is True, calls[2]
assert d.get("ok") is True and d.get("status")=="completed", d
print("read-arm: PASS resumed re-run")
'

python3 - <<PY
import json, pathlib, datetime
out = pathlib.Path("$EVIDENCE_DIR") / "evidence.json"
out.parent.mkdir(parents=True, exist_ok=True)
write = json.loads(pathlib.Path("/tmp/program-cell-resume-write.json").read_text())
read = json.loads(pathlib.Path("/tmp/program-cell-resume-read.json").read_text())
evidence = {
  "kind": "celld-isolate-sigkill",
  "measuredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "ok": True,
  "arms": [
    {
      "arm": "write_sigkill_outcome_unknown",
      "ok": True,
      "programId": write.get("programId"),
      "detail": "SIGKILL celld after write intent; resume reported outcome_unknown without re-POST",
    },
    {
      "arm": "read_sigkill_resume",
      "ok": True,
      "programId": read.get("programId"),
      "detail": "SIGKILL celld before interrupted read; resume re-ran listPets once",
    },
  ],
  "honesty": write.get("honesty") or read.get("honesty"),
}
out.write_text(json.dumps(evidence, indent=2) + "\n")
print("smoke-program-cell-kill: PASS")
print(json.dumps({"ok": True, "arms": [a["arm"] for a in evidence["arms"]]}, indent=2))
print(f"wrote {out}")
PY
