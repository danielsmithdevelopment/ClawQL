# clawql-harness

Model-agnostic execution-loop harness for ClawQL — distinct from **`clawql-agents`**, which wraps finished agent products at the process boundary.

| Piece | Location |
| --- | --- |
| Spec | [`docs/agents/clawql-harness-spec-v0.1.md`](../../docs/agents/clawql-harness-spec-v0.1.md) |
| Core API | `ClawQLHarness.create`, `HarnessPlugin`, `HarnessContext` |
| Ouroboros plugin | `clawql-harness/plugins/ouroboros` → `OuroborosPlugin` |
| OpenCode2 plugin | `clawql-harness/plugins/opencode2` → `OpenCode2Plugin` (optional SDK peer) |
| Compare bench | `clawql-harness/bench` → `compareHarnesses` |

```ts
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

**MCP note:** Horizontal MCP `ouroboros_*` tools remain in `clawql-ouroboros` behind `CLAWQL_ENABLE_OUROBOROS`. The harness plugin path is explicit plugin-list only — no env gate.
