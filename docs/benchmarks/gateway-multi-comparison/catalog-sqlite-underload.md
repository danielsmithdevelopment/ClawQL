# SQLite catalog — under-load RSS / anon / PSS

Follows Ready A/B in [`catalog-sqlite-ready-rss.md`](./catalog-sqlite-ready-rss.md). Product default is now **on** (`CLAWQL_CATALOG_SQLITE=0` to opt out).

Probes: `scripts/benchmarks/catalog-sqlite-underload-ab.mjs`, `scripts/benchmarks/mcpjungle-underload-smaps.mjs`  
Summaries: [`catalog-sqlite-underload-summary.json`](./catalog-sqlite-underload-summary.json), [`catalog-sqlite-airtight-summary.json`](./catalog-sqlite-airtight-summary.json)  
Default-on safety: [`catalog-sqlite-default-on-safety.md`](./catalog-sqlite-default-on-safety.md)

## Equal-arm 40-op (Bun HTTP, n=800 flows)

| Arm | Ready RSS / anon | Under-load median RSS / anon |
| --- | ---: | ---: |
| In-memory | 281 / 220 | **319 / 256** |
| `LOAD=db` | 152 / 112 | **188 / 146** |
| Δ | −129 / −108 | **−131 / −110** |

Video memory line: under-load **~188 MB** (was ~337 in-memory era / ~319 this A/B).

## MCPJungle same catalog — anon vs anon (smaps)

Probe: `N=40000` equal-arm stdio behind MJ; tree via `/proc` PPID scan (same as multiturn `ResourceSampler`). Plateau = last 15 samples.

| Scope | RSS median | **Anonymous** median | Notes |
| --- | ---: | ---: | --- |
| MJ **tree** (Go + Node catalog child) | **152.6** | **86.3** | Matches publish-board ~**152** RSS |
| MJ gateway only | ~36 | **~14** | Multiplexer alone |
| ClawQL `LOAD=db` process | **188** | **146** | Single process (catalog in-proc) |

**Like-for-like:** ClawQL anon **146** vs MJ tree anon **86** → **~60 MB anon gap**. RSS gap ~**36 MB** (188−153). MJ’s 153 RSS is only ~86 anon (file-backed ~66 in the tree, mostly the Node catalog). **Anon-vs-anon does not shrink the gap toward parity** — it widens it. Do not claim memory parity from RSS alone.

Artifacts: [`mcpjungle-underload-equal40.json`](./mcpjungle-underload-equal40.json)

## Sentry / fat catalog

### ClawQL (real Sentry OpenAPI, n=400)

| Arm | Ready RSS / anon | Under-load median RSS / anon |
| --- | ---: | ---: |
| In-memory | 288 / 227 | **310 / 248** |
| `LOAD=db` | 152 / 112 | **193 / 151** |
| Δ | −136 / −115 | **−118 / −97** |

### MCPJungle Sentry-count (209 equal-arm tools, n=40000)

| Scope | RSS median | Anon median |
| --- | ---: | ---: |
| MJ tree plateau | **154.4** | **88.0** |

Same-order tree memory as 40-op (~154 / 88). Not ClawQL OpenAPI schemas inside MJ — op-count-matched equal-arm surface. Artifact: [`mcpjungle-underload-sentry-count.json`](./mcpjungle-underload-sentry-count.json).

Catalog behavior (search + execute) stayed green on ClawQL boards.

## Default-on safety

| Check | Result |
| --- | --- |
| Node `node:sqlite` | Works on **Node ≥22** and Bun **without** `--experimental-sqlite` (ExperimentalWarning only) |
| Cold first-exec / op | p50 **2.5 ms**, p99 **129 ms** once per op (`MULTI_DOC=1`); warm p50 **1.6 ms** |
| Missing / corrupt DB | `LOAD=db` → **hard fail** (no half-load); otherwise fall back to OpenAPI |
| User specs | `~/.ClawQL/sources.json` + `sources/<id>/`; DB at `$CLAWQL_HOME/catalog.sqlite` — rebuild on release when using `LOAD=db` |

## Default-on decision

Under-load + behavior cleared on **40-op and Sentry** → `CLAWQL_CATALOG_SQLITE` defaults **on** (persist-then-slim). Precompiled deploys still set `CLAWQL_CATALOG_SQLITE_LOAD=db`. Memory vs MJ: **much closer on RSS, not anon-parity**.

## Executor v2 flow p999

### Solo 3× (n=2500, `MT_PIN_CORES=1`, `MT_ARMS=executor_v2`)

| Rep | p50 | p99 | **p999** |
| ---: | ---: | ---: | ---: |
| 1 | 70.2 | 114.7 | **198.8** |
| 2 | 69.1 | 103.7 | **173.2** |
| 3 | 72.5 | 109.0 | **185.9** |

Solo p999 range **173–199 ms** (median ~**186**).

### Interleaved 3× (n=2500, `MT_ARMS=mcpjungle,agentgateway,executor_v2`)

| Rep | p50 | p99 | **p999** |
| ---: | ---: | ---: | ---: |
| 1 | 69.5 | 107.9 | **168.4** |
| 2 | 67.5 | 96.5 | **181.7** |
| 3 | 68.7 | 101.7 | **213.7** |

Interleaved p999 range **168–214 ms** (median of 3 ~**182**). Publish-board **286 ms** remains an outlier vs both solo and interleaved 3× — do not headline 286. Quote **interleaved ~182** (or range) when comparing to other HTTP peers on the board; label solo separately if citing 173–199.
