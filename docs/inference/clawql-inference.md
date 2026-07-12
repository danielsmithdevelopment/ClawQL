# clawql-inference

**Status:** Foundation (July 2026)  
**Package:** [`packages/clawql-inference`](../../packages/clawql-inference)  
**Epic:** [#556](https://github.com/danielsmithdevelopment/ClawQL/issues/556)

`clawql-inference` is ClawQL's TypeScript-native **inference gateway and model-improvement platform** — a LiteLLM-class layer built with ClawQL's trust model: Manifest-governed policies, WORM-auditable routing decisions, semantic cache backed by existing memory/Onyx infrastructure, **model tier escalation** + **agent coordination** integrated from day one, and **production-to-fine-tuning export** with PII scrubbing and provenance manifests.

## The flywheel

```
Production traffic
  → WORM-logged inference (prompt, response, tier, verdict, correlation_id)
  → Evaluator verdicts + quality filters
  → PII-scrubbed dataset export (JSONL)
  → Fine-tuning job (Anthropic / OpenAI / Together)
  → Custom model registered in ModelTierMap
  → Deployed to Frugal tier
  → Better cheap-tier results → better verdicts → better training data
```

LiteLLM routes inference. ClawQL closes the loop: **infer → observe → evaluate → export → fine-tune → redeploy**.

## Shipped today (#560, gateway MVP, export/finetune)

- **`AdaptiveRouter`** / **`TierEscalationRouter`** — frugal → standard → frontier, one-notch escalation
- **Tier map** from environment (off by default); **`tier-map.json`** overrides after `finetune register`
- **Kill switches** — escalation disabled unless explicitly enabled; optional model pin
- **`ConfiguredInferenceGateway`** — provider plugin registry + routing to `provider/model` backends
- **Provider plugins** — OpenAI, Anthropic, Ollama built-ins via `composeDefaultProviderPlugins()`; third-party extensions use the same contract ([inference providers plugin](../plugins/inference-providers.md))
- **`clawql inference serve`** — OpenAI-compatible `/v1/chat/completions` + `/healthz`
- **`clawql inference logs` / `trace` / `spend`** — query the call store by model, `correlation_id`, or token rollup
- **`clawql inference export`** — verdict-filtered JSONL + Presidio scrub + WORM dataset manifest
- **`clawql inference finetune`** — OpenAI / Anthropic job submit, status, and tier registration
- **Call store** — JSONL at `$CLAWQL_HOME/Inference/calls.jsonl` (or `memory` / `off` via env)

## Planned modules

| Module           | Scope                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `routing/`       | Model tier escalation + `ModelTierMap` (**shipped** foundation)                                     |
| `providers/`     | **Provider plugins** — builtins (OpenAI, Anthropic, Ollama) + optional extensions (**shipped** MVP) |
| `local/`         | Ollama, vLLM, Llama.cpp                                                                             |
| `cache/`         | Semantic cache (embedding similarity, Manifest TTL)                                                 |
| `observability/` | Langfuse (ADR 0005), OpenTelemetry, WORM `correlation_id`                                           |
| `fallback/`      | Per-tier provider chains                                                                            |
| `keys/`          | Virtual keys, per-team budgets                                                                      |
| `api/`           | OpenAI-compatible `/v1/chat/completions`                                                            |
| `store/`         | Inference call log (Postgres) — prompt, response, tier, tokens, verdict                             |
| `export/`        | Filtered dataset export + PII scrub (Presidio) + WORM dataset manifests                             |
| `finetune/`      | Job submission, status polling, model registration back into tier map                               |
| `cli/`           | `clawql inference` subcommands (see below)                                                          |

## Inference record (what every call captures)

Each completed inference writes a durable record used by observability **and** export:

| Field                              | Purpose                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `id`, `correlation_id`             | Link to WORM / agent lineage / ouroboros generation      |
| `timestamp`                        | Export date-range filters                                |
| `model_id`, `provider`, `tier`     | Model and escalation tier at call time                   |
| `messages` / `prompt` / `response` | Fine-tuning message pairs                                |
| `system_prompt_hash`               | Cache key + dataset dedup                                |
| `usage`                            | `input_tokens`, `output_tokens`, estimated cost          |
| `latency_ms`                       | Quality filtering                                        |
| `cache_hit`                        | Cost attribution                                         |
| `model_escalation_decision`        | Tier, `escalated_from`, failure `trigger`                |
| `evaluator_verdict`                | `passed` / `failed` / `none` — **primary export filter** |
| `evaluator_score`                  | Confidence / quality filters                             |
| `policy_version`                   | Manifest Merkle anchor at call time                      |

Export only includes rows matching filters **after** optional Presidio scrubbing.

## Dataset export

**Verdict-filtered export** is the default insight: train on **Evaluator-passed** examples, not noise.

Supported export formats:

| Format            | Target                                         |
| ----------------- | ---------------------------------------------- |
| `openai-jsonl`    | OpenAI fine-tuning (`messages` array per line) |
| `anthropic-jsonl` | Anthropic fine-tuning message format           |
| `raw-jsonl`       | Full inference record for custom pipelines     |
| `sharegpt`        | Optional community tooling interop             |

**WORM-anchored dataset manifest** (written alongside every export):

- SHA-256 per sample line
- Filter criteria (model, tier, verdict, date range, score floor, …)
- Row count, byte size, Merkle root of sample hashes
- `policy_version` and export timestamp
- Proves exactly what data trained a model under which policy

**PII scrubbing:** Presidio pass over every exported sample before write — **on by default**, disable only with explicit operator flag.

## `clawql inference` CLI surface

Top-level group under the existing `clawql` binary (`src/onboarding/inference-cli.ts` → `packages/clawql-inference/cli/`).

```
clawql inference <subcommand> [options]
```

### Gateway & model escalation

```bash
# Start OpenAI-compatible gateway (local or sidecar)
clawql inference serve [--port 8080] [--config manifest.yaml]

# Inspect tier map and active escalation policy
clawql inference escalation show
clawql inference escalation set-tier --tier frugal --model ollama/phi4-custom

# One-shot completion (debug / scripting)
clawql inference complete \
  --model groq/llama-3.3-70b \
  --message "Summarize this spec" \
  --correlation-id seed_abc_gen_2
```

### Observability

```bash
# Recent calls (table or JSON)
clawql inference logs [--model M] [--tier T] [--since 24h] [--limit 50]

# Spend rollup
clawql inference spend [--group-by model|tier|team] [--since 7d]

# Trace by correlation_id (links to WORM / ouroboros lineage)
clawql inference trace --correlation-id <id>
```

### Export (fine-tuning datasets)

```bash
clawql inference export \
  --model anthropic/claude-sonnet-4 \
  --verdict passed \
  --tier frugal \
  --min-score 0.8 \
  --date-from 2026-06-01 \
  --date-to 2026-07-11 \
  --format openai-jsonl \
  --output ./training-data/export-2026-07-11.jsonl

# Quality filters
  --max-latency-ms 5000          # drop slow outliers
  --min-token-efficiency 0.3     # output/input ratio floor
  --exclude-cache-hits           # only net-new generations

# PII (default: scrub on)
  --pii-scrub presidio           # default
  --no-pii-scrub                 # operator opt-out (logged in manifest)

# Manifest
  --write-manifest               # default on — WORM dataset manifest alongside JSONL
```

### Fine-tune & register

```bash
# Submit fine-tuning job
clawql inference finetune \
  --dataset ./training-data/export-2026-07-11.jsonl \
  --manifest ./training-data/export-2026-07-11.manifest.json \
  --base-model anthropic/claude-haiku-4 \
  --provider anthropic \
  --register-as frugal-custom

# Poll job status
clawql inference finetune status --job-id ftjob_abc123

# Promote finished model into ModelTierMap
clawql inference finetune register \
  --job-id ftjob_abc123 \
  --tier frugal \
  --alias ollama/phi4-production-v3
```

### Continuous improvement (scheduled)

```bash
# Auto-export when sample threshold met; optional auto-finetune
clawql inference pipeline enable \
  --schedule "0 2 * * 0" \
  --min-samples 500 \
  --verdict passed \
  --target-tier frugal \
  --base-model anthropic/claude-haiku-4 \
  --evaluate-before-promote   # hold promotion until eval harness passes

clawql inference pipeline status
clawql inference pipeline disable
```

### Keys & policy (enterprise)

```bash
clawql inference keys create --team eng --budget-usd 500 --rate-limit 100rpm
clawql inference keys list
clawql inference keys revoke --id vk_abc

clawql inference policy show    # Manifest inference block (tiers, cache TTL, export rules)
```

## Implementation phasing

| Phase       | Deliverable                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0-D** ✅ | `routing/` + ouroboros hooks ([#560](https://github.com/danielsmithdevelopment/ClawQL/issues/560))                                                                                            |
| **P0-F** ✅ | Gateway MVP: `serve`, `complete`, OpenAI / Anthropic / Ollama adapters                                                                                                                        |
| **P0-G** ✅ | `store/` + observability — log every call with `correlation_id`; `logs`, `trace`, `spend` CLI                                                                                                 |
| **P0-H** ✅ | `export/` — verdict-filtered JSONL + Presidio + dataset manifest                                                                                                                              |
| **P0-I** ✅ | `finetune/` — Anthropic/OpenAI job API + `register-as` tier                                                                                                                                   |
| **P1** ✅   | `pipeline enable` — config + `pipeline run` auto-export when sample threshold met                                                                                                             |
| **P1** ✅   | Model escalation audit event builders ([#561](https://github.com/danielsmithdevelopment/ClawQL/issues/561)), agent coordination trigger ([#562](https://github.com/danielsmithdevelopment/ClawQL/issues/562)) |

## Differentiation vs LiteLLM

- Outcome-driven model escalation tied to agent failure signals (drift, convergence, AC regressions)
- Immutable audit trail with `correlation_id` linking inference to agent lineage
- Manifest-governed tier map, cache policy, **and export policy**
- **Verdict-filtered fine-tuning export** with PII scrub and provenance manifests
- **Custom models promoted back into frugal/standard tiers** — compounding cost advantage
- TypeScript-native, catalog-mirrored provider adapters (no Python proxy dependency)

## References

- [Upstream Q00 sync roadmap](../ouroboros/upstream-q00-sync-roadmap.md) (upstream naming differs)
- [Token efficiency architecture](../architecture/clawql-token-efficiency.md)
- Issue [#560](https://github.com/danielsmithdevelopment/ClawQL/issues/560) — model tier escalation foundation
