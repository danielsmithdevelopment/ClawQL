# Inference gateway quick start

Run the **OpenAI-compatible** `clawql-inference` gateway with operator policy in YAML instead of dozens of env vars.

**Getting started:** [`docs/getting-started/inference.md`](../../docs/getting-started/inference.md) · **Reference:** [`docs/inference/clawql-inference.md`](../../docs/inference/clawql-inference.md) · **Package:** [`packages/clawql-inference`](../../packages/clawql-inference)

## 1. Create `CLAWQL_HOME`

```bash
export CLAWQL_HOME="${CLAWQL_HOME:-$HOME/.clawql}"
mkdir -p "$CLAWQL_HOME/Inference"
```

## 2. Install the policy manifest

Copy the example policy (edit tier models and toggles as needed):

```bash
cp examples/inference/policy.yaml "$CLAWQL_HOME/Inference/policy.yaml"
```

Or point at this repo copy:

```bash
export CLAWQL_INFERENCE_POLICY_MANIFEST="$(pwd)/examples/inference/policy.yaml"
```

**Merge rule:** manifest defaults apply first; any matching `CLAWQL_*` env var overrides the YAML.

## 3. Set provider credentials

At minimum, configure a provider your tier map can reach:

```bash
# OpenAI (also used for embeddings when semantic cache is enabled)
export OPENAI_API_KEY=sk-...

# and/or local Ollama (default frugal tier in policy.yaml)
export OLLAMA_BASE_URL=http://127.0.0.1:11434
```

## 4. Verify effective policy

```bash
clawql inference policy show
# policy_source: manifest+env
# manifest_path: .../Inference/policy.yaml
```

Use `--json` for the full merged view (escalation, cache, layers, observability).

## 5. Start the gateway

```bash
clawql inference serve --port 8080
# or: npx clawql-inference
```

Point any OpenAI client at the gateway:

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8080/v1
export OPENAI_API_KEY=sk-...   # or a virtual key when keys.enabled: true
```

```bash
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"ollama/phi4","messages":[{"role":"user","content":"Say hi in one sentence."}]}'
```

## 6. Optional: Postgres + multi-replica pipeline

When `CLAWQL_INFERENCE_DATABASE_URL` is set, semantic cache can use pgvector and the pipeline worker uses Postgres advisory locks so only one replica runs each cron tick.

```bash
export CLAWQL_INFERENCE_DATABASE_URL=postgres://user:pass@localhost:5432/clawql_inference
# policy.yaml observability.semanticCacheBackend: postgres
```

Enable the flywheel worker in policy (or env), then configure the pipeline:

```bash
# Edit policy.yaml: pipelineWorker.enabled: true
clawql inference pipeline enable --schedule "0 2 * * 0" --min-samples 50
export CLAWQL_INFERENCE_PIPELINE_WORKER=1   # env override example
clawql inference serve --port 8080
```

## Files under `$CLAWQL_HOME/Inference/`

| File                   | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `policy.yaml`          | Operator policy manifest (this example) |
| `calls.jsonl`          | Call store when `store.backend: jsonl`  |
| `tier-map.json`        | Fine-tune / escalation overrides        |
| `fallback-chains.json` | Persisted fallback chains               |
| `virtual-keys.json`    | Virtual API keys                        |
| `pipeline.json`        | Cron export config                      |

## Next steps

- [Token efficiency layers](../../docs/architecture/clawql-token-efficiency.md)
- [Inference provider plugins](../../docs/plugins/inference-providers.md)
- [Payments / entitlements](../../docs/payments/clawql-payments.md)
