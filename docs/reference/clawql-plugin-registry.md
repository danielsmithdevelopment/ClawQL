# ClawQL plugin registry

**Status:** Living reference (June 2026)  
**Audience:** Operators, contributors, third-party plugin authors  
**Companion:** [ClawQL plugin model](../design/clawql-plugin-model.md) (concepts and target architecture)

This page is the **registry** of ClawQL plugins: what exists today, what horizontal packages are becoming plugins, and how to enable or compose each one. For the full explanation of “becoming a plugin” vs package extraction, read the [plugin model](../design/clawql-plugin-model.md).

---

## 1. Plugin kinds

| Kind            | Registers MCP tools? | Primary hook               | Example                        |
| --------------- | -------------------- | -------------------------- | ------------------------------ |
| **`default`**   | Yes (when composed)  | `onRegister`, `onTeardown` | `clawql-memory` (planned)      |
| **`mcp-proxy`** | No                   | `beforeCallTool`           | `panguard-mcp-proxy` (shipped) |

**Not plugins:** `search`, `execute`, `cache`, and `audit` are **gateway core** — always composed in `clawql-api`, not optional plugin Layers.

---

## 2. Registry (all plugins)

| Plugin ID                      | Package / location                   | Kind        | Registration                                                                               | MCP tools                                                                                                | Enable / compose                                                                                            | Notes                                                                                                                                                    |
| ------------------------------ | ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`panguard-mcp-proxy`**       | `clawql-api` (`PanguardProxyPlugin`) | `mcp-proxy` | ✅ Shipped — `createClawQLApi()` default                                                   | _(none)_                                                                                                 | Default on; **`CLAWQL_PANGUARD_PROXY_PLUGIN=0`** to omit. Active policy: **`CLAWQL_PANGUARD_IN_PROCESS=1`** | `beforeCallTool` chokepoint ([#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272))                                                        |
| **`clawql-memory`**            | `packages/clawql-memory`             | `default`   | ✅ **`MemoryPlugin`** — `onRegister` registers `memory_ingest` / `memory_recall`           | `memory_ingest`, `memory_recall`                                                                         | Default on; **`CLAWQL_ENABLE_MEMORY=0`** to omit plugin + tools                                             | Vault + optional `memory.db`; future `onIngestHook` / `onRecallFilter` for verticals                                                                     |
| **`clawql-documents`**         | `packages/clawql-documents`          | `default`   | ✅ **`DocumentsPlugin`** — `onRegister` registers ingest + optional Onyx                   | `ingest_external_knowledge`, `knowledge_search_onyx` (when Onyx on)                                      | Default on; **`CLAWQL_ENABLE_DOCUMENTS=0`** to omit; Onyx: **`CLAWQL_ENABLE_ONYX=1`**                       | Ingest + **`DEFAULT_IDP_PIPELINE`**; 7 bundled IDP vendors via **`execute`** — [idp-pipeline.md](../providers/idp-pipeline.md); automated runner roadmap |
| **`clawql-automation`**        | `packages/clawql-automation`         | `default`   | ✅ **`AutomationPlugin`** — `onRegister` registers schedule/notify; worker in `onRegister` | `schedule`, `notify`                                                                                     | **`CLAWQL_ENABLE_SCHEDULE=1`**, **`CLAWQL_ENABLE_NOTIFY=1`**                                                | Schedule worker + Slack notify via execute. **Future:** Argo `workflow` tool ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243))       |
| **`clawql-documents-onyx`**    | `clawql-documents` plugin            | `default`   | ✅ Folded into **`DocumentsPlugin`** when Onyx enabled                                     | `knowledge_search_onyx`                                                                                  | Documents on + **`CLAWQL_ENABLE_ONYX=1`**                                                                   | Uses `configureDocumentsPluginDeps({ execute })` from MCP startup                                                                                        |
| **`clawql-sandbox`**           | `src/sandbox-*` (planned package)    | `default`   | 📋 Planned extraction                                                                      | `sandbox_exec`                                                                                           | **`CLAWQL_ENABLE_SANDBOX=1`**                                                                               | Seatbelt / Docker / Cloudflare bridge                                                                                                                    |
| **`clawql-ouroboros`**         | `clawql-ouroboros` npm package       | `default`   | 📋 Planned plugin Layer                                                                    | `ouroboros_create_seed_from_document`, `ouroboros_run_evolutionary_loop`, `ouroboros_get_lineage_status` | **`CLAWQL_ENABLE_OUROBOROS=1`**                                                                             | Effect rewrite + thin MCP glue planned                                                                                                                   |
| **`clawql-hitl-label-studio`** | `src/`                               | `default`   | 📋 Planned                                                                                 | `hitl_enqueue_label_studio`                                                                              | **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`**                                                                     | May move to `clawql-automation` or standalone                                                                                                            |
| **Vertical plugins**           | `verticals/clawql-*` (planned)       | `default`   | 📋 Not started                                                                             | Domain-specific                                                                                          | Operator `ClawQLInstance` CRD / tier flags                                                                  | e.g. `lending`, `legal-us` — see [Verticals guide](https://docs.clawql.com/reference/verticals)                                                          |
| **Third-party**                | `clawql-*-plugin` npm (roadmap)      | `default`   | 📋 No public API yet                                                                       | Author-defined                                                                                           | Operator Layer list or env                                                                                  | Depends on `clawql-core` + `clawql-api` only                                                                                                             |

**Legend:** ✅ Shipped · 📋 Planned or partial (logic may exist; `Plugin.onRegister` not wired)

---

## 3. MCP tools by owning plugin (target)

When plugin registration lands, each tool will be registered only if its plugin is composed.

| MCP tool(s)                      | Owning plugin (target)    | Package today               | Site reference                                                           |
| -------------------------------- | ------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| `search`, `execute`              | Gateway core              | `clawql-api` + `src/` shims | [MCP tools](../mcp/mcp-tools.md)                                         |
| `cache`, `audit`                 | Gateway core              | `src/`                      | [MCP tools](../mcp/mcp-tools.md)                                         |
| `memory_ingest`, `memory_recall` | `clawql-memory`           | `clawql-memory`             | [Vault memory](https://docs.clawql.com/learn/vault-memory-between-chats) |
| `ingest_external_knowledge`      | `clawql-documents`        | `clawql-documents`          | [external-ingest.md](../mcp/external-ingest.md)                          |
| `knowledge_search_onyx`          | `clawql-documents` (Onyx) | `src/`                      | [Onyx knowledge](https://docs.clawql.com/learn/knowledge-search-onyx)    |
| `schedule`                       | `clawql-automation`       | `clawql-automation`         | [Schedule](https://docs.clawql.com/schedule)                             |
| `notify`                         | `clawql-automation`       | `clawql-automation`         | [Notify](https://docs.clawql.com/notify)                                 |
| `sandbox_exec`                   | `clawql-sandbox`          | `src/`                      | [Sandbox exec](https://docs.clawql.com/learn/sandbox-exec)               |
| `ouroboros_*`                    | `clawql-ouroboros`        | `clawql-ouroboros`          | [Ouroboros](https://docs.clawql.com/ouroboros)                           |
| `hitl_enqueue_label_studio`      | TBD                       | `src/`                      | [HITL](https://docs.clawql.com/hitl-label-studio)                        |

---

## 4. Composition at startup (target)

```ts
createClawQLApi({
  plugins: [
    createPanguardProxyPlugin(), // mcp-proxy — always unless disabled
    MemoryPlugin, // when memory tier enabled
    DocumentsPlugin, // when documents tier enabled
    AutomationPlugin, // when schedule/notify enabled
    // LendingPlugin, AcmeWidgetsPlugin, …
  ],
});
```

Today **`PanguardProxyPlugin`**, **`MemoryPlugin`**, **`DocumentsPlugin`**, and **`AutomationPlugin`** are composed at startup (`buildMcpPlugins` in `clawql-api-adapters.ts`). Remaining optional tools (sandbox, HITL, Ouroboros) are still registered in `src/tools.ts`.

---

## 5. Third-party plugin checklist (roadmap)

When the public registration API stabilizes:

1. Publish **`clawql-yourname-feature`** depending on **`clawql-core`** + **`clawql-api`** (not `clawql-mcp` transport).
2. Export a **`Plugin`** factory and (eventually) an Effect **`Layer`**.
3. Implement **`onRegister`** to register MCP tools and declare **`requiredSpecs`**.
4. Document the Operator toggle or **`CLAWQL_ENABLE_*`** flag.
5. Add a row to this registry via PR (or published manifest in a later phase).

Until then, contribute in-repo via **`providers/`** and MCP tools in the monorepo.

---

## 6. References

| Doc                                                                                                       | Use when                                |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [ClawQL plugin model](../design/clawql-plugin-model.md)                                                   | Concepts, today vs target, request flow |
| [Modularization implementation status](../design/modularization-implementation-status.md)                 | Package extraction phases, shims        |
| [Contributor Technical Specification §1.1](../contributing/clawql-contributor-technical-specification.md) | Full `Plugin` field semantics           |
| [MCP tools matrix](../mcp/mcp-tools.md)                                                                   | Tool parameters and env gates           |
| [#306](https://github.com/danielsmithdevelopment/ClawQL/issues/306)                                       | Package delivery epic                   |
