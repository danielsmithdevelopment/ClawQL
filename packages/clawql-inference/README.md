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

| Variable                             | Default                     | Purpose                                          |
| ------------------------------------ | --------------------------- | ------------------------------------------------ |
| `CLAWQL_INFERENCE_PROVIDERS`         | all builtins                | Allowlist provider plugins (comma-separated ids) |
| `CLAWQL_INFERENCE_DISABLE_PROVIDERS` | —                           | Denylist provider plugins                        |
| `OPENAI_API_KEY`                     | —                           | OpenAI chat completions                          |
| `ANTHROPIC_API_KEY`                  | —                           | Anthropic messages API                           |
| `OLLAMA_BASE_URL`                    | `http://127.0.0.1:11434`    | Local Ollama runtime                             |
| `CLAWQL_INFERENCE_PORT`              | `8080`                      | `clawql inference serve` listen port             |
| `CLAWQL_INFERENCE_ROUTING_ENABLED`   | off                         | Enable frugal → standard → frontier escalation   |
| `CLAWQL_INFERENCE_MODEL_FRUGAL`      | `ollama/phi4`               | Frugal tier model id                             |
| `CLAWQL_INFERENCE_MODEL_STANDARD`    | `groq/llama-3.3-70b`        | Standard tier model id                           |
| `CLAWQL_INFERENCE_MODEL_FRONTIER`    | `anthropic/claude-sonnet-4` | Frontier tier model id                           |
| `CLAWQL_INFERENCE_MODEL_PIN`         | —                           | Pin a single model (bypasses ladder)             |

Model ids use `provider/model` (e.g. `ollama/phi4`, `anthropic/claude-sonnet-4`).

## Consumers

- **`clawql-ouroboros`** — optional `AdaptiveRouter` on the evolutionary loop
- **`clawql-api`** — execute path (planned)
- **`clawql-automation`** — scheduled workflows (planned)

## Roadmap

See [`docs/inference/clawql-inference.md`](../../docs/inference/clawql-inference.md) for export/finetune flywheel, observability store, and module phasing.

Epic [#556](https://github.com/danielsmithdevelopment/ClawQL/issues/556).
