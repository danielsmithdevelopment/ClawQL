# ADR 0002: Multi-protocol supergraph (GraphQL Mesh / unified `search` + `execute`)

- Status: Accepted (native GraphQL + gRPC merge shipped in-tree; unified Mesh/stitch composition remains a spike — [#179](https://github.com/danielsmithdevelopment/ClawQL/issues/179))
- Date: 2026-04-27 (updated: implementation notes 2026-04-27)
- Epic: [#178](https://github.com/danielsmithdevelopment/ClawQL/issues/178)
- Related issues: [#179](https://github.com/danielsmithdevelopment/ClawQL/issues/179)–[#196](https://github.com/danielsmithdevelopment/ClawQL/issues/196) (label **`supergraph`**)

## Release scope: **clawql-mcp 5.0.0**

**In scope for 5.0.0 — first-class protocols only:**

| Protocol    | Intent                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GraphQL** | Beyond today’s OpenAPI→GraphQL (`@omnigraph/openapi`): load **native GraphQL** endpoints / subgraphs into the same **`search` → `execute`** index and merged execution path (see [#179](https://github.com/danielsmithdevelopment/ClawQL/issues/179), [#188](https://github.com/danielsmithdevelopment/ClawQL/issues/188) generic handler slice, [#189](https://github.com/danielsmithdevelopment/ClawQL/issues/189)). |
| **gRPC**    | **Reflection** (and/or proto files) as first-class sources alongside OpenAPI, with operations surfaced consistently for **`search` / `execute`** ([#186](https://github.com/danielsmithdevelopment/ClawQL/issues/186)).                                                                                                                                                                                                |

**Shared foundation for 5.0.0 (shipped vs follow-up):** [#180](https://github.com/danielsmithdevelopment/ClawQL/issues/180) / [#181](https://github.com/danielsmithdevelopment/ClawQL/issues/181) (types + `normalizeOperationId` + indexing) — **done in-tree**. [#179](https://github.com/danielsmithdevelopment/ClawQL/issues/179) Mesh vs stitch / [#189](https://github.com/danielsmithdevelopment/ClawQL/issues/189) unified runtime schema — **spike / backlog** (not required for native env merge). [#190](https://github.com/danielsmithdevelopment/ClawQL/issues/190) subscription guard — **subscriptions omitted** from native GraphQL index; streaming gRPC RPCs skipped. [#191](https://github.com/danielsmithdevelopment/ClawQL/issues/191) / [#192](https://github.com/danielsmithdevelopment/ClawQL/issues/192) — **lightweight counters + `registerSpecCacheShutdownHooks`**; Prometheus export remains optional follow-up. [#195](https://github.com/danielsmithdevelopment/ClawQL/issues/195) — **`load-env.ts`** + **`.env.example`** document **`CLAWQL_*`** (including **`CLAWQL_GRAPHQL_SOURCES`** / **`CLAWQL_GRPC_SOURCES`**).

**Explicitly deferred past 5.0.0** (issues remain open; not part of the 5.0.0 milestone):

- **Data stores / chain / events:** Postgres ([#182](https://github.com/danielsmithdevelopment/ClawQL/issues/182)), Redis ([#183](https://github.com/danielsmithdevelopment/ClawQL/issues/183)), SQLite ([#184](https://github.com/danielsmithdevelopment/ClawQL/issues/184)), NATS ([#185](https://github.com/danielsmithdevelopment/ClawQL/issues/185)).
- **Web3 / specialized:** Hyperledger Fabric ([#187](https://github.com/danielsmithdevelopment/ClawQL/issues/187)), The Graph + **x402** ([#188](https://github.com/danielsmithdevelopment/ClawQL/issues/188) — split “The Graph” follow-up when generic GraphQL lands).
- **Cross-cutting** that assumed those sources: full [#193](https://github.com/danielsmithdevelopment/ClawQL/issues/193) allowlists as written, [#194](https://github.com/danielsmithdevelopment/ClawQL/issues/194) Ouroboros multi-kind seeds, [#196](https://github.com/danielsmithdevelopment/ClawQL/issues/196) broad testcontainers matrix — revisit after 5.0.0 unless trimmed to GraphQL/gRPC-only tests.

The longer-term **vision** (all sources behind one supergraph) is unchanged; **5.0.0 ships only the GraphQL + gRPC slice.**

---

## Context

Today ClawQL builds an in-process GraphQL schema from **OpenAPI** via **`@omnigraph/openapi`** (`graphql-schema-builder.ts`). Multi-spec merges keep **`search`** on one index; **`execute`** uses **REST** per owning OpenAPI/Discovery spec **unless** the operation is a **native** GraphQL or gRPC entry (see § Current implementation). Combined HTTP **`/graphql`** still reflects the **first** OpenAPI spec for debugging. The product direction remains a **unified supergraph** so additional protocols can participate behind **`search` → `execute`** without breaking existing OpenAPI/Discovery users.

### Current implementation (in-repo)

- **Env:** **`CLAWQL_GRAPHQL_URL`** / **`CLAWQL_GRAPHQL_NAME`** / **`CLAWQL_GRAPHQL_HEADERS`** (single-endpoint shortcut), **`CLAWQL_GRAPHQL_SOURCES`**, and **`CLAWQL_GRPC_SOURCES`** — parsed by **`src/native-protocol-env.ts`**. With native GraphQL/gRPC configured **and no** OpenAPI/Discovery selection env, **`loadSpec`** skips bundled REST defaults and uses a stub OpenAPI shell (**`shouldLoadNativeProtocolsOnlyMode()`**). Otherwise merge runs after OpenAPI/Discovery load (**`src/native-protocol-merge.ts`**, **`src/spec-loader.ts`**).
- **GraphQL:** Operation index from HTTP introspection at load time, or from **`schemaPath`** / **`introspectionPath`** (SDL on disk or saved introspection JSON) when live introspection is unavailable; **`execute`** POSTs `{ query, variables }` to each configured endpoint (**`src/execute-native-graphql.ts`**, **`src/graphql-native-loader.ts`**). **Bundled GraphQL-only** vendors (e.g. **`linear`**) ship SDL under **`providers/`** and participate in **`CLAWQL_PROVIDER`** / **`all-providers`** merges via **`src/provider-registry.ts`** / **`src/spec-loader.ts`**. Operation ids use **`normalizeOperationId`** (**`src/spec-kind.ts`**).
- **gRPC:** Unary RPCs from **`@grpc/proto-loader`** + **`@grpc/grpc-js`** (**`src/grpc-native-loader.ts`**, **`src/execute-native-grpc.ts`**); streaming RPCs are skipped.
- **Routing:** **`Operation.protocolKind`** — **`execute`** dispatches native protocols before the multi-spec REST branch (**`src/tools.ts`**).

Mesh vs **stitch** / **`buildUnifiedSchema`** ([#189](https://github.com/danielsmithdevelopment/ClawQL/issues/189)) as a single runtime composition layer is **not** required for the above; it remains the longer-term integration spike ([#179](https://github.com/danielsmithdevelopment/ClawQL/issues/179)).

## Decision

### 1) Architecture direction

- Unify protocol handlers through a **single merge strategy** (target: **GraphQL Mesh**-compatible composition or **`@graphql-tools/stitch`** — **spike required** before locking APIs).
- Preserve the **external MCP contract**: **`search`** ranks operations; **`execute`** runs one operation by id. Multi-protocol sources contribute to the same logical operation namespace with **stable, collision-free ids** (see §4).

### 2) Package and handler caveats (non-goals for naive copy-paste)

**Relevant to 5.0.0 (GraphQL / gRPC):**

- **Mesh runtime:** pin **Mesh v0 vs v1** (`createMesh` vs `createServeRuntime` / config-driven); align with repo lockfile before implementation.
- **gRPC:** align with **`@omnigraph/grpc`** or Guild stack already used alongside Omnigraph OpenAPI.

**Deferred sources** (Postgres, Redis, SQLite, NATS): see caveats in full backlog issues — e.g. do not adopt **`@graphql-mesh/postgraphile`** without spike; avoid **`@omnigraph/sqlite`** fragility; etc.

### 3) Transport and subscriptions

- **MCP stdio** does not expose GraphQL **subscriptions** to hosts the same way **gRPC** streaming does. Subscription-heavy flows must document **HTTP/SSE** vs **gRPC** capability; in **stdio**, return a clear error or omit subscription fields from the advertised schema subset where applicable.

### 4) Operation IDs

- Use a **double-underscore** separator for multi-part ids (e.g. `graphql__myApi__hero`), not single colon, to stay safe across MCP clients and URL-adjacent contexts.
- Centralize normalization in **`normalizeOperationId(kind, provider, operation)`** (sanitize segments, join with **`__`**). Implemented in [`src/spec-kind.ts`](../../src/spec-kind.ts).

### 5) Rollout phases (full vision — **not all in 5.0.0**)

1. **5.0.0:** Native **GraphQL** + **gRPC** in the merged index and execution path.
2. **Later:** Internal data layer (Postgres → Redis → SQLite), event backbone (NATS), Fabric / The Graph / x402, polish (metrics, teardown, testcontainers) — see issue list and **Release scope** above.

### 6) Security and ops (full vision)

- Deferred-source specifics (Postgres RLS, NATS subjects, Redis prefix, SQLite roots) apply when those issues ship — see [#193](https://github.com/danielsmithdevelopment/ClawQL/issues/193).

### 7) Ouroboros integration

- [#194](https://github.com/danielsmithdevelopment/ClawQL/issues/194) — deferred multi-kind **`SeedSource`** until post-5.0.0 unless a minimal hook is needed for GraphQL/gRPC evidence only.

### 8) Observability

- [#191](https://github.com/danielsmithdevelopment/ClawQL/issues/191) — prioritize metrics for **graphql** / **grpc** kinds in 5.0.0; expand with additional kinds later.

## Consequences

### Positive

- **5.0.0** stays shippable: two protocol families, clear acceptance criteria.
- Long-term doc still describes the full supergraph direction without pretending stores/chain ship in the same tag.

### Trade-offs

- Issues [#182](https://github.com/danielsmithdevelopment/ClawQL/issues/182)–[#185](https://github.com/danielsmithdevelopment/ClawQL/issues/185), [#187](https://github.com/danielsmithdevelopment/ClawQL/issues/187), parts of [#188](https://github.com/danielsmithdevelopment/ClawQL/issues/188), [#193](https://github.com/danielsmithdevelopment/ClawQL/issues/193)–[#194](https://github.com/danielsmithdevelopment/ClawQL/issues/194), [#196](https://github.com/danielsmithdevelopment/ClawQL/issues/196) remain **backlog** until reprioritized.

## Related implementation issues

| Issue                                                               | Topic                                                         | 5.0.0   |
| ------------------------------------------------------------------- | ------------------------------------------------------------- | ------- |
| [#178](https://github.com/danielsmithdevelopment/ClawQL/issues/178) | Epic tracker                                                  | ✓ scope |
| [#179](https://github.com/danielsmithdevelopment/ClawQL/issues/179) | Spike: Mesh v1 vs stitch                                      | Later   |
| [#180](https://github.com/danielsmithdevelopment/ClawQL/issues/180) | Foundation types (`SpecKind`, `SpecSource`, `LoadedSpec`)     | Partial |
| [#181](https://github.com/danielsmithdevelopment/ClawQL/issues/181) | `normalizeOperationId` + search index                         | ✓       |
| [#182](https://github.com/danielsmithdevelopment/ClawQL/issues/182) | Postgres source                                               | Later   |
| [#183](https://github.com/danielsmithdevelopment/ClawQL/issues/183) | Redis source                                                  | Later   |
| [#184](https://github.com/danielsmithdevelopment/ClawQL/issues/184) | SQLite source                                                 | Later   |
| [#185](https://github.com/danielsmithdevelopment/ClawQL/issues/185) | NATS JetStream + transport guard                              | Later   |
| [#186](https://github.com/danielsmithdevelopment/ClawQL/issues/186) | Generic gRPC source                                           | ✓       |
| [#187](https://github.com/danielsmithdevelopment/ClawQL/issues/187) | Hyperledger Fabric                                            | Later   |
| [#188](https://github.com/danielsmithdevelopment/ClawQL/issues/188) | GraphQL + The Graph (x402)                                    | Partial |
| [#189](https://github.com/danielsmithdevelopment/ClawQL/issues/189) | `buildUnifiedSchema` merge                                    | Later   |
| [#190](https://github.com/danielsmithdevelopment/ClawQL/issues/190) | Middleware (RLS, x402, subscription guard)                    | Partial |
| [#191](https://github.com/danielsmithdevelopment/ClawQL/issues/191) | Metrics per **`sourceLabel`** (in-process **`GET /healthz`**) | ✓       |
| [#192](https://github.com/danielsmithdevelopment/ClawQL/issues/192) | Teardown (SIGTERM + `resetSpecCache`)                         | Partial |
| [#193](https://github.com/danielsmithdevelopment/ClawQL/issues/193) | Security allowlists                                           | Later   |
| [#194](https://github.com/danielsmithdevelopment/ClawQL/issues/194) | Ouroboros `SeedSource`                                        | Later   |
| [#195](https://github.com/danielsmithdevelopment/ClawQL/issues/195) | Env + `load-env`                                              | ✓       |
| [#196](https://github.com/danielsmithdevelopment/ClawQL/issues/196) | testcontainers tests                                          | Later   |

**[#188](https://github.com/danielsmithdevelopment/ClawQL/issues/188):** **5.0.0** covers **generic GraphQL** loading; **The Graph + x402** stays a follow-up unless explicitly pulled into the milestone later.
