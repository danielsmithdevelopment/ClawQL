#!/usr/bin/env bash
# Live GLiNER2 sidecar smoke — requires gliner2+torch + HF model weights.
# Does NOT claim productionTrusted (still needs frontier adjudication + criteria).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/infra/gliner-sidecar"

PY=python3
export CLAWQL_GLINER_SIDECAR_MODE=gliner2
export CLAWQL_FAST_DECISION_GLINER_MODEL="${CLAWQL_FAST_DECISION_GLINER_MODEL:-fastino/gliner2.5-base-v1}"
export CLAWQL_GLINER_SIDECAR_HOST=127.0.0.1
export CLAWQL_GLINER_SIDECAR_PORT="${CLAWQL_GLINER_SIDECAR_PORT:-18081}"

"$PY" -c "import gliner2, torch; print('gliner2', getattr(gliner2,'__version__','?'), 'torch', torch.__version__)"

"$PY" -m uvicorn app:app --host 127.0.0.1 --port "$CLAWQL_GLINER_SIDECAR_PORT" &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 120); do
  if curl -sf "http://127.0.0.1:${CLAWQL_GLINER_SIDECAR_PORT}/healthz" >/dev/null; then
    break
  fi
  sleep 1
done

curl -sf "http://127.0.0.1:${CLAWQL_GLINER_SIDECAR_PORT}/healthz" | tee /tmp/gliner2-live-healthz.json
echo
BODY='{"useSiteId":"skill_fast_path_match","text":"approve the merge request after review","labels":[{"id":"merge","description":"merge or ship code"},{"id":"slack","description":"send slack message"}],"model":""}'
curl -sf --max-time 600 -X POST "http://127.0.0.1:${CLAWQL_GLINER_SIDECAR_PORT}/v1/fast-decision/classify" \
  -H 'content-type: application/json' \
  -d "$BODY" | tee /tmp/gliner2-live-classify.json
echo
"$PY" - <<'PY'
import json
h=json.load(open("/tmp/gliner2-live-healthz.json"))
c=json.load(open("/tmp/gliner2-live-classify.json"))
assert h.get("mode")=="gliner2", h
assert h.get("backend")=="gliner2", h
backend=c.get("backend","")
assert backend.startswith("gliner2:"), c
assert "scores" in c and len(c["scores"])>=1
print("GLINER2_LIVE_SMOKE_OK", {"health": h, "backend": backend, "top": c["scores"][0]})
PY
