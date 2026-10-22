# Rust data-plane spike — runbook

**ADR:** [0016](../../adr/0016-rust-dataplane-spike.md)  
**Bars:** [BARS.md](./BARS.md)  
**Code:** [`crates/clawql-dataplane/`](../../../crates/clawql-dataplane/)

## Status

<<<<<<< HEAD

| Phase            | Status              | Notes                                                     |
| ---------------- | ------------------- | --------------------------------------------------------- |
| 0 Freeze         | **Done**            | Memory go bar = ≤65 MB anon; see BARS.md                  |
| A Bare path      | **Done (scaffold)** | JSON catalog + minimal MCP + mock upstream; smoke green   |
| B Governance     | Pending             |                                                           |
| C Verus + boards | Pending             | `policy.rs` is the first Verus candidate                  |
| D Go/no-go       | Pending             |                                                           |
| =======          |
| Phase            | Status              | Notes                                                     |
| -----            | ------              | -----                                                     |
| 0 Freeze         | **Done**            | Memory go bar = ≤65 MB anon; see BARS.md                  |
| A Bare path      | **In progress**     | SQLite catalog + Streamable HTTP JSON mode; no governance |
| B Governance     | Pending             |                                                           |
| C Verus + boards | Pending             | `policy.rs` is the first Verus candidate                  |
| D Go/no-go       | Pending             |                                                           |

> > > > > > > b7d2ec05b (feat(dataplane): SQLite catalog, Streamable HTTP, week-1 CF signal)

## Honesty — do not quote idle toy RSS

Early smoke RSS on a release binary with a tiny self-mock catalog is **not** comparable to Bun’s ~125–130 MB lean-listen figure. Bun’s number is the full product under sustained load. The Rust number rises once the real catalog, upstream work, and (later) governance are in. **Do not publish or cite idle/toy RSS against the Bun bar.**

<<<<<<< HEAD

| Build                                                     | VmRSS after warm execute |
| --------------------------------------------------------- | ------------------------ |
| debug                                                     | ~14 MB                   |
| **release**                                               | **~6.7 MB**              |
| =======                                                   |
| Meaningful memory comparison (same as every other board): |

> > > > > > > b7d2ec05b (feat(dataplane): SQLite catalog, Streamable HTTP, week-1 CF signal)

- same **SQLite** catalog file
- same workload
- memory at its **plateau under load**
- whole process (gateway tree)

## Catalog

Production schema from [`catalog-sqlite.ts`](../../../packages/clawql-api/src/catalog/catalog-sqlite.ts):

- `meta`, `operations(id, spec_index, json)`, `openapi_docs(spec_index, json_gz)`
- Hot set = all operation rows; OpenAPI docs stay gzip’d until base-URL resolve

Compile:

```bash
node scripts/dataplane/compile-catalog-sqlite.mjs \
  --spec scripts/dataplane/fixtures/cloudflare-curated-openapi.json \
  --out scripts/dataplane/fixtures/cloudflare-curated.catalog.sqlite
```

Env (aligned with Bun): `CLAWQL_CATALOG_SQLITE_PATH` / `CLAWQL_DATAPLANE_CATALOG`, `CLAWQL_API_BASE_URL`.

## Streamable HTTP

Aligned with Bun host / MCP SDK clients:

- `Accept: application/json, text/event-stream`
- Sessionful `mcp-session-id` on `initialize` (or `CLAWQL_MCP_STATELESS=1` / protocol `2026-07-28`)
- JSON response mode (equivalent to `CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE=1`)
- `notifications/initialized` → 202
- Tool failures in `result` with `isError` where appropriate

## Week-1 signal (fast path only)

```bash
CF_DP_REPS=3 CF_DP_ITERS=200 ./scripts/dataplane/week1-cf-known-op.sh
```

See [WEEK1.md](./WEEK1.md). Cloudflare curated known-ops through **Rust dataplane** and **Bun host**, interleaved. Both arms share the same SQLite catalog + CF replay mock. **Label: `fast-path-only`** — Rust has no governance yet; go/no-go waits for Phase B.

## Differential harness

`scripts/dataplane/diff-harness.md` — expand after Streamable HTTP client parity is proven by week-1.
