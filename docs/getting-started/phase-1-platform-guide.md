# Phase 1 platform guide (7.0)

**Audience:** Operators and integrators evaluating or running ClawQL after **7.0.0**  
**Status:** Phase 1 exit is **complete** — this guide teaches what shipped and how to turn it on.

**Ground truth:** [Modularization implementation status](../design/modularization-implementation-status.md) §10  
**Upgrade path:** [ClawQL 7.0 setup guide](./clawql-7-setup-guide.md)  
**Tier 1 stack:** [`examples/clawql-local-docker-compose`](../../examples/clawql-local-docker-compose/README.md)

---

## What Phase 1 delivered

| Capability                                                       | Package / path                         | Delivery                                              |
| ---------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| Gateway auth (`noAuth` / `apiKey`, ATR claims, provider headers) | `clawql-auth`                          | ✅ Shipped — OIDC/SAML/RBAC 📋 planned                |
| Vectorless hierarchical indexing                                 | `clawql-pageindex`                     | ✅ Shipped — MIT, zero ClawQL deps                    |
| PageIndex MCP tools                                              | `clawql-memory` (`MemoryPlugin`)       | ✅ Default on                                         |
| Code graph MCP tools                                             | `clawql-memory` + `clawql-codegraph`   | ✅ Opt-in (`CLAWQL_ENABLE_CODEGRAPH=1`)               |
| Presidio redaction on agent I/O                                  | `clawql-api` gateway hooks             | 🚧 Opt-in (`CLAWQL_ENABLE_PRESIDIO=1`)                |
| Tier 1 local stack (Compose)                                     | `examples/clawql-local-docker-compose` | ✅ Shipped                                            |
| Release manifest verify                                          | `clawql-release`                       | 🚧 MVP — `clawql doctor --smoke`                      |
| Custom URL sources                                               | `clawql-api` + dashboard               | ✅ Shipped — [custom-sources.md](./custom-sources.md) |

**Phase 2 (next):** full Operator NL surface, third-party vertical plugins, transport-only `clawql-mcp` npm split — see [Vision & Roadmap](../vision/clawql-vision-roadmap.md) §5.

---

## 1. Gateway auth (`clawql-auth`)

HTTP MCP can enforce an API key on `/mcp` routes. Upstream provider credentials (AWS SigV4, env JSON) live in the same package.

### Enable API key mode

```bash
export CLAWQL_AUTH_MODE=apiKey
export CLAWQL_API_KEY="your-long-random-secret"
```

Clients must send `Authorization: Bearer <CLAWQL_API_KEY>` (or `X-API-Key`) on Streamable HTTP MCP requests.

### Modes

| `CLAWQL_AUTH_MODE` | Behavior                          |
| ------------------ | --------------------------------- |
| `noAuth` (default) | No gateway key check on MCP HTTP  |
| `apiKey`           | Reject MCP HTTP without valid key |

**Not in Phase 1:** OIDC/SAML login flows, RBAC/ABAC policy engine — see [`packages/clawql-auth/README.md`](../../packages/clawql-auth/README.md).

**Reference:** `.env.example` (`CLAWQL_AUTH_*`), [7.0 setup guide](./clawql-7-setup-guide.md) § operator auth reconciliation.

---

## 2. PageIndex (`clawql-pageindex`)

Standalone MIT library for **vectorless** hierarchical document indexing (Markdown headings → tree → traverse → synthesize). Registered as MCP tools by `MemoryPlugin`.

### MCP tools (default on)

| Tool                    | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `pageindex_build_tree`  | Build a PageIndex tree from Markdown for a `docId` |
| `pageindex_traverse`    | Walk the tree (parent/child, token budget)         |
| `pageindex_synthesize`  | Merge selected nodes into context for agents       |
| `pageindex_get_content` | Read stored node content                           |

### Disable

```bash
export CLAWQL_ENABLE_PAGEINDEX=0
```

### Typical workflow

1. Ingest long docs with `memory_ingest` or `ingest_external_knowledge`.
2. `pageindex_build_tree` on vault Markdown.
3. `pageindex_traverse` / `pageindex_synthesize` instead of pasting full files into the thread.

**Package API:** [`packages/clawql-pageindex/README.md`](../../packages/clawql-pageindex/README.md)  
**Plugin page:** [Memory plugin](../plugins/memory.md) (PageIndex tools share the memory tier).

---

## 3. Code graph (`clawql-codegraph`)

Standalone MIT library for **structural code indexing** — imports, calls, symbol containment — complementary to vault narrative memory and PageIndex. Registered as MCP tools by `MemoryPlugin` when enabled.

