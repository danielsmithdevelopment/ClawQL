# clawql-agents

Effect-based hardened adapters for all seven RockYourLobster catalog agents.

| Phase | Agents           | Status                                                                           |
| ----- | ---------------- | -------------------------------------------------------------------------------- |
| 1     | Cline            | Adapter + WORM hooks + ATR templates + MCP settings fragment                     |
| 2     | OpenClaw, Hermes | Adapter + WORM hooks + ATR templates; Hermes ships `python/hermes/worm_agent.py` |
| 3     | Goose, OpenHands | Path ATR (Goose) + budget enforcer (OpenHands)                                   |
| 4     | Pi, DeepSeek     | API memory plan (Pi) + Cordis plugin gate (DeepSeek)                             |
| 5     | Agents OpenBench | **Gated** — do not scaffold `bench/` / Helm overlays here yet                    |

WORM writes go through **`clawql-audit`** only.

```ts
import { Effect, Layer } from "effect";
import { getAdapterBundle, CLINE_ATR_TEMPLATES, AgentAdapter } from "clawql-agents";

const { wormLayer, adapterLayer } = await Effect.runPromise(
  getAdapterBundle("cline", "/tmp/worm.db")
);
```

Spec: [`docs/agents/clawql-agents-spec-v0.1.md`](../../docs/agents/clawql-agents-spec-v0.1.md)
