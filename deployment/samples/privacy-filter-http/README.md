# Local Privacy Filter HTTP sidecar ([#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245))

Optional **local** sparse-MoE / token-classifier backup after **Microsoft Presidio** on ClawQL gateway paths (`execute`, `memory_ingest`, `ingest_external_knowledge`). **No OpenAI API** — weights load from Hugging Face Hub or a local checkpoint into the operator's cache.

Product branding may say “OpenAI Privacy Filter”; the publisher is OpenAI, the runtime is on-prem.

## Modes

| Mode | Env | Behavior |
| ---- | --- | -------- |
| **demo** (default) | `PRIVACY_FILTER_MODE=demo` | Regex heuristics for the 8 Privacy Filter categories — **no model download**, safe for CI smoke |
| **live** | `PRIVACY_FILTER_MODE=live` | Loads [`openai/privacy-filter`](https://huggingface.co/openai/privacy-filter) via `transformers` on CPU/GPU locally |

## API

| Method | Path | Body | Response |
| ------ | ---- | ---- | -------- |
| `GET` | `/health` | — | `{ "ok": true, "mode": "demo", "local": true }` |
| `POST` | `/redact` | `{ "text": "..." }` | `{ "ok", "text", "spans"[], "mode", "local": true }` |

Masked tokens use `[CATEGORY]` placeholders (e.g. `[PRIVATE_EMAIL]`).

## Run locally (demo)

```bash
python deployment/samples/privacy-filter-http/server.py
curl -s http://localhost:8091/health
curl -s -X POST http://localhost:8091/redact \
  -H 'content-type: application/json' \
  -d '{"text":"Employee: Name: Jane Q Public email jane@example.com phone 555-123-4567"}'
```

### Live (local weights)

```bash
pip install 'transformers>=4.50' torch
export PRIVACY_FILTER_MODE=live
export PRIVACY_FILTER_MODEL=openai/privacy-filter   # or a local checkpoint path
export PRIVACY_FILTER_DEVICE=cpu                    # or cuda:0
# Air-gapped: pre-download weights, then HF_HUB_OFFLINE=1
python deployment/samples/privacy-filter-http/server.py
```

Official CLI alternative: [`openai/privacy-filter`](https://github.com/openai/privacy-filter) `opf` package — point `PRIVACY_FILTER_MODEL` / checkpoint at the same local files.

## Wire to ClawQL MCP

```bash
CLAWQL_ENABLE_PRIVACY_FILTER=1
CLAWQL_PRIVACY_FILTER_URL=http://127.0.0.1:8091
# Prefer warn so ML miss/outage does not brick the gateway after Presidio
CLAWQL_PRIVACY_FILTER_FAILURE_POLICY=warn
```

Tier 1 Compose:

```bash
cd examples/clawql-local-docker-compose
docker compose -f docker-compose.yml \
  -f docker-compose.presidio.override.yml \
  -f docker-compose.privacy-filter.override.yml up -d
```

## Data flow

```
raw text → (optional) Presidio analyzer/anonymizer → (optional) Privacy Filter /redact → downstream
```

Presidio remains the primary NER/anonymizer. Privacy Filter is a **second local pass** for spans Presidio missed. Either layer can run alone.

## Threat model (short)

- **Does:** Keep unmasked text on-operator network; mask spans matching the sidecar taxonomy before vault/execute persistence.
- **Does not:** Guarantee legal anonymization, cover every PII definition, or replace DLP / Stirling document redaction.
- **Failure:** Default `warn` returns original text if the sidecar is down (after logging). Set `block` to fail closed.

Full write-up: [`docs/security/privacy-filter-local.md`](../../../docs/security/privacy-filter-local.md).

## Smoke

```bash
./deployment/samples/privacy-filter-http/smoke.sh
```
