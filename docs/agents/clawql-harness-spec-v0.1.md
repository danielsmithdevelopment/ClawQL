---
title: "clawql-harness — Package Specification"
status: "August 2026"
version: "0.1"
package: "packages/clawql-harness/"
---

# clawql-harness — Package Specification

**August 2026 · v0.1**

## Plugin enablement (config — not env)

Horizontal MCP plugins (memory, documents, sandbox, data, automation, …) are enabled via **`ClawQLInstance` / `HorizontalTierSpec`**:

- Inline: `CLAWQL_INSTANCE_SPEC` (JSON)
- File: `CLAWQL_INSTANCE_SPEC_FILE` (JSON/YAML)
- Default when unset: tier preset from `CLAWQL_TIER` (`local` | `standard` | `enterprise`, default **`standard`**)
- Helm: always injects `CLAWQL_INSTANCE_SPEC` from chart `enable*` values via `clawql-mcp.instanceSpecJson`
- Operator CRD: ConfigMap `horizontalTierSpec.json`

**`CLAWQL_ENABLE_*` is not the plugin loading system.** Resolver: `resolvePluginCompositionFlags()` / `getClawqlOptionalToolFlags()` (instance / tier). Helm injects `CLAWQL_INSTANCE_SPEC` only — it does **not** dual-write horizontal `CLAWQL_ENABLE_*`.

**Ouroboros** is always loaded as a **clawql-harness** plugin (`makeHarnessLayer` + `createOuroborosHarnessPlugin`). No enable flag. Optional: `ouroboros.langfuseEval` in the instance spec; Postgres via `CLAWQL_OUROBOROS_DATABASE_URL` (persistence, not enablement).

## Bundled providers (catalog — not auto-loaded)

OpenAPI/GraphQL vendors under `providers/` stay **available** in the image/package. They are **not** loaded until opted in:

- Instance: `providers.pack` (`none` | `default` | `all-providers` | …) and/or `providers.enabled: […]`
- Legacy: `CLAWQL_PROVIDER` / `CLAWQL_BUNDLED_PROVIDERS` / `CLAWQL_SPEC_PATHS`
- No-config default: **empty** stack (native GraphQL/gRPC only when configured)

`CLAWQL_ENABLE_GOOGLE|AWS|CLOUDFLARE` no longer select the stack.

## Implementation status

| Phase | Scope                                                                                  | Status                  |
| ----- | -------------------------------------------------------------------------------------- | ----------------------- |
| 1     | `HarnessPlugin`, `HarnessContext`, registry, tool/WORM bridges, `ClawQLHarness.create` | **Shipped**             |
| 2     | `OuroborosPlugin` (`clawql_think` + full `ouroboros_*`)                                | **Shipped**             |
| 3     | `OpenCode2Plugin` (`createOpencode` + session.create/prompt)                           | **Shipped**             |
| 4     | `compareHarnesses` + `integrations/harness-bench/`                                     | **Shipped dry compare** |
| MCP   | `makeHarnessLayer` bridges harness tools; composition from instance/tier config        | **Shipped**             |

## Distinction from clawql-agents

- **`clawql-agents`** — wrap finished agent products at process/SDK boundaries.
- **`clawql-harness`** — model-agnostic execution loops; plugins register tools and loop hooks in-process.

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

---

_clawql-harness Package Specification · v0.1 · August 2026_