### MCP tools (opt-in)

| Tool                        | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `codegraph_index`           | Index TS/JS (compiler API) and Python/Go (tree-sitter) |
| `codegraph_import_graphify` | Import Graphify `graph.json`                           |
| `codegraph_query`           | Find symbols by name or concept                        |
| `codegraph_neighbors`       | List edges for a node                                  |
| `codegraph_path`            | Shortest path between two symbols                      |
| `codegraph_explain`         | Summarize a symbol and its neighborhood                |
| `codegraph_subgraph`        | BFS subgraph around a seed query                       |

### Enable

```bash
export CLAWQL_ENABLE_CODEGRAPH=1
export CLAWQL_CODEGRAPH_ROOT=/path/to/repo
export CLAWQL_CODEGRAPH_PATH=/path/to/data   # stores codegraph.db.json
```

Optional hybrid merge into **`memory_recall`**: **`CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1`**.

### Typical workflow

1. **`codegraph_index`** once per repo (or **`codegraph_import_graphify`** from Graphify export).
2. **`codegraph_path`** / **`codegraph_query`** instead of re-reading dozens of files.
3. **`memory_recall`** with hybrid enabled for narrative + structural context.
4. **`memory_ingest`** architecture decisions with wikilinks.

**Package API:** [`packages/clawql-codegraph/README.md`](../../packages/clawql-codegraph/README.md)  
**Plugin page:** [Code graph plugin](../plugins/codegraph.md)

---

## 4. Presidio gateway hooks

When enabled, text is redacted **before** persistence on:

- `execute` responses (gateway plugin)
- `memory_ingest`
- `ingest_external_knowledge`

### Enable

```bash
export CLAWQL_ENABLE_PRESIDIO=1
export CLAWQL_PRESIDIO_ANALYZER_URL=http://presidio-analyzer:3000
export CLAWQL_PRESIDIO_ANONYMIZER_URL=http://presidio-anonymizer:3000
# Optional: block when Presidio is unreachable (default in Tier 1 override)
export CLAWQL_PRESIDIO_FAILURE_POLICY=block
```

### Tier 1 Compose with Presidio

```bash
cd examples/clawql-local-docker-compose
docker compose -f docker-compose.yml -f docker-compose.presidio.override.yml up -d
```

**Partial delivery:** opt-in gateway redaction on listed paths. Full mandatory IDP pipeline redaction on every hop (Merkle per stage) remains roadmap — [IDP requirements matrix](../roadmap/idp-master-requirements-matrix.md).

---

## 5. Tier 1 Docker Compose

Single-machine evaluation stack: MCP + Tika + Gotenberg + Paperless + Redis + Postgres (+ optional Presidio override).

```bash
git clone https://github.com/danielsmithdevelopment/ClawQL.git
cd ClawQL/examples/clawql-local-docker-compose
cp .env.example .env   # optional edits
./bootstrap.sh
docker compose up -d
```

- **Dashboard:** http://localhost:8080 (when enabled in compose)
- **CI parity:** `make compose-tier1-config-test` from repo root

**Kubernetes alternative:** `make local-k8s-up` or Helm — [deployment/helm.md](../deployment/helm.md).

**Vision vs shipped:** [Operator target architecture](../design/operator-target-architecture.md) §1 describes Tier 1 **shipped**; higher tiers remain reference architecture.

---

## 6. Release manifest (Layer 0 MVP)

Verify the running build against a signed manifest at startup or via doctor:

```bash
clawql doctor --smoke
# Optional at MCP startup:
export CLAWQL_RELEASE_MANIFEST=/path/to/manifest.json
```

**Commands:** `clawql release collect|manifest|verify|publish` — [clawql-release-mvp.md](./clawql-release-mvp.md).

---

## 7. Where to read next

| Topic                                 | Doc                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Shipped vs planned (all packages)     | [Modularization implementation status](../design/modularization-implementation-status.md) |
| Public roadmap & phases               | [Vision & Roadmap](../vision/clawql-vision-roadmap.md)                                    |
| MCP tool matrix                       | [MCP tools](../mcp/mcp-tools.md)                                                          |
| Plugin enable flags                   | [Plugin registry](../reference/clawql-plugin-registry.md)                                 |
| Custom sources (URL / CLI)            | [custom-sources.md](./custom-sources.md)                                                  |
| Target architecture (not all shipped) | [Modularization v2](../vision/clawql-modularization-v2.md)                                |

**Doc roles:** vision docs describe **targets**; getting-started and design/implementation-status describe **what to run today**.
