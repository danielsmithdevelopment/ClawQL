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
| `gliner2` | Loads `CLAWQL_FAST_DECISION_GLINER_MODEL` via `gliner` + torch |

## Wire to clawql-core

```bash
export CLAWQL_FAST_DECISION_GLINER_URL=http://127.0.0.1:8080
# optional: CLAWQL_FAST_DECISION_GLINER_MODEL=fastino/gliner2.5-base-v1
# optional: CLAWQL_FAST_DECISION_GLINER_TOKEN=...
```

Without `CLAWQL_FAST_DECISION_GLINER_URL`, the classifier reports honest `gliner2-stub`.

## Run (mock)

```bash
cd infra/gliner-sidecar
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
# or: docker compose up --build
```

## Run (live weights)

```bash
# Image target installs gliner+torch (large). HF cache volume recommended.
docker compose --profile live up --build gliner-sidecar-live
# or: docker build --target gliner2 -t clawql-gliner-sidecar:gliner2 .
pip install "gliner>=0.2.0" torch   # local alternative
export CLAWQL_GLINER_SIDECAR_MODE=gliner2
```

## §7 honesty

| Pass type | Meaning |
|-----------|---------|
| Wiring / mock | Sidecar HTTP + classifier path works |
| `productionTrusted` | Frontier-adjudicated held-out (`adjudicated: true`) **and** live GLiNER (or fine-tune) scores meet criteria |

Mock mode is for wiring and integration tests only. Dry-run adjudication (`FrontierAdjudicator` dry-run Layer) must not be cited as a production gate pass.
