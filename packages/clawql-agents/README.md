# clawql-agents

Effect-based hardened adapters for all seven RockYourLobster catalog agents.

| Phase                  | Status                                                                      |
| ---------------------- | --------------------------------------------------------------------------- |
| 1–4 Adapters           | Shipped (Cline, OpenClaw, Hermes, Goose, OpenHands, Pi, DeepSeek)           |
| Personal-agent install | `installPersonalAgentHooks` + `scripts/dev/install-personal-agent-hooks.sh` |
| OpenClaw live MCP      | `planOpenClawLiveWiring` / `scripts/dev/openclaw-register-clawql.sh`        |
| Outbound credentials   | `getOutboundCredential` (clawql-auth)                                       |
| Phase 5 dry bench      | `runAgentBenchmarkDry` + `integrations/agents-bench/`                       |
| Helm overlays          | `helm/<agent>/values-clawql.yaml`                                           |
| Live OpenBench A/B     | Gated — see `docs/benchmarks/agents-openbench-plan.md`                      |

```ts
import { Effect } from "effect";
import { getAdapterBundle, getOutboundCredential, planOpenClawLiveWiring } from "clawql-agents";
```

Spec: [`docs/agents/clawql-agents-spec-v0.1.md`](../../docs/agents/clawql-agents-spec-v0.1.md)
