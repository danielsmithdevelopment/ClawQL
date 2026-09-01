# clawql-harness

Model-agnostic execution-loop harness. Plugins register tools and loop hooks in-process.

| Surface | Import |
| --- | --- |
| Core | `clawql-harness` → `ClawQLHarness` |
| MCP bridge | `clawql-harness/plugin` → `makeHarnessLayer`, `createOuroborosHarnessPlugin` |
| Ouroboros plugin | `clawql-harness/plugins/ouroboros` → `OuroborosPlugin` / `createOuroborosHarnessPlugin` |
| OpenCode2 plugin | `clawql-harness/plugins/opencode2` → `OpenCode2Plugin` |
| Compare bench | `clawql-harness/bench` → `compareHarnesses` |

```typescript
import { Effect } from "effect";
import { ClawQLHarness } from "clawql-harness";
import { createOuroborosHarnessPlugin } from "clawql-harness/plugins/ouroboros";

const harness = await Effect.runPromise(
  ClawQLHarness.create({
    plugins: [createOuroborosHarnessPlugin()],
    model: { provider: "stub", name: "bench-model" },
  })
);
```

**Ouroboros enablement:** include `createOuroborosHarnessPlugin()` in the plugin list. That registers `clawql_think` and the full `ouroboros_*` tool set (shared with `clawql-ouroboros`). MCP uses `makeHarnessLayer` to bridge those harness tools — there is no separate MCP-only registration path.
