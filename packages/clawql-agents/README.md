# clawql-agents

Effect-based hardened adapters for RockYourLobster catalog agents.

| Phase | Agents                         | Status                                                                                             |
| ----- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1     | Cline                          | Adapter + WORM hooks + ATR templates + MCP settings fragment                                       |
| 2     | OpenClaw, Hermes               | Adapter + WORM hooks + ATR templates + skill/MCP plans; Hermes ships `python/hermes/worm_agent.py` |
| 3–4   | OpenHands, Goose, Pi, DeepSeek | Not implemented                                                                                    |
| 5     | Agents OpenBench               | Gated — do not scaffold `bench/` here yet                                                          |

WORM writes go through **`clawql-audit`** only (no `clawql-core` dependency).

Spec: [`docs/agents/clawql-agents-spec-v0.1.md`](../../docs/agents/clawql-agents-spec-v0.1.md)
