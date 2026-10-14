# SQLite catalog — under-load RSS / anon / PSS

Follows Ready A/B in [`catalog-sqlite-ready-rss.md`](./catalog-sqlite-ready-rss.md). Product default is now **on** (`CLAWQL_CATALOG_SQLITE=0` to opt out).

Probe: `scripts/benchmarks/catalog-sqlite-underload-ab.mjs`  
Summary: [`catalog-sqlite-underload-summary.json`](./catalog-sqlite-underload-summary.json)

## Equal-arm 40-op (Bun HTTP, n=800 flows)

| Arm | Ready RSS / anon | Under-load median RSS / anon |
| --- | ---: | ---: |
| In-memory | 281 / 220 | **319 / 256** |
| `LOAD=db` | 152 / 112 | **188 / 146** |
| Δ | −129 / −108 | **−131 / −110** |

MCPJungle publish under-load anchor ~**152 MB** RSS. ClawQL `LOAD=db` under-load **anon 146** is in-band; **RSS 188** still ~36 MB above MJ — closer, not full parity. Same-catalog MJ run still required before claiming parity.

## Sentry OpenAPI (n=400 flows)

| Arm | Ready RSS / anon | Under-load median RSS / anon |
| --- | ---: | ---: |
| In-memory | 288 / 227 | **310 / 248** |
| `LOAD=db` | 152 / 112 | **193 / 151** |
| Δ | −136 / −115 | **−118 / −97** |

Catalog behavior (search + execute) stayed green on both boards.

## Default-on decision

Under-load + behavior cleared on **40-op and Sentry** → `CLAWQL_CATALOG_SQLITE` defaults **on** (persist-then-slim). Precompiled deploys still set `CLAWQL_CATALOG_SQLITE_LOAD=db`.

## Executor v2 flow p999 (3× solo, n=2500, `MT_PIN_CORES=1`)

| Rep | p50 | p99 | **p999** |
| ---: | ---: | ---: | ---: |
| 1 | 70.2 | 114.7 | **198.8** |
| 2 | 69.1 | 103.7 | **173.2** |
| 3 | 72.5 | 109.0 | **185.9** |

p999 range **173–199 ms**. Publish-board **286 ms** (2-core interleaved) looks like run noise vs 1-core **136 ms** — do not headline 286; quote ~**186** (median of 3) or wait for interleaved 3×.
