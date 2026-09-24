#!/usr/bin/env bash
# Smoke the GLiNER sidecar mock classify path (live HTTP contract, mock weights).
# For true gliner2 weights: docker build --target gliner2 (requires HF + torch).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/infra/gliner-sidecar"

PY=python3
if [[ -x .venv/bin/python ]]; then
  PY=.venv/bin/python
elif command -v python3 >/dev/null; then
  # Prefer user/venv install of fastapi; fall back to pip --user if missing.
  if ! "$PY" -c "import fastapi" 2>/dev/null; then
    "$PY" -m pip install --user -q -r requirements.txt || "$PY" -m pip install -q -r requirements.txt
  fi
fi

export CLAWQL_GLINER_SIDECAR_MODE=mock
export CLAWQL_GLINER_SIDECAR_HOST=127.0.0.1
export CLAWQL_GLINER_SIDECAR_PORT=18080
"$PY" app.py &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:18080/healthz" >/dev/null; then
    break
  fi
  sleep 0.1
done

curl -sf "http://127.0.0.1:18080/healthz" | tee /tmp/gliner-healthz.json
echo
BODY='{"useSiteId":"skill_fast_path_match","text":"merge pull request","labels":[{"id":"hit","description":"merge pull"},{"id":"miss","description":"unrelated"}],"model":"mock"}'
curl -sf -X POST "http://127.0.0.1:18080/v1/fast-decision/classify" \
  -H 'content-type: application/json' \
  -d "$BODY" | tee /tmp/gliner-classify.json
echo
"$PY" - <<'PY'
import json
h=json.load(open("/tmp/gliner-healthz.json"))
c=json.load(open("/tmp/gliner-classify.json"))
assert "scores" in c and len(c["scores"])>=1
print("GLINER_SIDECAR_SMOKE_OK", {"health": h, "backend": c.get("backend")})
PY
