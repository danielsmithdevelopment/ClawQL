# Toolkits as packaging (v0.1)

A **toolkit** is a first-class named preset that expands to an existing **provider pack** / `enabled` list, an **ATR tool allowlist**, and optional **API key scopes**. It does **not** introduce a new provider runtime.

## Why

Operators already compose providers via `providers.pack` / `providers.enabled` / `CLAWQL_PROVIDER`, and agents already carry ATR `toolsInScope`. Competitors ship “toolkits” as a single product name. ClawQL packages the same building blocks under one id.

## Seeded toolkits

| Id                 | Providers composition          | ATR tools (allowlist)                                         | Optional API key scopes                |
| ------------------ | ------------------------------ | ------------------------------------------------------------- | -------------------------------------- |
| `default-saas`     | `pack: "default"`              | `search`, `execute`, `cache`, `audit`, `skills_*`, `memory_*` | `search`, `execute`, `memory`, `audit` |
| `read-only`        | `pack: "default"`              | `search`, `memory_recall`, `skills_*`                         | `search`, `memory`                     |
| `ops-github-slack` | `enabled: ["github", "slack"]` | same core tools as `default-saas`                             | `search`, `execute`, `memory`, `audit` |

`skills_*` expands to `skills_list` + `skills_get`. `memory_*` expands to `memory_ingest` + `memory_recall`.

## Resolution

```
toolkitId → { pack?, enabled? }   // providers composition only
toolkitId → atrToolsInScope[]     // metadata for ATR / harness
toolkitId → apiKeyScopes?         // metadata for issued keys
```

Provider load uses the same path as instance `providers` / `CLAWQL_PROVIDER` (`resolveItemsFromProvidersComposition`). ATR and API key scopes are returned by the toolkit registry for consumers (CLI show, future ATR bind) — v0.1 does **not** auto-rebind session ATR.

## Surfaces

| Surface                         | Behavior                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAWQL_TOOLKIT=<id>`           | When `CLAWQL_SPEC_PATHS` / `CLAWQL_BUNDLED_PROVIDERS` unset, expand toolkit into providers composition. Ignored (with console warn) if `CLAWQL_PROVIDER` is also set. |
| Instance JSON `toolkit: "<id>"` | When `providers` key is missing, expand toolkit. If both present, `providers` wins.                                                                                   |
| CLI `clawql toolkit list\|show` | Enumerate / inspect seeded toolkits                                                                                                                                   |
| `ToolkitService` (Effect Tag)   | `list` / `get` / `resolve` / `resolveToolkitToProvidersComposition`                                                                                                   |

## Precedence (multi-spec)

1. `CLAWQL_SPEC_PATHS`
2. `CLAWQL_BUNDLED_PROVIDERS`
3. Instance `providers`
4. Instance `toolkit` (only if `providers` absent)
5. `CLAWQL_PROVIDER` (wins over `CLAWQL_TOOLKIT` with warn)
6. `CLAWQL_TOOLKIT`
7. Empty stack / single-spec fallback

## Out of scope (v0.1)

- New OpenAPI vendors or execute runtimes
- Automatic ATR session rebind from toolkit id
- Dashboard UI / Helm CRD field (can follow)
- Custom operator-defined toolkit files (seeded registry only)
