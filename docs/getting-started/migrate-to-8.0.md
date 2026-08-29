# Migrating to ClawQL 8.0.0

**Loudest changes are defaults, not the ProviderPlugin API.** The Wave 5 bridge keeps Phase-2 `Plugin` / `beforeCallTool` working. You must still **opt in** to providers and enforcement.

## Breaking defaults (read first)

| Before 8.0                               | After 8.0                        | What to set                                                                                                            |
| ---------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Bundled OpenAPI pack often loaded        | **Empty catalog** until opted in | `CLAWQL_PROVIDER=default` or `CLAWQL_INSTANCE_SPEC='{"providers":{"pack":"default"}}'` / Helm `providers.pack=default` |
| Panguard proxy composed by default       | **Off** until opted in           | `CLAWQL_PANGUARD_PROXY_PLUGIN=1`                                                                                       |
| In-process ATR gating opt-in             | Still opt-in (unchanged)         | `CLAWQL_PANGUARD_IN_PROCESS=1` (+ block list / real policy as needed)                                                  |
| Silent ungated tools if Panguard passive | **SECURITY WARNING** at boot     | Install any blocking enforcement provider, or set `CLAWQL_ALLOW_NO_ENFORCEMENT=1` only if intentional                  |

Bare `clawql-mcp` after upgrade: `search` / `execute` / `cache` / `audit` / `skills_list` / `skills_get` — **no** GitHub/Slack/… ops and **no** tool-scope enforcement until you opt in.

## ProviderPlugin architecture (non-breaking for most)

- Prefer `ProviderPlugin` / `StandaloneSkillPlugin` from `clawql-core`.
- Existing `Plugin` + `beforeCallTool` still works; map with `legacyPluginToProviderPlugin()`.
- `beforeCallTool` remains **awaited** (bridged as blocking `tool` / `pre-execute`).
- Horizontal tiers: production MCP boot uses **dynamic** `import()` via `ensureClawqlApi()` / `createRegisteredMcpServerAsync()`. Sync `getClawqlApi()` still static-composes for tests.

## Skills-over-MCP

| Tool          | Role                                  |
| ------------- | ------------------------------------- |
| `skills_list` | Lightweight index (`SkillIndexEntry`) |
| `skills_get`  | Full skill body by `skillId`          |

Empty until something calls `registerProcessSkills` / ProviderPlugin install with skills.

## Minimal upgrade checklist

```bash
# 1. Restore curated APIs (if you relied on the old default pack)
export CLAWQL_PROVIDER=default

# 2. Restore enforcement (recommended for production)
export CLAWQL_PANGUARD_PROXY_PLUGIN=1
export CLAWQL_PANGUARD_IN_PROCESS=1

# 3. Or acknowledge ungated tools (dev only)
# export CLAWQL_ALLOW_NO_ENFORCEMENT=1
```

## Docs

- Spec: [`docs/design/clawql-core-plugin-architecture.md`](../design/clawql-core-plugin-architecture.md)
- Action items: [`docs/design/clawql-8.0-plugin-architecture-action-items.md`](../design/clawql-8.0-plugin-architecture-action-items.md)
- Panguard: [`docs/plugins/panguard-proxy.md`](../plugins/panguard-proxy.md)
- Empty catalog / packs: [`docs/plugins/bundled-providers.md`](../plugins/bundled-providers.md)
