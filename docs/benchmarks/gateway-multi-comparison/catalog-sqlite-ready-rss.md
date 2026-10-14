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


## Latency (equal-arm HTTP, n=2500)

Probe: `scripts/benchmarks/catalog-sqlite-latency-ab.mjs`  
Artifact: [`catalog-sqlite-latency-ab.json`](./catalog-sqlite-latency-ab.json)

Bun HTTP, gateway `taskset` cores 2–3, synthetic 40-op fat catalog, search+execute turns:

| Metric | Memory | `LOAD=db` | Δ (db−mem) |
| --- | ---: | ---: | ---: |
| search p50 / p99 / **p999** (ms) | 0.72 / 2.52 / **9.1** | 0.65 / 2.40 / **5.5** | −0.07 / −0.12 / **−3.6** |
| execute p50 / p99 / **p999** (ms) | 0.99 / 4.52 / **7.6** | 0.85 / 4.77 / **6.6** | −0.14 / +0.25 / **−1.0** |
| turn p50 / p99 / **p999** (ms) | 1.78 / 6.16 / **10.4** | 1.56 / 6.19 / **8.1** | −0.22 / +0.03 / **−2.3** |
| ≥300 ms spikes | 0 | 0 | — |

**Verdict:** memory-only win on Ready RSS; **no steady-state latency regression** (p50/p99 within noise; p999 not worse). Search never touches SQLite. Execute pays at most a **one-time** gunzip+JSON materialize on first OAS property access per doc, then uses the in-process cache — not the open publish-board HTTP p999 stall (round 12).
