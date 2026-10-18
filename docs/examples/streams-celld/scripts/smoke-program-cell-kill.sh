#!/usr/bin/env bash
# ADR 0015 ProgramCellDO isolate kill-node: SIGKILL celld after write intent → resume outcome_unknown.
# Requires celld v0.4.0 + esbuild. Local only — no AWS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PROGRAM_CELL_PORT:-9877}"
PETS_PORT="${MOCK_PETS_PORT:-9878}"
# celld stores state in PROJECT/.celld/dev (PROJECT = config dirname).
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

mkdir -p "$EVIDENCE_DIR"
# Fresh state before first start only — must survive SIGKILL → restart.
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
  # Same PROJECT/.celld/dev across restart so DO SQLite/LTX survives SIGKILL.
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

start_celld

curl -sf "$BASE/program/health" | grep -q ProgramCellDO || {
  echo "smoke-program-cell-kill: FAIL — ProgramCellDO health" >&2
  cat /tmp/program-cell-celld.log >&2 || true
  exit 1
}

PROGRAM_ID="prog_isolatekill01"
RUN=$(curl -sf -X POST "$BASE/program/run" \
  -H "content-type: application/json" \
  -d "{\"programId\":\"${PROGRAM_ID}\",\"pauseAfterIntentIndex\":2,\"plan\":{\"calls\":[
    {\"operationId\":\"listPets\",\"method\":\"GET\",\"path\":\"/pets\",\"risk\":\"read\"},
    {\"operationId\":\"streams.session.noop\",\"risk\":\"read\"},
    {\"operationId\":\"owners.create\",\"method\":\"POST\",\"path\":\"/owners\",\"risk\":\"write\",\"args\":{\"name\":\"kill-node\"}}
  ]}}")
echo "$RUN" | tee /tmp/program-cell-run.json >/dev/null
echo "$RUN" | grep -q 'paused_for_kill' || {
  echo "smoke-program-cell-kill: FAIL — expected paused_for_kill" >&2
  echo "$RUN" >&2
  exit 1
}

# SIGKILL celld binary — journal must survive in STATE_DIR
kill -9 "$CELLD_PID" 2>/dev/null || true
wait "$CELLD_PID" 2>/dev/null || true
CELLD_PID=""
sleep 0.4

start_celld

RESUME=$(curl -sf -X POST "$BASE/program/resume" \
  -H "content-type: application/json" \
  -d "{\"programId\":\"${PROGRAM_ID}\"}")
echo "$RESUME" | tee /tmp/program-cell-resume.json >/dev/null

echo "$RESUME" | python3 -c '
import json, sys
d = json.load(sys.stdin)
calls = d.get("calls") or []
if len(calls) < 3:
    raise SystemExit(f"expected >=3 calls, got {len(calls)}: {d!r}"[:500])
if not calls[0].get("replayed"):
    raise SystemExit(f"call0 not replayed: {calls[0]!r}"[:400])
if not calls[1].get("replayed"):
    raise SystemExit(f"call1 not replayed: {calls[1]!r}"[:400])
c2 = calls[2]
st = (c2.get("result") or {}).get("status")
if st != "outcome_unknown" and not c2.get("outcomeUnknown"):
    raise SystemExit(f"expected outcome_unknown on write: {c2!r}"[:500])
if "ProgramCellDO" not in (d.get("honesty") or ""):
    raise SystemExit("missing ProgramCellDO honesty")
print("smoke-program-cell-kill: PASS")
print(json.dumps({
    "kind": "celld-isolate-sigkill",
    "ok": True,
    "programId": d.get("programId"),
    "replayed": [calls[0].get("operationId"), calls[1].get("operationId")],
    "write": "outcome_unknown",
}, indent=2))
'

python3 - <<PY
import json, pathlib, datetime
src = pathlib.Path("/tmp/program-cell-resume.json")
out = pathlib.Path("$EVIDENCE_DIR") / "evidence.json"
out.parent.mkdir(parents=True, exist_ok=True)
body = json.loads(src.read_text())
evidence = {
  "kind": "celld-isolate-sigkill",
  "measuredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "ok": True,
  "programId": body.get("programId"),
  "arms": [{
    "arm": "write_sigkill_outcome_unknown",
    "ok": True,
    "detail": "SIGKILL celld after write intent; resume reported outcome_unknown without re-POST",
  }],
  "honesty": body.get("honesty"),
}
out.write_text(json.dumps(evidence, indent=2) + "\n")
print(f"wrote {out}")
PY
