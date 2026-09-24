# ClawQL GLiNER Fast Decision sidecar

HTTP sidecar matching `packages/clawql-core` `scoreViaGlinerHttp` contract.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/healthz` | Liveness + mode |
| `POST` | `/v1/fast-decision/classify` | Score fixed label set for a use site |

## Modes

| `CLAWQL_GLINER_SIDECAR_MODE` | Behavior |
|------------------------------|----------|
| `mock` (default) | Token-overlap heuristic — no model weights; CI-safe |
| `gliner2` | Loads `CLAWQL_FAST_DECISION_GLINER_MODEL` via `gliner` (install extra deps) |

## Wire to clawql-core

```bash
export CLAWQL_FAST_DECISION_GLINER_URL=http://127.0.0.1:8080
# optional: CLAWQL_FAST_DECISION_GLINER_MODEL=fastino/gliner2.5-base-v1
# optional: CLAWQL_FAST_DECISION_GLINER_TOKEN=...
```

Without `CLAWQL_FAST_DECISION_GLINER_URL`, the classifier reports honest `gliner2-stub`.

## Run

```bash
cd infra/gliner-sidecar
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
# or: docker compose up --build
```

## §7 honesty

Mock mode is for wiring and integration tests only. Section 7 `productionTrusted` still requires frontier-adjudicated held-out cases scored by a real GLiNER (or fine-tuned) backend — mock passing wiring criteria is not a production gate pass.
