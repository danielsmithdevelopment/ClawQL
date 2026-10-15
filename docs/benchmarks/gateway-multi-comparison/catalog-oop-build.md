# Out-of-process catalog build

## Why

JS runtimes rarely return heap to the OS after a large OpenAPI parse. Even
`persist-then-slim` inside the gateway leaves RSS high. Large customer specs
(Cloudflare ~2.9k ops / ~21 MB YAML, GCP-scale packs) must not be parsed in the
listen process.

## Behavior (default)

| Step | Process |
| --- | --- |
| Missing/stale `catalog.sqlite` | Short-lived `catalog/build-catalog-sqlite-cli` parses sources, writes DB, exits |
| Listen | Opens DB read-only (`LOAD=db`) — no OAS parse |

Env:

| Variable | Default | Notes |
| --- | --- | --- |
| `CLAWQL_CATALOG_SQLITE` | on | Opt out `=0` |
| `CLAWQL_CATALOG_SQLITE_BUILD` | `oop` | `inprocess` = old parse-then-slim in the gateway |
| `CLAWQL_CATALOG_SQLITE_LOAD` | — | Force DB-only listen (`db`) |
| `CLAWQL_CATALOG_SQLITE_REBUILD` | off | Force rebuild even when DB looks fresh |

Offline compile remains: `scripts/benchmarks/compile-catalog-sqlite.mjs`.

## Cloudflare multiturn board — Q1 / Q2 (2026-10-15)

The published 3×10k board (`cursor/clawql-program-where-board-a621`) reported
~630–650 MB anonymous memory on ClawQL arms. Two questions:

### 1. Did that board run with the SQLite catalog?

**No.** Evidence from surviving board homes (`/tmp/cf-clawql-*-465631-*`):

- Log: `Loaded 60 operations (Cloudflare API (curated zone-audit subset))`
- **No** `[catalog-sqlite]` banner
- **No** `catalog.sqlite` on disk
- Harness set `CLAWQL_CATALOG_SQLITE=1`, but that branch did **not** contain the
  catalog-sqlite implementation (feature lived only on
  `cursor/sqlite-catalog-memory-a621`) — the flag was a no-op

Also: the board used the **curated 60-op** fixture (~111 KB), **not** the full
Cloudflare OpenAPI (~2,917 ops / ~21 MB). Spec size alone does not explain the
~630 MB plateau.

### 2. What is retained?

Heap snapshot at Ready+light load (curated path, no sqlite), sorted by
**self_size** (`/opt/cursor/artifacts/cf-heap-probe-*/heap-top-self.json`):

| Bucket | Self size |
| --- | ---: |
| strings (mostly bundled source / codegen) | ~57 MB |
| code | ~28 MB |
| native (`JSArrayBufferData`) | ~21 MB |
| arrays / objects | ~21 MB |
| **total self** | **~146 MB** |

Largest strings were k8s OpenAPI client generators, Stripe, ONNX Runtime,
Transformers.js, viem — **not** the curated OAS. Cold smaps after Ready were
~375 MB RSS / ~294 MB anon; the board’s ~710 / ~630 under 10k load is higher
still (session / response retention on top of the fat gateway image).

**Takeaway:** OOP catalog is still the right product fix so gateway RSS stays
independent of spec size. Closing the CF board’s ~630 MB gap also needs a leaner
listen surface (the equal-arm underload path already uses
`CLAWQL_HTTP_SKIP_PAYMENTS` / `CLAWQL_HTTP_SKIP_GRAPHQL` and `LOAD=db` → ~188 MB
RSS on the 40-op board).

## Probe (this branch)

```bash
# Synthetic 80-op
env -u CLAWQL_SPEC_PATH node scripts/benchmarks/catalog-oop-rss-probe.mjs

# Full Cloudflare OAS
SPEC=/workspace/providers/cloudflare/openapi.yaml \
  READY_MS=900000 \
  OUT=/opt/cursor/artifacts/catalog-oop-rss-cloudflare.json \
  env -u CLAWQL_SPEC_PATH node scripts/benchmarks/catalog-oop-rss-probe.mjs
```

### Synthetic 80-op

Artifact: [`catalog-oop-rss-synthetic80.json`](./catalog-oop-rss-synthetic80.json)

| Arm | Ready RSS / anon |
| --- | ---: |
| In-process persist | 392 / 314 |
| OOP first boot | 367 / 288 |
| `LOAD=db` only | 374 / 295 |
| Δ OOP vs in-process anon | **−26 MB** |

