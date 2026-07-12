# clawql-inference

**Status:** Shipped (July 2026)  
**Package:** [`packages/clawql-inference`](../../packages/clawql-inference)

`clawql-inference` is ClawQL's TypeScript-native **inference gateway and model-improvement platform** — a LiteLLM-class layer with ClawQL's trust model: WORM-auditable routing, semantic cache, model tier escalation, agent coordination hooks, verdict-filtered export, and fine-tuning flywheel. It is designed as a **drop-in OpenAI replacement** (`OPENAI_BASE_URL=http://127.0.0.1:8080/v1`) while closing the production loop that generic proxies leave open.

**Related docs:** [Inference provider plugins](../plugins/inference-providers.md) · [Token efficiency (Layer 5 cache)](../architecture/clawql-token-efficiency.md) · [Ouroboros library](../ouroboros/clawql-ouroboros.md)

---

## What it does

| Capability        | Summary                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| **Gateway**       | OpenAI-compatible REST (`/v1/chat/completions`, `/v1/models`, SSE streaming) |
| **Providers**     | Built-in OpenAI, Anthropic, Ollama; extensible plugin registry               |
| **Routing**       | Frugal → standard → frontier tier escalation with kill switches              |
| **Cache**         | Embedding similarity semantic cache (cosine threshold + TTL)                 |
| **Resilience**    | Per-tier / per-model fallback chains before hard failure                     |
| **Auth**          | Virtual keys (per-team budgets, rate limits)                                 |
| **Entitlements**  | Optional plan limits via `clawql-payments`                                   |
| **Observability** | Durable call store, `logs` / `trace` / `spend` CLI                           |
| **Flywheel**      | Verdict-filtered export → fine-tune → register custom model in tier map      |
| **Automation**    | Scheduled pipeline worker (cron export when sample threshold met)            |
| **Ouroboros**     | `model_escalation` + `agent_coordination` audit events in lineage store      |

---

## Architecture overview

### Entry points

| Client                           | Path into the gateway                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **OpenAI SDK / curl**            | Virtual key auth middleware → OpenAI-compat router (`/v1/chat/completions`, `/v1/models`) → gateway stack |
| **`clawql inference complete`**  | Calls the gateway stack directly (no HTTP auth layer)                                                     |
| **Ouroboros `EvolutionaryLoop`** | Calls `ConfiguredInferenceGateway` at the innermost layer (bypasses HTTP)                                 |

### Gateway decorator stack (inner → outer)

Each `complete()` call passes **outward** through these layers before reaching a provider:

1. **`ConfiguredInferenceGateway`** — resolves `provider/model`, invokes the provider adapter
2. **`FallbackChainGateway`** — tries alternate models on primary failure (when fallback enabled)
3. **`SemanticCachedGateway`** — embedding-similarity cache lookup (when semantic cache enabled)
4. **`EntitlementEnforcedGateway`** — plan limit checks via `clawql-payments` (when enforcement enabled)
5. **`ObservedInferenceGateway`** — appends an `InferenceRecord` to the call store

Call order from outside in: **Observed → Entitlement → Cache → Fallback → Configured → provider**.

### Backends

- **Provider plugins** — built-in OpenAI, Anthropic, Ollama; extensible via the plugin registry
- **Inference store** — `memory`, `jsonl`, or `postgres` backend for durable call records and export

### Data flow summary

```
HTTP clients → auth middleware → OpenAI router → [Observed → Entitlement → Cache → Fallback → Configured] → provider plugin
CLI / library callers ──────────────────────────► [same decorator stack] ────────────────────────────────► provider plugin
Ouroboros loop ─────────────────────────────────► ConfiguredInferenceGateway (innermost) ───────────────► provider plugin

ObservedInferenceGateway ──writes──► Inference store (jsonl / postgres / memory)
```

Every successful `complete()` call flows **outward through decorators** and ends in the call store. HTTP clients additionally pass through virtual-key auth before the OpenAI router invokes the same gateway.

---

## Gateway decorator stack

`createInferenceGateway()` composes decorators in this order (inner → outer):

