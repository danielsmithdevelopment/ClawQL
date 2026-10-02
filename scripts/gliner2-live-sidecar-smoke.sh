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

# Mock-path unit tests (no torch) — catches multi_label classify regressions early.
"$PY" -m unittest test_app.py -v

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
scores=c.get("scores") or []
assert len(scores)>=1, c
# Multi-label classify must not collapse to all-zero (entity-extract failure mode).
assert any(float(s.get("confidence") or 0) > 0 for s in scores), (
    "all-zero confidences — expected multi_label classification scores",
    c,
)
by_id={s["id"]: float(s["confidence"]) for s in scores}
# Prefer matching label when both candidates are scored.
if "merge" in by_id and "slack" in by_id and by_id["merge"] > 0:
    assert by_id["merge"] >= by_id["slack"], c
print("GLINER2_LIVE_SMOKE_OK", {"health": h, "backend": backend, "top": scores[0], "by_id": by_id})
PY