Banners: `oop-build` → `oop-wrote` → `LOAD=db after oop-build`.

### Full Cloudflare OpenAPI (2,966 ops, 21.7 MB YAML)

Artifact: [`catalog-oop-rss-cloudflare.json`](./catalog-oop-rss-cloudflare.json)

| Arm | Ready RSS / anon |
| --- | ---: |
| In-process persist | **1193 / 1114** |
| OOP first boot | **434 / 355** |
| `LOAD=db` only | 470 / 391 |
| Δ OOP vs in-process anon | **−759 MB** |

The OOP child peaked ~800 MB RSS while parsing, then exited — listen RSS stayed
near the prebuilt `LOAD=db` path. That is the product claim: **gateway memory
independent of spec size**.

## Slim listen — lazy horizontal plugins (follow-up)

### Known-op path does not run a model

`execute` with a known `operationId` + JMESPath `where` never calls GLiNER / Decide,
ONNX embeddings, or ranking. Redaction ML stays off unless
`CLAWQL_ENABLE_PRESIDIO` / `CLAWQL_ENABLE_PRIVACY_FILTER` is set. The board’s
native-memory climb was **not** inference weights on the known-op path.

### What was loading at Ready

`compose-horizontal-plugin-layers-static.ts` statically imported
`clawql-automation` / `clawql-memory` / … even when tiers were disabled, so
`@kubernetes/client-node` (AdmissionregistrationApi codegen) and the memory
plugin graph mapped into every listen. Payments/DuckDB were already skip/lazy in
source; the sync composer was the remaining poison.

### Fix

- Sync composer: **DuckDB-style `createRequire` only when the flag is on** for
  every horizontal package (memory, documents, automation, …).
- Adapters: load the sync composer only inside `getClawqlApi()`; vault-seed
  imports memory only when `enableMemory`.
- HTTP: drop the static `getClawqlApi` import (dynamic in session hooks).
- Automation: dynamic `import("@kubernetes/client-node")` on first workflow/argocd use.

### Remasure (OOP + lazy, equal-arm 60-op, 120 known-op executes)

Artifact: [`slim-listen-memory-oop-lazy.json`](./slim-listen-memory-oop-lazy.json)  
Probe: `scripts/benchmarks/slim-listen-memory-probe.mjs`  
(`native ≈ smaps Anonymous − V8 heapUsed`; maps checked for k8s/xenova/onnx/stripe/duckdb)

| Phase | Anon | JS heap | Native (anon−heap) | Heavy maps |
| --- | ---: | ---: | ---: | --- |
| Ready | **105 MB** | 60 MB | 45 MB | none |
| After 120 executes | **112 MB** | 69 MB | 43 MB | none |

That lands **under** the 150–190 MB underload band.

### Lazy first-hit cost + fail-closed imports

See [`lazy-plugin-costs.md`](./lazy-plugin-costs.md) — Kubernetes first import
**~363 ms**, first `memory_ingest` **~189 ms**, imports fail closed.

### Same-run gaps (corrected — do not mix runs)

Smoke N=5 tree smaps (same harness): ClawQL **116.5** anon vs MCPJungle **43.7**
(~**73 MB** gap) vs agentgateway **67.7** (~**49 MB** gap). Do **not** cite a
~26 MB gap against MJ’s earlier ~86 MB underload figure from a different run.

### Process-tree fairness (MCPJungle REST→MCP)

MCPJungle registers `cf-rest-mcp.mjs` (stdio OpenAPI→tools). Idle gateway is
~10 MB anon (Go only). With a **stateful MCP session** open (board/smoke), the
REST child is in the PPID tree (~17 MB anon at list-tools; grows under load).
Smoke’s **43.7 MB** is Go+REST — fair vs ClawQL’s single process. Agentgateway
keeps a persistent REST child. Harness now records per-sample `processes` /
`has_rest_mcp` and warns if an aggregator sample lacks the child.

Earlier equal-arm underload **86.3 MB** MJ tree used a different Node catalog
MCP and N=40k — not interchangeable with this board’s curated REST adapter.

### CF multiturn 3×10k remasure (in flight)

Harness records tree **RSS / anon / PSS**, `memory_series`, `memory_flatness`,
and process inventories. Board homes show `oop-build` → `LOAD=db after oop-build`.

Replace published ~630 MB anon cells and the comparison-page / video ~188 MB line
once the 3×10k series reports flatness (or documents climb) with same-run peers.
