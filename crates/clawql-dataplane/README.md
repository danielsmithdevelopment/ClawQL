# clawql-dataplane (ADR 0016 spike)

Rust Streamable-HTTP **execute** hot path.

- **Phase A** (default): bare path (SQLite catalog → REST → `where`), label **`fast-path-only`**.
- **Phase B**: HTTP risk classify + park/block (`CLAWQL_DATAPLANE_GOVERNANCE=1`); **session IFC** (ADR 0015, default on — `CLAWQL_ENABLE_SESSION_IFC=0` to opt out); **mandate park/consume** — SQLite default, **Postgres** when `CLAWQL_PENDING_DATABASE_URL` / `CLAWQL_PENDING_STORE=postgres` (same `UPDATE…WHERE` as ADR 0014); **process-WORM** (`CLAWQL_WORM_ENABLED=1`, default **CBOR** dialect — `CLAWQL_WORM_DIALECT=json` for legacy). Bun cross-diff: `scripts/dataplane/diff-governance-cf.sh`; fair board: `week1-gov-cf-known-op.sh`.
- **Ownership:** Rust = known-op execute + governance hot path; TypeScript = search/plugins/memory/programs/OAuth. See [`DUAL-PROCESS.md`](../../docs/spikes/rust-dataplane/DUAL-PROCESS.md).

## Quick start

```bash
# pets fixture (SQLite, production schema)
cd crates
cargo run -p clawql-dataplane -- --self-mock --bind 127.0.0.1:8787
```

```bash
# initialize (note mcp-session-id response header)
curl -sS http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -D - \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

Or: `../../scripts/dataplane/smoke.sh`

## Cloudflare catalog

```bash
node scripts/dataplane/compile-catalog-sqlite.mjs \
  --spec scripts/dataplane/fixtures/cloudflare-curated-openapi.json \
  --out /tmp/cf.catalog.sqlite

CLAWQL_API_BASE_URL=http://127.0.0.1:MOCK \
  cargo run -p clawql-dataplane --release -- \
  --catalog /tmp/cf.catalog.sqlite --bind 127.0.0.1:8787
```

Week-1 interleaved Bun vs Rust: `scripts/dataplane/week1-cf-known-op.sh`

## Layout

| Module | Role |
| ------ | ---- |
| `catalog` | Production SQLite catalog reader |
| `execute` | REST call + fields projection |
| `where_filter` | JMESPath |
| `mcp` | Streamable HTTP (session + JSON mode) |
| `risk` | HTTP method → allow / mandate / block (Phase B) |
| `ifc` | Session label accumulate + write gate (ADR 0015) |
| `pending` / `pending_pg` | Mandate park / approve / atomic consume (SQLite or Postgres) |
| `args_hash` | Canonical `sha256:` digest for park/resume binding |
| `worm` / `cbor_canon` | Process hash-chain audit (CBOR default; env-gated) |
| `policy` | Lean-shaped approval oracle (Verus later) |
| `mock_upstream` | In-process REST for pets smoke |

## Bars

See [`docs/spikes/rust-dataplane/BARS.md`](../../docs/spikes/rust-dataplane/BARS.md). Do not quote toy RSS against Bun.
