# clawql-inference

TypeScript-native **inference gateway** for ClawQL: PAL adaptive routing, cloud provider adapters, local runtimes (Ollama / vLLM / Llama.cpp), semantic caching, and WORM-auditable observability.

**Status:** Foundation — PAL routing (#560) ships first; provider adapters and OpenAI-compatible HTTP surface follow in dedicated PRs.

## PAL routing (shipped)

```typescript
import {
  createAdaptiveRouter,
  loadPalRoutingConfig,
  type PalRoutingDecision,
} from "clawql-inference";

const router = createAdaptiveRouter(loadPalRoutingConfig(process.env));
const decision = router?.initialTier({ isDecomposedChild: false, seedId: "seed_root" });
```

### Environment

| Variable                           | Default                     | Purpose                              |
| ---------------------------------- | --------------------------- | ------------------------------------ |
| `CLAWQL_INFERENCE_ROUTING_ENABLED` | off                         | Enable PAL tier ladder               |
| `CLAWQL_INFERENCE_MODEL_FRUGAL`    | `ollama/phi4`               | Frugal tier model id                 |
| `CLAWQL_INFERENCE_MODEL_STANDARD`  | `groq/llama-3.3-70b`        | Standard tier model id               |
| `CLAWQL_INFERENCE_MODEL_FRONTIER`  | `anthropic/claude-sonnet-4` | Frontier tier model id               |
| `CLAWQL_INFERENCE_MODEL_PIN`       | —                           | Pin a single model (bypasses ladder) |

Legacy `CLAWQL_PAL_*` env names are also accepted.

## Consumers

- **`clawql-ouroboros`** — optional `AdaptiveRouter` on the evolutionary loop
- **`clawql-api`** — execute path (planned)
- **`clawql-automation`** — scheduled workflows (planned)

## Roadmap

See [`docs/inference/clawql-inference.md`](../../docs/inference/clawql-inference.md) for the full gateway vision, **`clawql inference` CLI surface** (serve, export, finetune, pipeline), and the production → fine-tune → redeploy flywheel.

Epic [#556](https://github.com/danielsmithdevelopment/ClawQL/issues/556).
