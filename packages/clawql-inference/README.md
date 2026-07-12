# clawql-inference

TypeScript-native **inference gateway** for ClawQL: model tier escalation, cloud provider adapters, local runtimes (Ollama / vLLM / Llama.cpp), semantic caching, and WORM-auditable observability.

**Status:** Gateway MVP + export/finetune — model tier escalation (#560), provider plugins, call store, dataset export, and fine-tune job API.

Built-in provider plugins (OpenAI, Anthropic, Ollama) register automatically. Third parties add backends via `InferenceProviderPlugin` — see [`docs/plugins/inference-providers.md`](../../docs/plugins/inference-providers.md).

## Drop-in OpenAI replacement

Point any OpenAI SDK or tool at ClawQL inference — **no code changes**:

```bash
export OPENAI_API_KEY=sk-...          # or ANTHROPIC_API_KEY / OLLAMA_BASE_URL
export OPENAI_BASE_URL=http://127.0.0.1:8080/v1

# Standalone gateway (npm package bin)
npx clawql-inference
# or via clawql CLI
clawql inference serve --port 8080
```

**Endpoints** (OpenAI-compatible):

| Method | Path                   | Notes                                                 |
| ------ | ---------------------- | ----------------------------------------------------- |
| `GET`  | `/healthz`             | Liveness                                              |
| `GET`  | `/v1/models`           | Tier map + `CLAWQL_INFERENCE_MODELS` + Ollama tags    |
| `GET`  | `/v1/models/:id`       | Single model                                          |
| `POST` | `/v1/chat/completions` | Bare `gpt-4o` or `provider/model`; `stream: true` SSE |

```bash
# Same request shape as OpenAI — bare model id works
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'

# Streaming
curl -N http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}],"stream":true}'
```

Set `X-Correlation-Id` on requests for WORM lineage; echoed on responses.

## Semantic cache

Skip repeat model calls when prompts are semantically similar (Layer 5 in [token efficiency](../../docs/architecture/clawql-token-efficiency.md)):

```bash
export CLAWQL_INFERENCE_SEMANTIC_CACHE=1
export OPENAI_API_KEY=sk-...   # embeddings use same key (or CLAWQL_EMBEDDING_API_KEY)
export CLAWQL_INFERENCE_CACHE_THRESHOLD=0.92   # cosine similarity floor (default 0.92)
export CLAWQL_INFERENCE_CACHE_TTL=24h        # entry TTL (default 24h)

clawql inference cache    # show active config
clawql inference serve
```

Cache hits return stored responses with `cache_hit: true` in the call store. Embedding API failures fail open to live inference.

## Fallback chains

Try alternate providers/models within the same tier before surfacing an error — pairs with model tier escalation:

```bash
export CLAWQL_INFERENCE_FALLBACK_ENABLED=1
export CLAWQL_INFERENCE_FALLBACK_FRUGAL=ollama/phi4,openai/gpt-4o-mini
export CLAWQL_INFERENCE_FALLBACK_STANDARD=groq/llama-3.3-70b,anthropic/claude-haiku-4

# Or persist chains at $CLAWQL_HOME/Inference/fallback-chains.json
clawql inference fallback
clawql inference serve
```

Responses include `fallback.attempted` and `fallback.succeeded` when a backup model handles the request.

## Virtual keys

Issue per-team API keys with optional USD budgets and rate limits. Keys persist at `$CLAWQL_HOME/Inference/virtual-keys.json`:

```bash
export CLAWQL_INFERENCE_KEYS_ENABLED=1

clawql inference keys create --team eng --budget-usd 500 --rate-limit 100rpm
clawql inference keys list
clawql inference keys revoke --id vk_abc123

# Clients authenticate like OpenAI (Bearer or x-api-key)
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer <virtual-key>" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'

# Spend by team
clawql inference spend --group-by team
```

When keys are enabled (or any active key exists), `/v1/*` requires a valid virtual key. `/healthz` stays open.

## Plan entitlements (`clawql-payments`)

When enabled, inference calls check the tenant's managed plan limits from `clawql-payments` before executing. Over-limit tenants receive **402 `insufficient_quota`** (OpenAI-compatible error shape), not a silent failure.

```bash
export CLAWQL_PAYMENTS_ENFORCE_INFERENCE=1

clawql payments plan show
clawql payments usage report

# Hosted ClawQL sets CLAWQL_PAYMENTS_ENFORCE_INFERENCE=1 on managed tiers.
# Virtual key team maps to the payments tenant id for per-team usage tracking.
```

Tenant resolution order: `InferenceRequest.tenantId` → virtual key `team` → `payments.json` `tenantId` → `"default"`.

Streaming requests that bypass the gateway (provider-native SSE) are still entitlement-checked at the HTTP layer.

## x402 micropayments (`clawql-payments`)

When `CLAWQL_X402_ENFORCE=1`, gated HTTP paths (e.g. `/v1/chat/completions`) return **402 Payment Required** with x402 v2 `PAYMENT-REQUIRED` until the configured facilitator verifies the client's payment header.

```bash
export CLAWQL_X402_ENFORCE=1
export CLAWQL_X402_FACILITATOR_URL=https://x402.org/facilitator

clawql payments x402 wallet setup --address 0x...
clawql payments x402 gate --resource /v1/chat/completions --price 0.001
clawql inference serve --port 8080
```

Use `X-Clawql-Tool` to gate MCP tool names over HTTP (`tool:knowledge_search`).

## Quick start

```bash
# One-shot completion (requires provider credentials)
export OPENAI_API_KEY=sk-...
clawql inference complete --model openai/gpt-4o --message "Summarize this spec"

# OpenAI-compatible HTTP gateway
clawql inference serve --port 8080
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"openai/gpt-4o","messages":[{"role":"user","content":"hi"}]}'

# Export evaluator-passed samples for fine-tuning
clawql inference export --output ./training.jsonl --verdict passed --format openai-jsonl

# Submit fine-tune job (OpenAI)
clawql inference finetune --dataset ./training.jsonl --base-model gpt-4o-mini --provider openai
```

## Model tier escalation

```typescript
import {
  createModelEscalationRouter,
  loadModelEscalationConfig,
  type ModelEscalationDecision,
} from "clawql-inference";

const router = createModelEscalationRouter(loadModelEscalationConfig(process.env));
const decision = router?.initialTier({ isDecomposedChild: false, seedId: "seed_root" });
```

## Gateway

```typescript
import { createInferenceGateway } from "clawql-inference";

const gateway = createInferenceGateway();
const result = await gateway.complete({
  model: "anthropic/claude-sonnet-4",
  messages: [{ role: "user", content: "hello" }],
});
```

## Provider plugins

```typescript
import {
  composeProviderPlugins,
  createInferenceGateway,
  createProviderRegistry,
  type InferenceProviderPlugin,
} from "clawql-inference";

// Built-ins register automatically; append custom plugins:
const gateway = createInferenceGateway({
  providers: createProviderRegistry({
    plugins: composeProviderPlugins({ extensions: [myGroqPlugin] }),
  }),
});
```

Subpath: `clawql-inference/plugin` for builtin factories and compose helpers.

### Environment

| Variable                                      | Default                      | Purpose                                              |
| --------------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| `CLAWQL_INFERENCE_PROVIDERS`                  | all builtins                 | Allowlist provider plugins (comma-separated ids)     |
| `CLAWQL_INFERENCE_DISABLE_PROVIDERS`          | —                            | Denylist provider plugins                            |
| `OPENAI_API_KEY`                              | —                            | OpenAI chat completions                              |
| `ANTHROPIC_API_KEY`                           | —                            | Anthropic messages API                               |
| `OLLAMA_BASE_URL`                             | `http://127.0.0.1:11434`     | Local Ollama runtime                                 |
| `CLAWQL_INFERENCE_PORT`                       | `8080`                       | `clawql inference serve` listen port                 |
| `CLAWQL_INFERENCE_ROUTING_ENABLED`            | off                          | Enable frugal → standard → frontier escalation       |
| `CLAWQL_INFERENCE_MODEL_FRUGAL`               | `ollama/phi4`                | Frugal tier model id                                 |
| `CLAWQL_INFERENCE_MODEL_STANDARD`             | `groq/llama-3.3-70b`         | Standard tier model id                               |
| `CLAWQL_INFERENCE_MODEL_FRONTIER`             | `anthropic/claude-sonnet-4`  | Frontier tier model id                               |
| `CLAWQL_INFERENCE_MODEL_PIN`                  | —                            | Pin a single model (bypasses ladder)                 |
| `CLAWQL_INFERENCE_SEMANTIC_CACHE`             | off                          | Enable embedding similarity cache                    |
| `CLAWQL_INFERENCE_CACHE_THRESHOLD`            | `0.92`                       | Cosine similarity floor for cache hits               |
| `CLAWQL_INFERENCE_CACHE_TTL`                  | `24h`                        | Cache entry TTL (`24h`, `7d`, or `_MS` variant)      |
| `CLAWQL_INFERENCE_CACHE_MAX_ENTRIES`          | `1000`                       | In-memory cache size cap                             |
| `CLAWQL_EMBEDDING_MODEL`                      | `text-embedding-3-small`     | Embeddings model for semantic cache                  |
| `CLAWQL_INFERENCE_FALLBACK_ENABLED`           | off                          | Enable per-tier / per-model fallback chains          |
| `CLAWQL_INFERENCE_FALLBACK_FRUGAL`            | —                            | Comma-separated fallback chain for frugal tier       |
| `CLAWQL_INFERENCE_FALLBACK_STANDARD`          | —                            | Fallback chain for standard tier                     |
| `CLAWQL_INFERENCE_FALLBACK_FRONTIER`          | —                            | Fallback chain for frontier tier                     |
| `CLAWQL_INFERENCE_KEYS_ENABLED`               | off                          | Require virtual keys on `/v1/*` (or when keys exist) |
| `CLAWQL_INFERENCE_STORE`                      | jsonl when `CLAWQL_HOME` set | Inference call store: memory, jsonl, postgres        |
| `CLAWQL_INFERENCE_DATABASE_URL`               | —                            | Postgres URL when store=postgres                     |
| `CLAWQL_INFERENCE_PIPELINE_WORKER`            | off                          | Start cron worker with `inference serve`             |
| `CLAWQL_INFERENCE_AGENT_COORDINATION_ENABLED` | off                          | Enable Hermes coordination stub (#562)               |
| `HERMES_BASE_URL`                             | —                            | Hermes MoA endpoint when coordination enabled        |

Model ids use `provider/model` (e.g. `ollama/phi4`, `anthropic/claude-sonnet-4`).

## Consumers

- **`clawql-ouroboros`** — optional `AdaptiveRouter` on the evolutionary loop
- **`clawql-api`** — execute path (planned)
- **`clawql-automation`** — scheduled workflows (planned)

## Roadmap

See [clawql-inference on docs.clawql.com](https://docs.clawql.com/inference/clawql-inference) for the full gateway reference, architecture, and wiring guide.

Epic [#556](https://github.com/danielsmithdevelopment/ClawQL/issues/556).
