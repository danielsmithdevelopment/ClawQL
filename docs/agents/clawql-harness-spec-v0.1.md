---
title: "clawql-harness — Package Specification"
status: "August 2026"
version: "0.1"
package: "packages/clawql-harness/"
---

# clawql-harness — Package Specification

**August 2026 · v0.1**

See the canonical narrative in the product spec (agents vs harness split). **Implementation status (this repo):**

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | `HarnessPlugin`, `HarnessContext`, registry, tool/WORM bridges, `ClawQLHarness.create` | **Shipped** |
| 2 | `OuroborosPlugin` under `plugins/ouroboros/` (`clawql_think` + full `ouroboros_*` via shared defs) | **Shipped** |
| 3 | `OpenCode2Plugin` embed stub (optional `@opencode-ai/sdk` peer) | **Shipped stub** — full bridge when SDK ctx lands |
| 4 | `compareHarnesses` + `integrations/harness-bench/` | **Shipped dry compare** |
| MCP | `makeHarnessLayer` bridges harness tools onto MCP (replaces separate `makeOuroborosLayer` path) | **Shipped** |

## Distinction from clawql-agents

- **`clawql-agents`** — wrap finished agent products (Cline, OpenClaw, Hermes, …) at process/SDK boundaries.
- **`clawql-harness`** — model-agnostic execution loops; plugins register tools and loop hooks in-process.

## Plugin registration (single path)

Ouroboros is a **harness plugin**. Enabling it means putting it in the plugin list — there is no separate MCP registration path.

```typescript
import { Effect } from "effect";
import { ClawQLHarness } from "clawql-harness";
import { createOuroborosHarnessPlugin } from "clawql-harness/plugins/ouroboros";

const harness = await Effect.runPromise(
  ClawQLHarness.create({
    plugins: [createOuroborosHarnessPlugin()],
    model: { provider: "mlx", name: "nemotron-stub" },
  })
);
```

### MCP

`composeHorizontalPluginLayers` includes Ouroboros by composing **`makeHarnessLayer`** with `createOuroborosHarnessPlugin` when the horizontal tier / `CLAWQL_ENABLE_OUROBOROS` composition flag is on. That flag only means “include the harness Ouroboros plugin”; tools are registered via the harness → MCP bridge (`clawql_think` + `ouroboros_*`).

Legacy `makeOuroborosLayer` / `createOuroborosPlugin` remain in `clawql-ouroboros` for library embedders that use the clawql-core Plugin API without a harness — **not** used by MCP.

## Layout

```
packages/clawql-harness/
  src/           — types, registry, bridges, ClawQLHarness, makeHarnessLayer
  plugins/       — ouroboros, opencode2
  bench/         — compareHarnesses
integrations/harness-bench/  — CLI compare script
```

## Benchmark integration

`compareHarnesses(task, model, plugins)` runs a zero-plugin baseline plus each plugin on the same task/model — see `integrations/harness-bench/scripts/compare.mjs`.

---

*clawql-harness Package Specification · v0.1 · August 2026*
