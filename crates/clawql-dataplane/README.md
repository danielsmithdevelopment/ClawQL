# clawql-dataplane (ADR 0016 spike)

Rust Streamable-HTTP **execute** hot path. Phase A = bare path (SQLite catalog → REST → `where`), **no governance**. Comparisons are labeled **`fast-path-only`**.

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
| `policy` | Lean-shaped approval oracle (Verus later) |
| `mock_upstream` | In-process REST for pets smoke |

## Bars

See [`docs/spikes/rust-dataplane/BARS.md`](../../docs/spikes/rust-dataplane/BARS.md). Do not quote toy RSS against Bun.
