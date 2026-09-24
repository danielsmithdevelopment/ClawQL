# ClawQL GLiNER Fast Decision sidecar

HTTP sidecar matching `packages/clawql-core` `scoreViaGlinerHttp` contract.

## Endpoints

| Method | Path                         | Purpose                              |
| ------ | ---------------------------- | ------------------------------------ |
| `GET`  | `/healthz`                   | Liveness + mode                      |
| `POST` | `/v1/fast-decision/classify` | Score fixed label set for a use site |

## Modes

| `CLAWQL_GLINER_SIDECAR_MODE` | Behavior                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `mock` (default)             | Token-overlap heuristic — no model weights; CI-safe                                                           |
| `gliner2`                    | Loads `CLAWQL_FAST_DECISION_GLINER_MODEL` via the **`gliner2`** package (`AutoExtractor` / Fastino GLiNER2.5). Scores use **multi-label classification** (not entity-extract alone) so every candidate gets a calibrated confidence. |

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
# or: bash scripts/gliner-sidecar-smoke.sh
```

## Run (live Fastino GLiNER2.5 weights)

```bash
pip install gliner2 peft tiktoken protobuf torch
export CLAWQL_GLINER_SIDECAR_MODE=gliner2
export CLAWQL_FAST_DECISION_GLINER_MODEL=fastino/gliner2.5-base-v1
python app.py
# Docker: docker compose --profile live up --build gliner-sidecar-live
# Image target installs gliner2+torch (large). HF cache volume recommended.
# Optional GHA: workflow_dispatch `.github/workflows/fast-decision-gliner2-live.yml`
#   (bash scripts/gliner2-live-sidecar-smoke.sh) — not on every PR.
```

## §7 honesty

| Pass type           | Meaning                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Wiring / mock       | Sidecar HTTP + classifier path works                                                                                        |
| `productionTrusted` | Frontier-adjudicated held-out (`adjudicationKind: "live"`) **and** live GLiNER2 scorer (`backendId: gliner2`) meet criteria |

Mock mode is for wiring and integration tests only. Dry-run adjudication (`FrontierAdjudicator` dry-run Layer) must not be cited as a production gate pass.
