# SQLite catalog — default-on safety checks

## 1. Node / Bun binding (no experimental flag)

| Runtime | `node:sqlite` `DatabaseSync` | Flag required? | Notes |
| --- | --- | --- | --- |
| Node **v22.14.0** (`engines: >=22`) | works | **No** | Emits `ExperimentalWarning` only |
| Node **v22.22.2** | works | **No** | Same warning |
| Bun (board HTTP arm) | works via `node:sqlite` | **No** | Used for under-load A/Bs |

Product `engines.node` is `>=22`. Built-in `node:sqlite` is available without `--experimental-sqlite` on supported Node. Warning is non-fatal; do not gate default-on on the warning disappearing.

## 2. First-use (cold materialize) cost

Probe: `scripts/benchmarks/catalog-sqlite-cold-first-op.mjs` (`MULTI_DOC=1`, 40 ops)  
Artifact: `/opt/cursor/artifacts/catalog-sqlite-cold-first-op.json`

| | p50 | p95 | **p99** | max |
| --- | ---: | ---: | ---: | ---: |
| **Cold first exec / op** (gunzip+JSON once) | 2.5 ms | 34 ms | **129 ms** | 129 ms |
| Warm exec (cached) | 1.6 ms | 2.2 ms | 2.7 ms | 5.8 ms |

Cold p99 is a **one-shot per operation** (or per OpenAPI doc when multi-doc). Steady-state execute stays ~1.6 ms p50. Not a listen-time tax.

## 3. Failure behavior

| Condition | `LOAD=db` (explicit) | Default persist-then-slim |
| --- | --- | --- |
| Missing DB file | **Hard fail** with clear error | Fall through to OpenAPI load |
| Corrupt DB file | **Hard fail** (no half-load) | Log + fall back to OpenAPI |
| Persist failure after OAS load | — | Keep in-memory catalog; log error |

Unit coverage: `packages/clawql-api/src/catalog/catalog-sqlite.test.ts` (corrupt rejects; 3/3 pass).

## 4. User-added specs + release updates

| Concern | Behavior |
| --- | --- |
| User-added sources | `~/.ClawQL/sources.json` + cached specs under `~/.ClawQL/sources/<id>/` (see `custom-sources-types.ts`) |
| Bundled catalog DB | Default path `$CLAWQL_HOME/catalog.sqlite` (`CLAWQL_CATALOG_SQLITE_PATH` override) |
| Across ClawQL releases | DB is a **local cache** rebuilt on listen when loading from OpenAPI/sources; `LOAD=db` deploys should **recompile** (`compile-catalog-sqlite.mjs`) per release / spec change — do not ship a stale DB as the only source without a rebuild step |
| Opt out | `CLAWQL_CATALOG_SQLITE=0` |

User sources are **not** written into the bundled package DB; they merge at runtime from `sources.json`. A release that changes Operation shape should bump / rebuild the colocated DB when using `LOAD=db`.
