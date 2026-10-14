# Colocated SQLite catalog — Ready RSS A/B

Follows [`stall-memory-round12.md`](./stall-memory-round12.md) and the design in [`gateway-runtime-and-catalog-memory.md`](../../architecture/gateway-runtime-and-catalog-memory.md) §4.

## Flag

| Env | Role |
| --- | --- |
| `CLAWQL_CATALOG_SQLITE=1` | Opt in |
| `CLAWQL_CATALOG_SQLITE_PATH` | DB path (default `$CLAWQL_HOME/catalog.sqlite`) |
| `CLAWQL_CATALOG_SQLITE_LOAD=db` | Listen from precompiled DB only (skip OAS parse) |

Without `LOAD=db`, listen still parses the OpenAPI source, then **persists + returns a slim view** (compact `Operation[]` hot; gzip'd OAS cold / lazy).

Search stays the in-memory weighted keyword scan — **no SQLite FTS/BM25**.

## Measure (Sentry OpenAPI)

Host probe: `scripts/benchmarks/catalog-sqlite-rss-ab.mjs`  
Artifact: [`catalog-sqlite-rss-ab.json`](./catalog-sqlite-rss-ab.json)

| Arm | Spec | Ops | Ready RSS | Anon | PSS | Heap used |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| In-memory OAS | `providers/sentry/openapi.json` (~3.3 MB) | 209 | **292 MB** | 230 MB | 289 MB | 138 MB |
| Persist-then-slim | same + flag | 209 | **159 MB** | 117 MB | 157 MB | 35 MB |
| `LOAD=db` | precompiled `catalog.sqlite` (~0.5 MB) | 209 | **154 MB** | 114 MB | 152 MB | 34 MB |

**Deltas vs in-memory:** `LOAD=db` ≈ **−138 MB RSS / −117 MB anon / −137 MB PSS**.

Equal-arm **40-tool fat** catalog ([`catalog-listen-rss.json`](./catalog-listen-rss.json)) is too small for this lever (~+47 MB fat−lean); SQLite savings show on **multi‑MB** vendor specs.

## Compile

```bash
npm run build -w clawql-api
node scripts/benchmarks/compile-catalog-sqlite.mjs \
  --spec providers/sentry/openapi.json \
  --out "$CLAWQL_HOME/catalog.sqlite"
CLAWQL_CATALOG_SQLITE=1 CLAWQL_CATALOG_SQLITE_LOAD=db \
  CLAWQL_CATALOG_SQLITE_PATH="$CLAWQL_HOME/catalog.sqlite" \
  bun --smol dist/server-http.js
```

## Honest framing

- File-backed pages still appear in RSS — publish **anon/PSS** with RSS.
- Hot path still holds full `Operation[]` for search; OAS is what leaves the heap until execute touches a doc.
- Equal-arm publish board remains a **40-tool** lean catalog — this lever is for **fat vendor / multi-provider** Ready RSS, not the pets board delta.
