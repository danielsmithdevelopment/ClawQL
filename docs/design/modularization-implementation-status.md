# Modularization implementation status

**As of July 2026** · Ground truth for package extraction ([#306](https://github.com/danielsmithdevelopment/ClawQL/issues/306))

> **Read this first** when you need **shipped vs planned** for the monorepo layout, MCP wiring, plugin roadmap, or Effect-TS migration. Vision docs ([`clawql-master-enablement-guide.md`](../vision/clawql-master-enablement-guide.md), [`clawql-modularization-v2.md`](../vision/clawql-modularization-v2.md)) describe **target** architecture; this file describes **what is in the tree today**.

Companion: [`effect-ts-modularization-rearchitecture-plan.md`](./effect-ts-modularization-rearchitecture-plan.md) (Effect + plugin program).

---

## 1. Executive summary

ClawQL is mid-flight on a **strangler extraction** from the root `clawql-mcp` package into workspace packages under `packages/`. The MCP server (`src/server.ts`, `src/tools.ts`) remains the **transport adapter**; business logic moves into publishable units with **thin `src/` shims** for backward-compatible imports.

**What landed (extraction phases 1–9, PRs [#401](https://github.com/danielsmithdevelopment/ClawQL/pull/401)–[#430](https://github.com/danielsmithdevelopment/ClawQL/pull/430)):**

| Package             | Role today                                                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clawql-core`       | Audit ring buffer, cache helpers, Merkle + Cuckoo, `Plugin` types, shared errors                                                                                                                                                                            |
| `clawql-auth`       | Gateway auth (`noAuth` / `apiKey`, ATR claims) + upstream provider credential headers (AWS SigV4, env JSON)                                                                                                                                                 |
| `clawql-pageindex`  | Standalone MIT vectorless hierarchical indexing — build/traverse/synthesize MCP helpers                                                                                                                                                                     |
| `clawql-api`        | Spec load/search, REST/GraphQL/gRPC execute, provider registry, `createClawQLApi()`, Panguard proxy plugin, Presidio gateway hooks                                                                                                                          |
| `clawql-memory`     | Vault I/O, `memory.db`, embeddings, ingest/recall, enterprise citations                                                                                                                                                                                     |
| `clawql-documents`  | `ingest_external_knowledge`, **`DEFAULT_IDP_PIPELINE`**, **`run_idp_pipeline`** ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)), **`classify_document`** / **`extract_document`**; bundled IDP merge (**8 vendors** via `clawql-api`) |
| `clawql-automation` | `schedule` worker, Slack `notify`, Argo **`workflow`** + **`argocd`** tools (opt-in); NATS JetStream publish/consume when enabled ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254))                                                     |
| `clawql-sandbox`    | `sandbox_exec` via **`SandboxPlugin`** (Kata default in-cluster **`auto`**)                                                                                                                                                                                 |
| `clawql-ouroboros`  | Evolutionary loop library + **`OuroborosPlugin`** (`ouroboros_*` tools, opt-in)                                                                                                                                                                             |
| `clawql-operator`   | Opt-in K8s operator — `ClawQLInstance` CRD, tier-spec ConfigMaps, horizontal layer composition from CRD, auth key reconciliation ([#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255))                                                      |
| `clawql-release`    | Layer 0 MVP — manifest v0.1, Merkle root, SBOM/npm + GHCR digests, `clawql release *`, CI artifact ([#537](https://github.com/danielsmithdevelopment/ClawQL/pull/537))                                                                                      |

**7.0 product surface (not separate packages):** custom sources (OpenAPI/Discovery/GraphQL/gRPC/MCP/CLI from URL), harness wrappers (`clawql claude|codex|cursor|opencode`), `curl | bash` install script, ClawQL Desktop (macOS/Windows/Linux). See [custom-sources.md](../getting-started/custom-sources.md) and [Getting started](https://docs.clawql.com/getting-started).

**What is still mostly in `src/`:** MCP tool registration for core tools (`search`/`execute`/`cache`/`audit`), GraphQL proxy entrypoints, server lifecycle, and transport glue (audit/cache MCP wrappers, OTEL, webhooks). **~35 deprecated shims removed** (July 2026); imports now target workspace packages directly.

**Effect-TS:** **Partial.** `search` / `execute` run through `createClawQLApi()` + `SearchService` / `ExecuteService` Effect Layers; all horizontal tiers register via **`pluginLayers`** (`makeMemoryLayer`, `makeDocumentsLayer`, `makeAutomationLayer`, `makeSandboxLayer`, `makeOuroborosLayer`) composed by `composeHorizontalPluginLayers()` in `src/compose-horizontal-plugin-layers.ts`. Domain packages remain largely **`async`/`await`** at IO edges.

**Plugin ecosystem:** **Phase 2 shipped.** `MemoryPlugin`, `DocumentsPlugin`, **`AutomationPlugin`** (includes **`hitl_enqueue_label_studio`** when enabled), **`SandboxPlugin`**, and **`OuroborosPlugin`** register MCP tools via `onRegister`. Argo Workflows **`workflow`** and Argo CD **`argocd`** ship in `AutomationPlugin` when enabled ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243), [#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244), [ADR 0004](../adr/0004-argo-cd-workflows-clawql-pipelines.md), [workflow design](workflow-tool-argo.md)).

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
│   ├── clawql-auth/
│   ├── clawql-pageindex/
│   ├── clawql-api/
│   ├── clawql-memory/
│   ├── clawql-documents/
│   ├── clawql-automation/
│   ├── clawql-sandbox/           # sandbox_exec MCP tool (Kata default in-cluster)
│   ├── clawql-ouroboros/         # evolutionary loop library + OuroborosPlugin
│   ├── clawql-operator/          # opt-in K8s operator (CRD + reconcile)
│   ├── clawql-release/           # Layer 0 manifest MVP
│   ├── mcp-grpc-transport/
│   └── panguard-mcp-bridge/
└── providers/                    # bundled OpenAPI / GraphQL specs (on disk, not a package)
```

**Build order** (root `package.json` `build` script): `clawql-core` → `clawql-auth` → `clawql-pageindex` → `clawql-api` → `clawql-memory` → … → root `tsc`.

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
        ├── memory_ingest / memory_recall / pageindex_* ──► clawql-memory (+ clawql-pageindex)
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

**Not yet extracted to automated orchestration:** retries, Merkle per hop across the full IDP pipeline (vision in [`clawql-modularization-v2.md`](../vision/clawql-modularization-v2.md) §3.2). **Presidio gateway hooks** (execute + memory ingest + external ingest) ship in `clawql-api` when `CLAWQL_ENABLE_PRESIDIO=1` — see [MCP clients — Presidio](https://docs.clawql.com/mcp-clients#presidio-redaction).

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

**Operator scaffold (opt-in, 7.0):** `packages/clawql-operator` + `charts/clawql-operator` — CRD validation, tier-spec ConfigMaps, `composeHorizontalPluginLayersFromTierSpec()`, optional MCP overlay via `instanceSpec.enabled` ([#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)). Does **not** replace Helm/env defaults. See [`clawql-operator-helm.md`](../deployment/clawql-operator-helm.md).

**Layer 0 MVP (7.0):** `packages/clawql-release` — `init` / `collect` / `manifest` / `verify` / `publish`; wired as `clawql release *`. See [Immutable releases](https://docs.clawql.com/vision/immutable-releases).

**Next extraction (post–phase 9)** ([plan §6](./effect-ts-modularization-rearchitecture-plan.md#6-mapping-src--packages-first-extraction-order)):

| Order | Target                      | Representative `src/`                     | Status                                                                                                             |
| ----- | --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 7     | `clawql-sandbox`            | `sandbox-*.ts`                            | ✅ Done — package + plugin live under `packages/clawql-sandbox/` (no root `src/sandbox-*`)                         |
| 8     | `clawql-ouroboros`          | Effect rewrite + thin MCP glue            | ✅ Done — package under `packages/clawql-ouroboros/`; Effect services for tools, EventStore, loop, poller, engines |
| 9     | Transport-only `clawql-mcp` | `server.ts`, `tools.ts` registration only | 📋 Next                                                                                                            |

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
- **`MemoryPlugin`** (`createMemoryPlugin` in `clawql-memory`) — registers `memory_ingest` / `memory_recall` and `pageindex_*` tools via `makeMemoryLayer()` when `CLAWQL_ENABLE_MEMORY` is on (default); hide PageIndex only with `CLAWQL_ENABLE_PAGEINDEX=0`.
- **`DocumentsPlugin`** (`createDocumentsPlugin` in `clawql-documents`) — registers `ingest_external_knowledge` and optionally `knowledge_search_onyx` when documents/Onyx flags are on; composed from `src/clawql-api-adapters.ts`.
- **`McpProxyPipeline`** — wires registry into MCP tool path via `clawql-api-adapters.ts`.

- **`AutomationPlugin`** (`createAutomationPlugin` in `clawql-automation`) — registers `schedule` / `notify` / `workflow` when enabled; starts schedule worker in `onRegister`. Argo **`workflow`** is opt-in (`CLAWQL_ENABLE_WORKFLOW=1`) ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243), [workflow-tool-argo.md](workflow-tool-argo.md)).
- **`SandboxPlugin`** (`createSandboxPlugin` in `clawql-sandbox`) — registers `sandbox_exec` via `makeSandboxLayer()` when `CLAWQL_ENABLE_SANDBOX=1`.
- **`OuroborosPlugin`** (`createOuroborosPlugin` in `clawql-ouroboros`) — registers `ouroboros_*` via `makeOuroborosLayer()` when `CLAWQL_ENABLE_OUROBOROS=1`; Postgres pool shutdown in `onRegister` / `onTeardown`.

### 6.2 Target (third-party + vertical plugins)

**Full explanation (recommended read):** [ClawQL plugin model](./clawql-plugin-model.md) — what memory/documents/automation “becoming plugins” means. **Registry:** [Plugin registry](../reference/clawql-plugin-registry.md) — shipped vs planned plugins, MCP tools, enable flags.

From enablement §5.4 and the Effect plan §8:

1. **Horizontal plugins** export `MemoryLayer`, `DocumentsLayer`, `AutomationLayer`, `SandboxLayer`, `OuroborosLayer`, … composed into `createClawQLApi({ pluginLayers })` via `composeHorizontalPluginLayers()` or `composeHorizontalPluginLayersFromTierSpec()` for Operator/CRD reconciliation ([#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)).
2. **`onRegister`** registers MCP tools **and** internal operations (no duplicate `tools.ts` switches).
3. **`requiredSpecs` / `recommendedSpecs`** validated at startup.
4. **`onIngestHook` / `onRecallFilter`** for pipeline chaining.
5. **Third-party npm packages** publish `clawql-*-plugin` with a documented `Plugin` + Layer entry; Operator/CRD toggles include or omit Layers (**zero footprint when off**).

**Contributor path (future):** publish a package that depends on `clawql-core` + `clawql-api`, implements `Plugin`, documents `CLAWQL_ENABLE_*` or Operator toggle, and does **not** import `clawql-mcp` transport. Until Layer registration lands, extensions should target **bundled providers** (`providers/`) + MCP tools in-repo.

---

## 7. Effect-TS migration status

**Migration complete (July 2026) for Effect programs / Layers / fibers.** Remaining strangler work is **`effect/Schema` at MCP argument boundaries** (Zod → Effect Schema). External IO stays behind `Effect.tryPromise` / `*FromPromise`. Promise façades remain where the MCP SDK requires them. Soft Zod shapes stay at `server.tool` registration only until the SDK accepts Standard Schema without a Zod peer.

**Workers / fibers:** schedule, Ouroboros seeds poller, and inference pipeline workers use daemon fibers + interruptible sleep (skip-if-busy `Ref`) instead of `setInterval`. Nested `Effect.runPromise` inside poller Effect.gen is removed (`OuroborosLoopService.run` is invoked as an Effect).

| Area                                                                             | Status                                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect` dependency                                                              | ✅ Pinned in `clawql-api`                                                                                                                                                                |
| `SearchService` / `ExecuteService`                                               | ✅ Live Layers; MCP uses `getClawqlApi().run(Effect…)`; cores use `Effect.withSpan` (`clawql.search` / `clawql.execute`)                                                                 |
| Effect ↔ OTEL Tracer bridge                                                      | ✅ `@effect/opentelemetry` via `makeEffectOtelTracerLayer` + `attachActiveOtelParent` (nests under `mcp.tool.*` when OTLP enabled)                                                       |
| `AuditLive` / MCP `audit`                                                        | ✅ Composed in `createClawQLApi()`; MCP `audit` via `runAuditOperation` → `AuditService` (parity with cache)                                                                             |
| Workflow audit append                                                            | ✅ `appendWorkflowAuditEffect` → `AuditService`; sync façade provides `AuditLive` (no direct ring-buffer import in automation)                                                           |
| Payments WORM `appendEntry` ring mirror                                          | ✅ Mirrors via `AuditService` (`paymentAuditLiveLayer` requires `AuditService`; runtime provides `AuditLive`)                                                                            |
| `Plugin` / `PluginRegistry`                                                      | ✅ Effect `register` / `beforeCallTool`                                                                                                                                                  |
| Extracted packages (`memory`, `documents`, `automation`, `sandbox`, `ouroboros`) | ✅ Native `Effect.gen` on tool hot paths (IO edges still `tryPromise`)                                                                                                                   |
| `effect/Schema` at MCP boundaries                                                | 🚧 Core + memory + documents/Onyx MCP inputs decode via Effect Schema; thin Zod edges for MCP SDK listing. Next: automation → sandbox → ouroboros → pageindex/codegraph → registry types |
| End state: no Zod in domain validation                                           | 🎯 Effect Schema everywhere in pipelines; Zod only as MCP SDK peer adapter (or gone after Standard Schema SDK upgrade)                                                                   |
| Horizontal `Plugin` Layers                                                       | ✅ All tiers via `composeHorizontalPluginLayers()`; owned by ManagedRuntime Scope until `dispose`                                                                                        |
| Operator dynamic Layer list from CRD                                             | ✅ `composeHorizontalPluginLayersFromTierSpec()` maps `ClawQLHorizontalTierSpec` → Layers                                                                                                |
| `MemoryIngestService` / vault post-sync                                          | ✅ Native `Effect.gen` stages prepare → vault write → `MemoryDbService` sync (no nested `runMemoryEffect`)                                                                               |
| Memory `pageindex_*` tools                                                       | ✅ Native `Effect.gen` soft wrappers (storage IO via `memoryFromPromise`)                                                                                                                |
| `DocumentsToolsService` IDP runner                                               | ✅ Native `Effect.gen` hop loop (skip/dry-run/execute+retry/Merkle/onHop); Promise façade kept for tests                                                                                 |
| `DocumentsToolsService` classify / extract                                       | ✅ Native `Effect.gen` (resolve URL → heuristic sync \| HTTP POST → parse); Promise façades kept                                                                                         |
| `DocumentsIngestService` external ingest                                         | ✅ Native `Effect.gen` prelude → prepare/fetch → write → `vaultWritePostSyncEffect` (no nested `runMemoryEffect`)                                                                        |
| `knowledge_search_onyx`                                                          | ✅ Native `Effect.gen` loadSpec → gates → execute                                                                                                                                        |
| `AutomationToolsService` notify                                                  | ✅ Native `Effect.gen` prelude → loadSpec → execute → reshape; schedule/workflow side-channels use `executeNotifySlackCore` (no nested runtime)                                          |
| `AutomationToolsService` schedule / workflow                                     | ✅ Native `Effect.gen` (schedule: parse → open DB → dispatch → close; workflow: enabled → soft Zod → K8s/wait; wait via `Effect.sleep`)                                                  |
| `AutomationToolsService` argocd                                                  | ✅ Native `Effect.gen` enabled → soft Zod → K8s CRD list/get/sync                                                                                                                        |
| `hitl_enqueue_label_studio`                                                      | ✅ Native `Effect.gen` config/validate → HTTP import → NATS publish hook                                                                                                                 |
| `SandboxExecService` sandbox_exec                                                | ✅ Native `Effect.gen` (parse backend → resolve probes → dispatch Kata/Docker/Seatbelt/bridge → shape); Promise façade kept                                                              |
| Background workers (schedule / ouroboros poller / inference pipeline)            | ✅ Daemon fibers + `Effect.sleep` loops (skip-if-busy `Ref`); interruptible `stop()`; TestClock-covered                                                                                  |
| ManagedRuntime `dispose` + process shutdown                                      | ✅ `ClawQLApiHandle.dispose` → plugin `teardownAll` + `runtime.dispose`; MCP registers `disposeClawqlApi` on SIGINT/SIGTERM                                                              |
| Postgres / NATS `acquireRelease`                                                 | ✅ Scoped Effect helpers for Ouroboros + pgvector pools and NATS HITL consumer (singleton façades retained)                                                                              |

**Rule for new code in extracted packages:** prefer Effect in `clawql-core` / `clawql-api`; legacy `async` is acceptable **only** at IO edges (`Effect.tryPromise`). See plan §7.

---

## 8. What “full modularization” still means

These vision items are **not** done by package extraction alone:

| Vision item                                   | Status                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `clawql-auth` package                         | ✅ Gateway `noAuth`/`apiKey`, ATR claims, provider headers; HTTP MCP middleware            |
| `clawql-pageindex`                            | ✅ MIT package + `pageindex_*` MCP tools (default on; `CLAWQL_ENABLE_PAGEINDEX=0` to hide) |
| Document pipeline (Tika → … → Paperless)      | 🚧 Vendors + `run_idp_pipeline` shipped; retries/Merkle per hop roadmap                    |
| NATS / HITL in `clawql-automation`            | ✅ Shipped (JetStream publish + HITL resume consumer)                                      |
| Layer 0 immutable releases                    | 🚧 MVP (`clawql-release`); Arweave/Rift/Radicle roadmap                                    |
| Release manifest verification at gateway      | ✅ `clawql doctor --smoke` + optional `CLAWQL_RELEASE_MANIFEST` at MCP startup             |
| Kubernetes Operator Layer composition         | 🚧 Phase 1 scaffold (CRD + ConfigMap + tier layers; no NL dashboard)                       |
| Tier 1 Docker Compose                         | ✅ `examples/clawql-local-docker-compose` + `make compose-tier1-config-test`               |
| Transport-only `clawql-mcp` npm package split | 📋 `src/` slimmed; shims removed; transport glue remains                                   |
| Presidio gateway hooks                        | ✅ Execute + memory ingest + external ingest redaction when `CLAWQL_ENABLE_PRESIDIO=1`     |
| All vertical packages                         | 📋 Not started                                                                             |

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
| [Immutable releases](https://docs.clawql.com/vision/immutable-releases)   | Layer 0 manifest commands, CI             |
| [Getting started](https://docs.clawql.com/getting-started)                | Auth, PageIndex, Presidio, Tier 1 Compose |
| [clawql-operator-helm](../deployment/clawql-operator-helm.md)             | Operator scaffold install                 |

---

## 10. Phase 1 exit — complete (7.0.0)

**Shipped (7.0):** release manifest verification, dashboard custom sources, **`clawql-auth`**, **`clawql-pageindex`**, Presidio gateway hooks, Tier 1 Docker Compose ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)).

**Next (Phase 2):** third-party vertical plugins, full Operator NL ops, contract test suite expansion, transport-only npm split.

---

## 11. npm distribution (7.1.0 — separate packages)

**Model:** Each horizontal **`clawql-*`** package is a **separate publishable unit** at **`7.1.0`**, linked in the monorepo via matching semver (npm workspaces). **`clawql-mcp`** depends on them as normal registry dependencies — **not** `bundledDependencies`.

| Package                      | npm name            | Version     |
| ---------------------------- | ------------------- | ----------- |
| `packages/clawql-core`       | `clawql-core`       | 7.1.0       |
| `packages/clawql-auth`       | `clawql-auth`       | 7.1.0       |
| `packages/clawql-pageindex`  | `clawql-pageindex`  | 7.1.0 (MIT) |
| `packages/clawql-codegraph`  | `clawql-codegraph`  | 7.1.0       |
| `packages/clawql-api`        | `clawql-api`        | 7.1.0       |
| `packages/clawql-memory`     | `clawql-memory`     | 7.1.0       |
| `packages/clawql-ontology`   | `clawql-ontology`   | 7.1.0       |
| `packages/clawql-documents`  | `clawql-documents`  | 7.1.0       |
| `packages/clawql-automation` | `clawql-automation` | 7.1.0       |
| `packages/clawql-sandbox`    | `clawql-sandbox`    | 7.1.0       |
| `packages/clawql-inference`  | `clawql-inference`  | 7.1.0       |
| `packages/clawql-payments`   | `clawql-payments`   | 7.1.0       |
| `packages/clawql-ouroboros`  | `clawql-ouroboros`  | 7.1.0       |
| `packages/clawql-operator`   | `clawql-operator`   | 7.1.0       |
| `packages/clawql-release`    | `clawql-release`    | 7.1.0       |
| Root                         | `clawql-mcp`        | 7.1.0       |

**Publish order:** [`scripts/release/npm-publish-order.json`](../../scripts/release/npm-publish-order.json) — dependencies before dependents; **`clawql-mcp` last**.

**CI smoke:** [`scripts/dev/test-npm-pack-install.sh`](../../scripts/dev/test-npm-pack-install.sh) packs all workspace packages, installs from tarballs, verifies module resolution.

**Not in this wave:** `clawql-telemetry` ([#313](https://github.com/danielsmithdevelopment/ClawQL/issues/313)); `mcp-grpc-transport` and `panguard-mcp-bridge` keep independent cadence.

**Planned adjacent package:** `mcp-openapi-gateway` — MCP tools → named REST + OpenAPI on-ramp with gRPC `CallTool` as preferred backend (funnel onto `mcp-grpc-transport`). Design: [`docs/design/mcp-openapi-gateway.md`](../design/mcp-openapi-gateway.md). Independent npm cadence (same model as `mcp-grpc-transport`); does **not** depend on `clawql-api`.

**npm publish:** workflow [`.github/workflows/npm-publish.yml`](../../.github/workflows/npm-publish.yml) + [`scripts/release/npm-publish-workspace.mjs`](../../scripts/release/npm-publish-workspace.mjs). Tag **`v7.1.0`** when ready — see [`docs/release/v7.1.0-checklist.md`](../release/v7.1.0-checklist.md).
