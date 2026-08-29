# Migrating to ClawQL 8.0.0

**Breaking release means breaking release.** The Phase-2 `Plugin` / `onRegister` / `beforeCallTool` interface is **removed**. There is no compatibility bridge. Rewrite plugins against `ProviderPlugin` / `StandaloneSkillPlugin`. Defaults also change (empty catalog, enforcement off).

## Breaking defaults (read first)

| Before 8.0                               | After 8.0                        | What to set                                                                                                            |
| ---------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Bundled OpenAPI pack often loaded        | **Empty catalog** until opted in | `CLAWQL_PROVIDER=default` or `CLAWQL_INSTANCE_SPEC='{"providers":{"pack":"default"}}'` / Helm `providers.pack=default` |
| Panguard proxy composed by default       | **Off** until opted in           | `CLAWQL_PANGUARD_PROXY_PLUGIN=1`                                                                                       |
| In-process ATR gating opt-in             | Still opt-in (unchanged)         | `CLAWQL_PANGUARD_IN_PROCESS=1` (+ block list / real policy as needed)                                                  |
| Silent ungated tools if Panguard passive | **SECURITY WARNING** at boot     | Install any blocking enforcement provider, or set `CLAWQL_ALLOW_NO_ENFORCEMENT=1` only if intentional                  |
| `Plugin` + `beforeCallTool`              | **Deleted**                      | Author `ProviderPlugin` with `tools` / `hooks` / `defineRegisteringProviderPlugin`                                     |

Bare `clawql-mcp` after upgrade: `search` / `execute` / `cache` / `audit` / `skills_list` / `skills_get` — **no** GitHub/Slack/… ops and **no** tool-scope enforcement until you opt in.

## Plugin interface (hard break)

- **Only** `ProviderPlugin` and `StandaloneSkillPlugin` from `clawql-core` are installable.
- Tool registration: declare `tools` on the plugin, or use `defineRegisteringProviderPlugin({ register })` for env-gated sets.
- Enforcement: blocking `tool` / `pre-execute` hooks (not `beforeCallTool`). Awaited by `McpProxyPipeline` via `fireHook` (ATR never-loosen).
- Horizontal tiers: production MCP boot uses **dynamic** `import()` via `ensureClawqlApi()` / `createRegisteredMcpServerAsync()`. Sync `getClawqlApi()` still static-composes for tests.

### Rewrite sketch

```ts
import { defineProviderPlugin, defineRegisteringProviderPlugin } from "clawql-core";
import { Effect } from "effect";

// Tools
export const myPlugin = defineRegisteringProviderPlugin({
  id: "my-plugin",
  version: "1.0.0",
  description: "…",
  register: (api) =>
    Effect.gen(function* () {
      yield* api.registerMcpTool({ name: "my_tool", schema, handler });
    }),
});

// Enforcement (hooks-only is valid)
export const gate = defineProviderPlugin({
  id: "my-gate",
  version: "1.0.0",
  description: "…",
  hooks: [
    {
      id: "my-gate:pre-execute",
      scope: "tool",
      event: "pre-execute",
      toolPattern: ".*",
      blocking: true,
      handler: (ctx) => Effect.succeed({ allow: true }),
    },
  ],
});
```

## Skills-over-MCP

| Tool          | Role                                  |
| ------------- | ------------------------------------- |
| `skills_list` | Lightweight index (`SkillIndexEntry`) |
| `skills_get`  | Full skill body by `skillId`          |

Empty until something calls `registerProcessSkills` / ProviderPlugin install with skills.

## Minimal upgrade checklist

```bash
# 1. Rewrite any out-of-tree plugins to ProviderPlugin (no bridge)
# 2. Restore curated APIs (if you relied on the old default pack)
export CLAWQL_PROVIDER=default

# 3. Restore enforcement (recommended for production)
export CLAWQL_PANGUARD_PROXY_PLUGIN=1
export CLAWQL_PANGUARD_IN_PROCESS=1

# 4. Or acknowledge ungated tools (dev only)
# export CLAWQL_ALLOW_NO_ENFORCEMENT=1
```

## Docs

- Spec: [`docs/design/clawql-core-plugin-architecture.md`](../design/clawql-core-plugin-architecture.md)
- Action items: [`docs/design/clawql-8.0-plugin-architecture-action-items.md`](../design/clawql-8.0-plugin-architecture-action-items.md)
- Panguard: [`docs/plugins/panguard-proxy.md`](../plugins/panguard-proxy.md)
- Empty catalog / packs: [`docs/plugins/bundled-providers.md`](../plugins/bundled-providers.md)