| Layer | Module                       | When active                                          | Behavior                                                      |
| ----- | ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| 1     | `ConfiguredInferenceGateway` | Always                                               | Resolves `provider/model`, calls provider adapter             |
| 2     | `FallbackChainGateway`       | `CLAWQL_INFERENCE_FALLBACK_ENABLED=1` or chains file | Tries alternates on primary failure; sets `response.fallback` |
| 3     | `SemanticCachedGateway`      | `CLAWQL_INFERENCE_SEMANTIC_CACHE=1`                  | Embedding similarity lookup; sets `cacheHit`                  |
| 4     | `EntitlementEnforcedGateway` | `CLAWQL_PAYMENTS_ENFORCE_INFERENCE=1`                | Checks plan limits, records usage                             |
| 5     | `ObservedInferenceGateway`   | Store not `off`                                      | Appends `InferenceRecord` to call store                       |

```typescript
import { createInferenceGateway } from "clawql-inference";

const gateway = createInferenceGateway({ env: process.env });
const result = await gateway.complete({
  model: "anthropic/claude-sonnet-4",
  messages: [{ role: "user", content: "Summarize this spec" }],
  correlationId: "seed_abc_gen_2",
  team: "eng",
});
```

Disable layers via options: `{ semanticCache: false }`, `{ fallback: false }`, `{ store: null }`.

---

## HTTP API layer

### Entry points

| Command                  | Binary                          | Notes                                       |
| ------------------------ | ------------------------------- | ------------------------------------------- |
| `clawql inference serve` | `clawql` CLI                    | Wired via `src/onboarding/inference-cli.ts` |
| `npx clawql-inference`   | `packages/clawql-inference/bin` | Standalone sidecar                          |

`createInferenceHttpApp()` (`packages/clawql-inference/src/api/server.ts`):

1. `express.json()` — 2 MB body limit
2. `GET /healthz` — liveness (no auth)
3. `GET /v1` — capability discovery
4. **`createVirtualKeyAuthMiddleware`** — Bearer / `x-api-key` when keys enabled
5. **`createOpenAiCompatRouter`** — models list + chat completions

### OpenAI-compatible endpoints

| Method | Path                   | Notes                                                 |
| ------ | ---------------------- | ----------------------------------------------------- |
| `GET`  | `/healthz`             | Liveness                                              |
| `GET`  | `/v1/models`           | Tier map + env models + Ollama tags                   |
| `GET`  | `/v1/models/:id`       | Single model                                          |
| `POST` | `/v1/chat/completions` | Bare `gpt-4o` or `provider/model`; `stream: true` SSE |

### Request headers

| Header                                         | Purpose                            |
| ---------------------------------------------- | ---------------------------------- |
| `Authorization: Bearer <key>`                  | Virtual key or upstream-style auth |
| `x-api-key` / `x-clawql-api-key`               | Alternative key header             |
| `x-correlation-id` / `x-clawql-correlation-id` | WORM lineage; echoed on response   |
| `x-clawql-tenant-id`                           | Plan entitlement tenant override   |

