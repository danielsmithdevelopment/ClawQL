## clawql-mcp 6.3.0

**npm:** [clawql-mcp@6.3.0](https://www.npmjs.com/package/clawql-mcp)  
**Full changelog:** [CHANGELOG.md#630---2026-06-02](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#630---2026-06-02)

### Highlights

- **Modularization phases 2–9** ([#306](https://github.com/danielsmithdevelopment/ClawQL/issues/306)): workspace packages **`clawql-core`**, **`clawql-api`**, **`clawql-memory`**, **`clawql-documents`**, **`clawql-automation`** — logic extracted from the monolith with thin **`src/`** shims for backward-compatible imports.
- **Effect-TS gateway:** MCP **`search`** and **`execute`** run through **`createClawQLApi()`** + Effect Layers (`SearchService` / `ExecuteService`).
- **`PanguardProxyPlugin`:** policy chokepoint as a first-class **`mcp-proxy`** plugin ([#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272)).
- **Docs:** [modularization implementation status](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/modularization-implementation-status.md), [plugin model](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/clawql-plugin-model.md), [plugin registry](https://docs.clawql.com/reference/plugins) on docs.clawql.com.

### Upgrade notes (6.2.x → 6.3.0)

- **MCP tools and env flags are unchanged** for normal consumers (`search`, `execute`, `memory_*`, `CLAWQL_ENABLE_*`, etc.).
- **Not a semver-major break** — internal refactor only; report regressions on [GitHub Issues](https://github.com/danielsmithdevelopment/ClawQL/issues).
- If you **deep-imported** private `src/` modules (unsupported), switch to supported MCP tools or wait for published **`clawql-*`** packages ([#306](https://github.com/danielsmithdevelopment/ClawQL/issues/306)).

### Helm chart

- **`charts/clawql-mcp`:** **Chart.version `0.6.6`**, **`appVersion` `6.3.0`** (aligns with npm).

### Install

```bash
npm install clawql-mcp@6.3.0
```

**Node:** `>=22` (see `package.json` `engines`).
