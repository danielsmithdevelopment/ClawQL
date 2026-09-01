# Changelog

## Unreleased

## 0.1.0

First public npm release. `clawql-harness` is the model-agnostic execution-loop harness for ClawQL — plugin registry, tool/WORM bridges, and bundled Ouroboros and OpenCode2 plugins.

### Core harness

- **`ClawQLHarness`:** Effect-based execution loop with plugin registry, tool invocation (`invokeHarnessTool`), and WORM event bridges.
- **`clawql-harness/plugin`:** `makeHarnessLayer` and `createOuroborosHarnessPlugin` for bridging harness tools into MCP hosts.
- **`clawql-harness/bench`:** `compareHarnesses` and scenario-synthesis bridge for harness benchmarking.

### Ouroboros plugin (`clawql-harness/plugins/ouroboros`)

- Registers `clawql_think` and the full `ouroboros_*` tool set (shared with `clawql-ouroboros`).
- Stagnation detection and persona hooks for long-running agent loops.

### OpenCode2 plugin (`clawql-harness/plugins/opencode2`)

- Optional embed bridge for `@opencode-ai/sdk` v2 + `opencode-ai` CLI.
- Harness tool `opencode2_session`: lazy `createOpencode` on first call, `session.create` + `session.prompt` with flat v2 params (`sessionID`, `parts`, `model`, `directory`).
- Defaults to free OpenCode model `opencode/big-pickle` (no API keys required for demos).
- Prepends `opencode-ai/bin` to `PATH`; ephemeral port when `CLAWQL_OPENCODE_PORT` is unset.
- `CLAWQL_OPENCODE_DISABLE_EMBED=1` for unit tests / force CLI fallback.
- Structured error when peers are missing (use `clawql opencode` CLI instead).

### Install

```bash
npm install clawql-harness
# optional OpenCode2 peers
npm install @opencode-ai/sdk opencode-ai
```

### Quick start

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

See `packages/clawql-harness/README.md` and `packages/clawql-harness/plugins/opencode2/README.md` for full docs.