### Drop-in OpenAI client

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8080/v1
export OPENAI_API_KEY=<virtual-key-or-upstream-key>
npx clawql-inference
# or: clawql inference serve --port 8080
```

---

## Provider plugins

Built-ins register via `composeDefaultProviderPlugins()` unless allow/denylisted:

| Plugin id   | Adapter           | Credentials                                          |
| ----------- | ----------------- | ---------------------------------------------------- |
| `openai`    | Chat completions  | `OPENAI_API_KEY`, `CLAWQL_OPENAI_BASE_URL`           |
| `anthropic` | Messages API      | `ANTHROPIC_API_KEY`, `CLAWQL_ANTHROPIC_BASE_URL`     |
| `ollama`    | Local `/api/chat` | `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`) |

Model ids use **`provider/model`** (e.g. `ollama/phi4`, `anthropic/claude-sonnet-4`). Bare public ids like `gpt-4o` resolve through the registry when a matching provider is configured.

Third-party plugins use the same `InferenceProviderPlugin` contract — see [Inference provider plugins](../plugins/inference-providers.md). Subpath export: `clawql-inference/plugin`.

| Env                                           | Effect    |
| --------------------------------------------- | --------- |
| `CLAWQL_INFERENCE_PROVIDERS=openai,anthropic` | Allowlist |
| `CLAWQL_INFERENCE_DISABLE_PROVIDERS=ollama`   | Denylist  |

---

## Model tier escalation

`TierEscalationRouter` implements `AdaptiveRouter` with three tiers:

| Tier         | Default model (env override)                                    | Role                         |
| ------------ | --------------------------------------------------------------- | ---------------------------- |
| **frugal**   | `CLAWQL_INFERENCE_MODEL_FRUGAL` → `ollama/phi4`                 | Cheapest / custom fine-tuned |
| **standard** | `CLAWQL_INFERENCE_MODEL_STANDARD` → `groq/llama-3.3-70b`        | Balanced                     |
| **frontier** | `CLAWQL_INFERENCE_MODEL_FRONTIER` → `anthropic/claude-sonnet-4` | Highest capability           |

**Kill switches:**

- Escalation is **off by default** unless `CLAWQL_INFERENCE_ROUTING_ENABLED=1` or `CLAWQL_INFERENCE_MODEL_PIN` is set
- `CLAWQL_INFERENCE_MODEL_PIN=<modelId>` bypasses the ladder

**Tier map overrides** persist at `$CLAWQL_HOME/Inference/tier-map.json` (written by `clawql inference finetune register` or `escalation set-tier`).

```bash
clawql inference escalation show
clawql inference escalation set-tier --tier frugal --model ollama/phi4-custom
```

### Ouroboros integration

When `EvolutionaryLoop` runs with an `AdaptiveRouter`:

1. `router.initialTier()` picks starting tier per seed / decomposed-child context
2. On generation failure (AC fail, low eval score, drift exceeded), `router.escalate()` moves one notch up
3. `model_escalation` audit events append to the Ouroboros Postgres / in-memory event store
4. Correlation id: `{seedId}_gen_{n}`

See [Agent coordination](#agent-coordination) for the Hermes tripwire path.

---

## Semantic cache

Layer 5 in [token efficiency](../architecture/clawql-token-efficiency.md). Enabled with `CLAWQL_INFERENCE_SEMANTIC_CACHE=1`.

| Setting                              | Default                  | Purpose                 |
| ------------------------------------ | ------------------------ | ----------------------- |
| `CLAWQL_INFERENCE_CACHE_THRESHOLD`   | `0.92`                   | Cosine similarity floor |
| `CLAWQL_INFERENCE_CACHE_TTL`         | `24h`                    | Entry TTL               |
| `CLAWQL_INFERENCE_CACHE_MAX_ENTRIES` | `1000`                   | In-memory cap           |
| `CLAWQL_EMBEDDING_MODEL`             | `text-embedding-3-small` | Embedding model         |

Cache hits return stored responses with `cacheHit: true` on inference records. Embedding failures **fail open** to live inference.

```bash
clawql inference cache   # show active config
```

---

## Fallback chains

When the primary provider/model fails, try configured alternates before surfacing an error.

```bash
export CLAWQL_INFERENCE_FALLBACK_ENABLED=1
export CLAWQL_INFERENCE_FALLBACK_FRUGAL=ollama/phi4,openai/gpt-4o-mini
export CLAWQL_INFERENCE_FALLBACK_STANDARD=groq/llama-3.3-70b,anthropic/claude-haiku-4
```

Chains also persist at `$CLAWQL_HOME/Inference/fallback-chains.json` (`byTier` / `byModel`). Responses include `fallback.attempted` and `fallback.succeeded`.

```bash
clawql inference fallback
```

---

## Virtual keys and HTTP auth

Per-team API keys with optional USD budgets and rate limits (`100rpm`, `10rps`).

```bash
export CLAWQL_INFERENCE_KEYS_ENABLED=1
clawql inference keys create --team eng --budget-usd 500 --rate-limit 100rpm
clawql inference keys list
clawql inference keys revoke --id vk_abc123
```

Keys persist at `$CLAWQL_HOME/Inference/virtual-keys.json` (secrets stored as SHA-256 hashes only). When enforcement is active, `/v1/*` requires a valid key; `/healthz` stays open.

`team` and `virtualKeyId` are stamped on inference records; spend rollups support `--group-by team`.

---

## Plan entitlements and payments (`clawql-payments`)

The inference HTTP server integrates with [`clawql-payments`](../payments/clawql-payments.md) for three **independent** billing modes:

| Mode              | Toggle                                  | Behavior                                                                |
| ----------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| Plan entitlements | `CLAWQL_PAYMENTS_ENFORCE_INFERENCE=1`   | Pre-check monthly caps; 402 `insufficient_quota` when over limit        |
| Stripe meters     | `CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1` | Post-call `meterEvents.create` (requires Dashboard meter + customer id) |
| x402 pay-per-call | `CLAWQL_X402_ENFORCE=1`                 | Middleware returns 402 until facilitator verifies `PAYMENT-SIGNATURE`   |

When plan enforcement is enabled, the gateway checks limits before each completion and increments `inference_calls` in `usage.json` after success. Tenant resolution order:

1. `x-clawql-tenant-id` header
2. Virtual key `team`
3. `$CLAWQL_HOME/Payments/payments.json` default tenant

Limit breaches throw `EntitlementLimitError` (HTTP 402-shaped OpenAI error) and append a WORM payment audit entry.

**Middleware order** in `createInferenceHttpApp()`: x402 payment middleware → virtual key auth → OpenAI-compat router.

**Do not conflate** plan usage (`usage.json`), inference call-store tokens (`clawql inference spend`), and virtual-key USD budgets — see [Three usage systems](../payments/clawql-payments.md#three-usage-systems-do-not-conflate).

```bash
export CLAWQL_PAYMENTS_ENFORCE_INFERENCE=1
export CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1
export STRIPE_METER_EVENT_NAME=clawql_inference_calls
export CLAWQL_X402_ENFORCE=1

clawql payments plan show
clawql inference serve --port 8080
```

---

## Inference call store

Every successful completion writes an `InferenceRecord` used by observability **and** export.

### Backends

| `CLAWQL_INFERENCE_STORE` | Behavior                                          |
| ------------------------ | ------------------------------------------------- |
| `off`                    | No persistence                                    |
| `memory`                 | In-process (tests)                                |
| `jsonl`                  | Append-only file (default when `CLAWQL_HOME` set) |
| `postgres`               | `clawql_inference_calls` table (JSONB records)    |

Postgres: `CLAWQL_INFERENCE_DATABASE_URL` or split `CLAWQL_INFERENCE_DB_*` vars. Default JSONL path: `$CLAWQL_HOME/Inference/calls.jsonl`.

### Record fields

| Field                          | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `id`, `correlation_id`         | Link to WORM / Ouroboros generation                      |
| `timestamp`                    | Export date-range filters                                |
| `model_id`, `provider`, `tier` | Model and escalation tier at call time                   |
| `team`, `virtual_key_id`       | Virtual key attribution                                  |
| `messages`, `response`         | Fine-tuning message pairs                                |
| `usage`                        | Token counts                                             |
| `latency_ms`                   | Quality filtering                                        |
| `cache_hit`                    | Cost attribution                                         |
| `routing`                      | `ModelEscalationDecision` snapshot                       |
| `evaluator_verdict`            | `passed` / `failed` / `none` — **primary export filter** |
| `evaluator_score`              | Confidence floor filters                                 |
| `policy_version`               | Manifest Merkle anchor (when set)                        |

### Observability CLI

```bash
clawql inference logs [--model M] [--tier T] [--since 24h] [--limit 50]
clawql inference spend [--group-by model|tier|team|provider] [--since 7d]
clawql inference trace --correlation-id <id>
```

---

## Export and fine-tuning flywheel

```text
Production traffic
  → WORM-logged inference (prompt, response, tier, verdict, correlation_id)
  → Evaluator verdicts + quality filters
  → PII-scrubbed dataset export (JSONL)
  → Fine-tuning job (Anthropic / OpenAI)
  → Custom model registered in ModelTierMap
  → Deployed to Frugal tier
  → Better cheap-tier results → better verdicts → better training data
```

LiteLLM routes inference. ClawQL closes the loop: **infer → observe → evaluate → export → fine-tune → redeploy**.

### Export

```bash
clawql inference export \
  --output ./training-data/export.jsonl \
  --verdict passed \
  --tier frugal \
  --format openai-jsonl \
  --min-score 0.8
```

| Format            | Target                    |
| ----------------- | ------------------------- |
| `openai-jsonl`    | OpenAI fine-tuning        |
| `anthropic-jsonl` | Anthropic fine-tuning     |
| `raw-jsonl`       | Full inference records    |
| `sharegpt`        | Community tooling interop |

**PII scrubbing** (Presidio) is on by default. Every export writes a **WORM dataset manifest** (sample hashes, filter criteria, Merkle root, policy version).

### Fine-tune and register

```bash
clawql inference finetune \
  --dataset ./training-data/export.jsonl \
  --base-model gpt-4o-mini \
  --provider openai

clawql inference finetune status --job-id ftjob_abc123
clawql inference finetune register --job-id ftjob_abc123 --tier frugal --alias ollama/phi4-production-v3
```

---

## Pipeline automation

Scheduled auto-export when sample thresholds are met.

```bash
clawql inference pipeline enable \
  --schedule "0 2 * * 0" \
  --min-samples 500 \
  --verdict passed \
  --target-tier frugal \
  --base-model gpt-4o-mini

clawql inference pipeline status
clawql inference pipeline run          # manual trigger
clawql inference pipeline worker       # cron sidecar
```

Config persists at `$CLAWQL_HOME/Inference/pipeline.json`. Cron worker:

- `CLAWQL_INFERENCE_PIPELINE_WORKER=1` — starts with `inference serve`
- `CLAWQL_INFERENCE_PIPELINE_POLL_MS` — poll interval (default 60s)
- Tracks `lastRunAt`, `lastRunStatus`, `lastRunDetail` on each tick

---

## Agent coordination

`TierEscalationRouter.shouldTriggerAgentCoordination()` fires when:

- Combined drift exceeds **0.3**, or
- Standard-tier exhaustion with active failure signals

When `CLAWQL_INFERENCE_AGENT_COORDINATION_ENABLED=1`:

1. `evaluateAgentCoordination()` builds an `agent_coordination` audit entry
2. Hermes stub runs when `HERMES_BASE_URL` is unset; live MoA when configured
3. Ouroboros appends the event to the lineage store alongside `model_escalation`

---

## Policy

```bash
clawql inference policy show [--json]
```

`resolveInferencePolicy()` aggregates the effective view from environment: escalation, cache, fallback, keys, store backend, export defaults, pipeline worker, and agent coordination. Manifest YAML overrides are planned; today the source is **`env`**.

---

## Persistence layout

All operator state under `$CLAWQL_HOME/Inference/`:

| File                   | Written by                                 |
| ---------------------- | ------------------------------------------ |
| `calls.jsonl`          | Call store (jsonl backend)                 |
| `tier-map.json`        | `finetune register`, `escalation set-tier` |
| `fallback-chains.json` | Fallback config merge                      |
| `virtual-keys.json`    | `keys create` / `revoke`                   |
| `pipeline.json`        | `pipeline enable` / worker ticks           |

Postgres store uses `clawql_inference_calls` (separate from `CLAWQL_INFERENCE_DATABASE_URL`).

---

## CLI wiring

The `clawql` binary dispatches `inference` subcommands in `src/onboarding/cli.ts` → thin wrappers in `src/onboarding/inference-cli.ts` → `packages/clawql-inference/src/cli/*`.

```
clawql inference <subcommand>
├── serve              HTTP gateway (+ optional pipeline worker)
├── complete           One-shot completion
├── logs | trace | spend
├── export | finetune [status|register]
├── escalation [show|set-tier]
├── pipeline [enable|status|disable|run|worker]
├── cache | fallback | policy
└── keys [create|list|revoke]
```

---

## Environment variables

| Variable                                      | Default                              | Purpose                                 |
| --------------------------------------------- | ------------------------------------ | --------------------------------------- |
| `OPENAI_API_KEY`                              | —                                    | OpenAI provider                         |
| `ANTHROPIC_API_KEY`                           | —                                    | Anthropic provider                      |
| `OLLAMA_BASE_URL`                             | `http://127.0.0.1:11434`             | Ollama runtime                          |
| `CLAWQL_INFERENCE_PORT`                       | `8080`                               | HTTP listen port                        |
| `CLAWQL_INFERENCE_HOST`                       | `0.0.0.0`                            | HTTP bind address                       |
| `CLAWQL_INFERENCE_PROVIDERS`                  | all builtins                         | Provider allowlist                      |
| `CLAWQL_INFERENCE_DISABLE_PROVIDERS`          | —                                    | Provider denylist                       |
| `CLAWQL_INFERENCE_ROUTING_ENABLED`            | off                                  | Tier escalation                         |
| `CLAWQL_INFERENCE_MODEL_FRUGAL`               | `ollama/phi4`                        | Frugal tier model                       |
| `CLAWQL_INFERENCE_MODEL_STANDARD`             | `groq/llama-3.3-70b`                 | Standard tier model                     |
| `CLAWQL_INFERENCE_MODEL_FRONTIER`             | `anthropic/claude-sonnet-4`          | Frontier tier model                     |
| `CLAWQL_INFERENCE_MODEL_PIN`                  | —                                    | Pin single model                        |
| `CLAWQL_INFERENCE_SEMANTIC_CACHE`             | off                                  | Semantic cache                          |
| `CLAWQL_INFERENCE_CACHE_THRESHOLD`            | `0.92`                               | Cache similarity floor                  |
| `CLAWQL_INFERENCE_CACHE_TTL`                  | `24h`                                | Cache TTL                               |
| `CLAWQL_INFERENCE_CACHE_MAX_ENTRIES`          | `1000`                               | Cache size cap                          |
| `CLAWQL_EMBEDDING_MODEL`                      | `text-embedding-3-small`             | Embeddings model                        |
| `CLAWQL_INFERENCE_FALLBACK_ENABLED`           | off                                  | Fallback chains                         |
| `CLAWQL_INFERENCE_FALLBACK_FRUGAL`            | —                                    | Frugal fallback chain                   |
| `CLAWQL_INFERENCE_FALLBACK_STANDARD`          | —                                    | Standard fallback chain                 |
| `CLAWQL_INFERENCE_FALLBACK_FRONTIER`          | —                                    | Frontier fallback chain                 |
| `CLAWQL_INFERENCE_KEYS_ENABLED`               | off                                  | Require virtual keys                    |
| `CLAWQL_INFERENCE_STORE`                      | jsonl when `CLAWQL_HOME`             | `memory` / `jsonl` / `postgres` / `off` |
| `CLAWQL_INFERENCE_DATABASE_URL`               | —                                    | Postgres URL                            |
| `CLAWQL_INFERENCE_STORE_PATH`                 | `$CLAWQL_HOME/Inference/calls.jsonl` | JSONL path override                     |
| `CLAWQL_INFERENCE_PIPELINE_WORKER`            | off                                  | Cron worker with serve                  |
| `CLAWQL_INFERENCE_PIPELINE_POLL_MS`           | `60000`                              | Worker poll interval                    |
| `CLAWQL_INFERENCE_AGENT_COORDINATION_ENABLED` | off                                  | Agent coordination                      |
| `HERMES_BASE_URL`                             | —                                    | Hermes MoA endpoint                     |
| `CLAWQL_PAYMENTS_ENFORCE_INFERENCE`           | off                                  | Plan entitlement gate                   |

---

## Package exports

| Import                        | Contents                                                          |
| ----------------------------- | ----------------------------------------------------------------- |
| `clawql-inference`            | Gateway, routing, store, CLI runners, HTTP server, audit builders |
| `clawql-inference/routing`    | `AdaptiveRouter`, tier types, config loaders                      |
| `clawql-inference/plugin`     | Provider plugin factories, compose helpers                        |
| `clawql-inference/api/server` | `createInferenceHttpApp` for embedding                            |

---

## Differentiation vs LiteLLM

| ClawQL                                                    | LiteLLM-class proxies   |
| --------------------------------------------------------- | ----------------------- |
| Outcome-driven tier escalation from agent failure signals | Static model routing    |
| `correlation_id` → WORM / Ouroboros lineage               | Generic request logs    |
| Verdict-filtered export + PII scrub + dataset manifest    | Ad-hoc dataset dumps    |
| Custom models promoted back into frugal tier              | One-off fine-tunes      |
| Manifest / policy-governed tier map and export rules      | Env-only config         |
| TypeScript-native, catalog-mirrored adapters              | Python proxy dependency |

---

## Implementation phasing

| Phase    | Deliverable                                                         | Status |
| -------- | ------------------------------------------------------------------- | ------ |
| P0-D     | `routing/` + Ouroboros hooks                                        | ✅     |
| P0-F     | Gateway MVP: `serve`, `complete`, provider adapters                 | ✅     |
| P0-G     | Call store + `logs` / `trace` / `spend`                             | ✅     |
| P0-H     | Export + Presidio + dataset manifest                                | ✅     |
| P0-I     | Fine-tune jobs + tier registration                                  | ✅     |
| P1       | Pipeline enable + cron worker                                       | ✅     |
| P1       | Model escalation audit                                              | ✅     |
| P1       | Agent coordination                                                  | ✅     |
| Adoption | OpenAI REST, semantic cache, fallback, virtual keys, Postgres store | ✅     |

### Planned (not blockers)

- Langfuse / OpenTelemetry full wiring (ADR 0005)
- Manifest YAML inference block overrides for `policy show`
- Live Hermes MoA HTTP client (stub ships today)
- Postgres advisory locks for multi-instance pipeline dedup

---

## References

- [Inference provider plugins](../plugins/inference-providers.md)
- [Token efficiency architecture](../architecture/clawql-token-efficiency.md)
- [Ouroboros library](../ouroboros/clawql-ouroboros.md)
- [Upstream Q00 sync roadmap](../ouroboros/upstream-q00-sync-roadmap.md)
