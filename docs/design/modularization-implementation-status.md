# Modularization implementation status

**As of June 2026** · Ground truth for package extraction ([#306](https://github.com/danielsmithdevelopment/ClawQL/issues/306))

> **Read this first** when you need **shipped vs planned** for the monorepo layout, MCP wiring, plugin roadmap, or Effect-TS migration. Vision docs ([`clawql-master-enablement-guide.md`](../vision/clawql-master-enablement-guide.md), [`clawql-modularization-v2.md`](../vision/clawql-modularization-v2.md)) describe **target** architecture; this file describes **what is in the tree today**.

Companion: [`effect-ts-modularization-rearchitecture-plan.md`](./effect-ts-modularization-rearchitecture-plan.md) (Effect + plugin program).

---

## 1. Executive summary

ClawQL is mid-flight on a **strangler extraction** from the root `clawql-mcp` package into workspace packages under `packages/`. The MCP server (`src/server.ts`, `src/tools.ts`) remains the **transport adapter**; business logic moves into publishable units with **thin `src/` shims** for backward-compatible imports.

**What landed (extraction phases 1–9, PRs [#401](https://github.com/danielsmithdevelopment/ClawQL/pull/401)–[#430](https://github.com/danielsmithdevelopment/ClawQL/pull/430)):**

| Package             | Role today                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clawql-core`       | Audit ring buffer, cache helpers, Merkle + Cuckoo, `Plugin` types, shared errors                                                                                  |
| `clawql-api`        | Spec load/search, REST/GraphQL/gRPC execute, provider registry, `createClawQLApi()`, Panguard proxy plugin                                                        |
| `clawql-memory`     | Vault I/O, `memory.db`, embeddings, ingest/recall, enterprise citations                                                                                           |
| `clawql-documents`  | `ingest_external_knowledge`, **`DEFAULT_IDP_PIPELINE`** recipe, bundled IDP provider merge (7 vendors via `clawql-api`); automated multi-hop runner still roadmap |
| `clawql-automation` | `schedule` worker, Slack `notify`, Argo **`workflow`** tool (opt-in); NATS/HITL still roadmap                                                                     |

**What is still mostly in `src/`:** MCP tool registration for core tools (`search`/`execute`/`cache`/`audit`), GraphQL proxy entrypoints, server lifecycle, and transport glue (audit/cache MCP wrappers, OTEL, webhooks). **~35 deprecated shims removed** (July 2026); imports now target workspace packages directly.

**Effect-TS:** **Partial.** `search` / `execute` run through `createClawQLApi()` + `SearchService` / `ExecuteService` Effect Layers; extracted packages are still largely **`async`/`await`** with Zod at MCP boundaries. Full Layer composition for memory/documents/automation is **planned**, not shipped.

**Plugin ecosystem:** **Phase 2 in progress.** `MemoryPlugin`, `DocumentsPlugin`, **`AutomationPlugin`** (includes **`hitl_enqueue_label_studio`** when enabled), **`SandboxPlugin`**, and **`OuroborosPlugin`** register MCP tools via `onRegister`. Argo Workflows **`workflow`** tool ships in `AutomationPlugin` when `CLAWQL_ENABLE_WORKFLOW=1` ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243), [ADR 0004](../adr/0004-argo-cd-workflows-clawql-pipelines.md), [workflow design](workflow-tool-argo.md)).

---

## 2. Monorepo layout (today)

```
ClawQL/
├── src/                          # clawql-mcp transport + shims + MCP handlers
│   ├── server.ts, server-http.ts
│   ├── tools.ts                  # registerTools(), search/execute → clawql-api
│   ├── mcp-server-factory.ts
│   ├── clawql-api-adapters.ts    # getClawqlApi(), makeSearchLive / makeExecuteLive
│   └── *.ts shims                # re-export packages (see §4)
├── packages/
│   ├── clawql-core/
│   ├── clawql-api/
│   ├── clawql-memory/
│   ├── clawql-documents/
│   ├── clawql-automation/
│   ├── clawql-sandbox/           # sandbox_exec MCP tool (Kata default in-cluster)
│   ├── clawql-ouroboros/         # evolutionary loop library (separate track)
│   ├── mcp-grpc-transport/
│   └── panguard-mcp-bridge/
└── providers/                    # bundled OpenAPI / GraphQL specs (on disk, not a package)
```

**Build order** (root `package.json` `build` script): `clawql-core` → `clawql-api` → `clawql-memory` → `clawql-documents` → `clawql-automation` → `clawql-sandbox` → transports → root `tsc`.

---

## 3. Request flow (MCP → packages)

```
Agent (stdio / HTTP / gRPC)
        │
        ▼
  src/server*.ts  ──►  createRegisteredMcpServer()
        │
        ▼
  src/tools.ts    ──►  registerTools()
        │
        ├── search / execute ──► getClawqlApi().run(Effect … SearchService / ExecuteService)
        │                              │
        │                              ▼
        │                    packages/clawql-api (execute-core, spec-loader, …)
        │
        ├── memory_ingest / memory_recall ──► clawql-memory (via shims + MCP handlers in src/)
        ├── ingest_external_knowledge ──► clawql-documents
        ├── schedule / notify ──► clawql-automation (+ configureNotifyDeps from tools.ts)
        └── cache / audit ──► clawql-core (via shims)
```

**MCP-only concerns kept in transport:**

- `wrapMcpToolHandler` / OpenTelemetry (`otel-tracing.ts`)
- `logMcpToolShape` (shape logging, no payloads)
- Zod tool schemas at registration time
- `CLAWQL_ENABLE_*` gates in `registerTools()`

---

## 4. Package contents vs `src/` shims

### 4.1 `clawql-core`

| In package                                                        | Still shimmed in `src/`              |
| ----------------------------------------------------------------- | ------------------------------------ |
| `audit/`, `cache` helpers, Merkle, Cuckoo, `Plugin` types, errors | `clawql-audit.ts`, `clawql-cache.ts` |

### 4.2 `clawql-api`

| In package                                                                                                                                    | Still shimmed in `src/`                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `spec-loader`, `spec-search`, `provider-registry`, REST/GraphQL/gRPC execute, auth headers, optional flags, `createClawQLApi`, proxy pipeline | `spec-loader.ts`, `provider-registry.ts`, `auth-headers.ts`, `rest-operation.ts`, native GraphQL/gRPC loaders, … |

**Bundled specs:** `providers/` stays at repo root; `clawql-api` resolves paths via `package-root`.

### 4.3 `clawql-memory`

Use **subpath imports** at server hot paths (avoid the barrel — loads sql.js + heavy graph).

| Subpath                              | Module                                                |
| ------------------------------------ | ----------------------------------------------------- |
| `clawql-memory/vault/config`         | Vault path, startup checks                            |
| `clawql-memory/vault/utils`          | Read/write vault files, write lock                    |
| `clawql-memory/vault/markdown`       | Wikilinks, frontmatter                                |
| `clawql-memory/vault/slug-index`     | Markdown listing, slug map                            |
| `clawql-memory/vault/provider-index` | `_INDEX_*.md` pages                                   |
| `clawql-memory/ingest/*`             | slug, hashes, enterprise citations, `runMemoryIngest` |
| `clawql-memory/recall/recall`        | `runMemoryRecall`, keyword + graph + vector           |
| `clawql-memory/db/memory-db`         | sql.js sidecar, sync, Merkle/Cuckoo artifacts         |
| `clawql-memory/embedding/embedding`  | OpenAI-compatible embeddings                          |
| `clawql-memory/vector/pgvector`      | Postgres pgvector leg                                 |

MCP handlers: `src/memory-ingest.ts`, `src/memory-recall.ts` (thin wrappers + `logMcpToolShape`).

### 4.4 `clawql-documents`

| Subpath                                   | Module                                |
| ----------------------------------------- | ------------------------------------- |
| `clawql-documents/ingest/external-ingest` | `runIngestExternalKnowledge`          |
| `clawql-documents/ingest/url-format`      | URL → Markdown for vault notes        |
| `clawql-documents/pipeline/idp-pipeline`  | `DEFAULT_IDP_PIPELINE`, stage helpers |

**Shipped via MCP + Helm (not a hidden runner):** seven bundled document vendors (**tika**, **gotenberg**, **stirling**, **paperless**, **onyx**, **nextcloud**, **coneshare**) in `clawql-api` — agents compose **`search`/`execute`**; see [`idp-pipeline.md`](../providers/idp-pipeline.md).

**Not yet extracted:** automated orchestration with retries, Merkle per hop, Presidio gateway hooks (vision in [`clawql-modularization-v2.md`](../vision/clawql-modularization-v2.md) §3.2).

MCP handler: `src/external-ingest.ts`.

### 4.5 `clawql-automation`

| Subpath                               | Module                                            |
| ------------------------------------- | ------------------------------------------------- |
| `clawql-automation/schedule/schedule` | sql.js schedule DB, worker, synthetic HTTP checks |
| `clawql-automation/notify/notify`     | `runNotifySlack` via injected `execute`           |
| `clawql-automation/workflow/workflow` | Argo Workflows submit/get/wait/list/logs (opt-in) |

`tools.ts` calls `configureNotifyDeps({ execute: handleClawqlExecuteToolInput })` so the schedule worker can notify without importing `tools.ts` (breaks the old circular import).

MCP: `handleScheduleToolInput` shim in `src/clawql-schedule.ts`; `handleNotifyToolInput` remains exported from `tools.ts` as a one-liner delegate. **`workflow`** registers via **`AutomationPlugin.onRegister`** when `CLAWQL_ENABLE_WORKFLOW=1` — see [workflow-tool-argo.md](workflow-tool-argo.md).

---

## 5. Extraction phases (merged)

| Phase | PR                                                                | Extraction                                                             |
| ----- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1b    | [#399](https://github.com/danielsmithdevelopment/ClawQL/pull/399) | `clawql-core` + `clawql-api` scaffold; audit/cache                     |
| 2     | [#401](https://github.com/danielsmithdevelopment/ClawQL/pull/401) | spec-loader/search; Panguard `beforeCallTool`; memory package scaffold |
| 3     | [#423](https://github.com/danielsmithdevelopment/ClawQL/pull/423) | REST execute; memory vault subpaths                                    |
| 4     | [#425](https://github.com/danielsmithdevelopment/ClawQL/pull/425) | GraphQL execute helpers                                                |
| 5     | [#426](https://github.com/danielsmithdevelopment/ClawQL/pull/426) | Native GraphQL/gRPC; removed `ExecuteEnvironment`                      |
| 6     | [#427](https://github.com/danielsmithdevelopment/ClawQL/pull/427) | memory-db cluster (embedding, pgvector, artifacts)                     |
| 7     | [#428](https://github.com/danielsmithdevelopment/ClawQL/pull/428) | memory ingest/recall + enterprise citations                            |
| 8     | [#429](https://github.com/danielsmithdevelopment/ClawQL/pull/429) | `clawql-documents` package                                             |
| 9     | [#430](https://github.com/danielsmithdevelopment/ClawQL/pull/430) | `clawql-automation` (schedule + notify)                                |

**Planned (not extracted):** Kubernetes Operator + **`ClawQLInstance` CRD** — see [`operator-target-architecture.md`](./operator-target-architecture.md) ([#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)).

**Next extraction (post–phase 9)** ([plan §6](./effect-ts-modularization-rearchitecture-plan.md#6-mapping-src--packages-first-extraction-order)):

| Order | Target                      | Representative `src/`                     |
| ----- | --------------------------- | ----------------------------------------- |
| 7     | `clawql-sandbox`            | `sandbox-*.ts`                            |
| 8     | `clawql-ouroboros`          | Effect rewrite + thin MCP glue            |
| 9     | Transport-only `clawql-mcp` | `server.ts`, `tools.ts` registration only |

---

## 6. Plugin ecosystem — shipped vs roadmap

### 6.1 Shipped today

```ts
// packages/clawql-core — minimal contract
interface Plugin {
  id: string;
  version: string;
  kind?: "default" | "mcp-proxy";
  onRegister?: (api: ClawQLPluginRegistrationApi) => Effect.Effect<void, ClawQLError>;
  onTeardown?: () => Effect.Effect<void, ClawQLError>;
  beforeCallTool?: (ctx) => Effect.Effect<void, ClawQLError>; // mcp-proxy
}
```

- **`PluginRegistry`** (`clawql-api`) — register plugins at `createClawQLApi()` startup; `onRegister` receives `ClawQLPluginRegistrationApi` with `registerMcpTool`.
- **`PanguardProxyPlugin`** — first `mcp-proxy` plugin; `beforeCallTool` for policy/ATR chokepoint ([#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272)).
- **`MemoryPlugin`** (`createMemoryPlugin`) — registers `memory_ingest` / `memory_recall` via `onRegister` when `CLAWQL_ENABLE_MEMORY` is on (default).
- **`DocumentsPlugin`** (`createDocumentsPlugin` in `clawql-documents`) — registers `ingest_external_knowledge` and optionally `knowledge_search_onyx` when documents/Onyx flags are on; composed from `src/clawql-api-adapters.ts`.
- **`McpProxyPipeline`** — wires registry into MCP tool path via `clawql-api-adapters.ts`.

- **`AutomationPlugin`** (`createAutomationPlugin` in `clawql-automation`) — registers `schedule` / `notify` / `workflow` when enabled; starts schedule worker in `onRegister`. Argo **`workflow`** is opt-in (`CLAWQL_ENABLE_WORKFLOW=1`) ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243), [workflow-tool-argo.md](workflow-tool-argo.md)).
- **`SandboxPlugin`** (`createSandboxPlugin` in `clawql-sandbox`) — registers `sandbox_exec` when `CLAWQL_ENABLE_SANDBOX=1`. **Kata Containers** default in-cluster (`auto` cascade); Docker / bridge / Seatbelt fallbacks.
- **`OuroborosPlugin`** (`createOuroborosPlugin` in `clawql-ouroboros`) — registers `ouroboros_*` when `CLAWQL_ENABLE_OUROBOROS=1`; Postgres pool shutdown in `onRegister` / `onTeardown`.

### 6.2 Target (third-party + vertical plugins)

**Full explanation (recommended read):** [ClawQL plugin model](./clawql-plugin-model.md) — what memory/documents/automation “becoming plugins” means. **Registry:** [Plugin registry](../reference/clawql-plugin-registry.md) — shipped vs planned plugins, MCP tools, enable flags.

From enablement §5.4 and the Effect plan §8:

1. **Horizontal plugins** export `MemoryLayer`, `DocumentsLayer`, `AutomationLayer`, … composed into `createClawQLApi({ layers: [...] })`.
2. **`onRegister`** registers MCP tools **and** internal operations (no duplicate `tools.ts` switches).
3. **`requiredSpecs` / `recommendedSpecs`** validated at startup.
4. **`onIngestHook` / `onRecallFilter`** for pipeline chaining.
5. **Third-party npm packages** publish `clawql-*-plugin` with a documented `Plugin` + Layer entry; Operator/CRD toggles include or omit Layers (**zero footprint when off**).

**Contributor path (future):** publish a package that depends on `clawql-core` + `clawql-api`, implements `Plugin`, documents `CLAWQL_ENABLE_*` or Operator toggle, and does **not** import `clawql-mcp` transport. Until Layer registration lands, extensions should target **bundled providers** (`providers/`) + MCP tools in-repo.

---

## 7. Effect-TS migration status

| Area                                                     | Status                                                 |
| -------------------------------------------------------- | ------------------------------------------------------ |
| `effect` dependency                                      | ✅ Pinned in `clawql-api`                              |
| `SearchService` / `ExecuteService`                       | ✅ Live Layers; MCP uses `getClawqlApi().run(Effect…)` |
| `AuditLive`                                              | ✅ Composed in `createClawQLApi()`                     |
| `Plugin` / `PluginRegistry`                              | ✅ Effect `register` / `beforeCallTool`                |
| Extracted packages (`memory`, `documents`, `automation`) | ❌ Still `async`; no `Layer` wrappers                  |
| `@effect/schema` at boundaries                           | ❌ Zod remains at MCP tool registration                |
| Memory/Documents `Plugin` Layers                         | 📋 Planned                                             |
| Operator dynamic Layer list from CRD                     | 📋 Deferred until `createApi(Layer[])` stable          |

**Rule for new code in extracted packages:** prefer Effect in `clawql-core` / `clawql-api`; legacy `async` is acceptable at IO edges during migration (`Effect.tryPromise`). See plan §7.

---

## 8. What “full modularization” still means

These vision items are **not** done by package extraction alone:

| Vision item                                   | Status                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `clawql-auth` package                         | 📋 Auth headers + env JSON in `clawql-api`; no standalone auth package |
| `clawql-pageindex`                            | 📋 Not started                                                         |
| Document pipeline (Tika → … → Paperless)      | 📋 Orchestration not in `clawql-documents` yet                         |
| NATS / HITL in `clawql-automation`            | ✅ Shipped (JetStream publish + HITL resume consumer)                  |
| Kubernetes Operator Layer composition         | 📋 Planned                                                             |
| Transport-only `clawql-mcp` npm package split | 📋 `src/` slimmed; shims removed; transport glue remains |

---

## 9. References

| Doc                                                                       | Use when                                  |
| ------------------------------------------------------------------------- | ----------------------------------------- |
| [ClawQL plugin model](./clawql-plugin-model.md)                           | Horizontal plugins, MCP tool registration |
| [Plugin registry](../reference/clawql-plugin-registry.md)                 | Shipped vs planned plugins, enable flags  |
| [Master enablement guide](../vision/clawql-master-enablement-guide.md)    | Platform intent, 6-layer model            |
| [Modularization v2](../vision/clawql-modularization-v2.md)                | Target package boundaries, gateway design |
| [Effect + plugin plan](./effect-ts-modularization-rearchitecture-plan.md) | Effect phases, plugin checklist, CI       |
| [Vision & roadmap](../vision/clawql-vision-roadmap.md)                    | Public shipped vs planned table           |
| [MCP tools](../mcp/mcp-tools.md)                                          | Operator-facing tool matrix               |
| [#306](https://github.com/danielsmithdevelopment/ClawQL/issues/306)       | Package delivery epic                     |
