---
title: "clawql-harness — Package Specification"
status: "August 2026"
version: "0.1"
package: "packages/clawql-harness/"
---

# clawql-harness — Package Specification

**August 2026 · v0.1**

See the canonical narrative in the product spec (agents vs harness split). **Implementation status (this repo):**

| Phase | Scope                                                                                  | Status                                                       |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1     | `HarnessPlugin`, `HarnessContext`, registry, tool/WORM bridges, `ClawQLHarness.create` | **Shipped**                                                  |
| 2     | `OuroborosPlugin` under `plugins/ouroboros/` (stagnation + personas + `clawql_think`)  | **Shipped** (harness path; MCP `ouroboros_*` still separate) |
| 3     | `OpenCode2Plugin` embed stub (optional `@opencode-ai/sdk` peer)                        | **Shipped stub** — full bridge when SDK ctx lands            |
| 4     | `compareHarnesses` + `integrations/harness-bench/`                                     | **Shipped dry compare**                                      |

## Distinction from clawql-agents

- **`clawql-agents`** — wrap finished agent products (Cline, OpenClaw, Hermes, …) at process/SDK boundaries.
- **`clawql-harness`** — model-agnostic execution loops; plugins register tools and loop hooks in-process.

## Plugin registration (no env gate on harness path)

```typescript
import { Effect } from "effect";
import { ClawQLHarness } from "clawql-harness";
import { OuroborosPlugin } from "clawql-harness/plugins/ouroboros";

const harness = await Effect.runPromise(
  ClawQLHarness.create({
    plugins: [OuroborosPlugin],
    model: { provider: "mlx", name: "nemotron-stub" },
  })
);
```

MCP horizontal **`CLAWQL_ENABLE_OUROBOROS=1`** remains for `ouroboros_*` MCP tools in `clawql-ouroboros`; the harness plugin list is independent.

## Layout

```
packages/clawql-harness/
  src/           — types, registry, bridges, ClawQLHarness
  plugins/       — ouroboros, opencode2
  bench/         — compareHarnesses
integrations/harness-bench/  — CLI compare script
```

## Benchmark integration

`compareHarnesses(task, model, plugins)` runs a zero-plugin baseline plus each plugin on the same task/model — see `integrations/harness-bench/scripts/compare.mjs`.

---

_clawql-harness Package Specification · v0.1 · August 2026_
