# clawql-inference

**Status:** Foundation (July 2026)  
**Package:** [`packages/clawql-inference`](../../packages/clawql-inference)  
**Epic:** [#556](https://github.com/danielsmithdevelopment/ClawQL/issues/556)

`clawql-inference` is ClawQL's TypeScript-native inference gateway — a LiteLLM-class layer built with ClawQL's trust model: Manifest-governed policies, WORM-auditable routing decisions, semantic cache backed by existing memory/Onyx infrastructure, and PAL + MoA integrated from day one.

## Shipped today (#560)

- **`AdaptiveRouter`** / **`PalAdaptiveRouter`** — frugal → standard → frontier, one-notch escalation
- **Tier map** from environment (off by default per Layer 8)
- **Kill switches** — routing disabled unless explicitly enabled; optional model pin
- **`InferenceGateway`** interface stub for provider adapters
- **`clawql-ouroboros`** optional routing hooks (`EngineCallContext`)

## Planned modules

| Module | Scope |
|--------|--------|
| `providers/` | Anthropic, OpenAI, Google, Groq, Together, Mistral, … |
| `local/` | Ollama, vLLM, Llama.cpp |
| `cache/` | Semantic cache (embedding similarity, Manifest TTL) |
| `observability/` | Langfuse (ADR 0005), OpenTelemetry, WORM correlation |
| `fallback/` | Per-tier provider chains |
| `keys/` | Virtual keys, per-team budgets |
| `api/` | OpenAI-compatible `/v1/chat/completions` |

## Differentiation vs LiteLLM

- Outcome-driven PAL escalation tied to agent failure signals (drift, convergence, AC regressions)
- Immutable audit trail with `correlation_id` linking inference to agent lineage
- Manifest-governed tier map and cache policy
- TypeScript-native, catalog-mirrored provider adapters (no Python proxy dependency)

## References

- [Upstream Q00 sync roadmap](../ouroboros/upstream-q00-sync-roadmap.md)
- [Token efficiency Layer 8](../architecture/clawql-token-efficiency.md)
- Issue [#560](https://github.com/danielsmithdevelopment/ClawQL/issues/560) — PAL routing foundation
