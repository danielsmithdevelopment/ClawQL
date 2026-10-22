# clawql-dataplane (ADR 0016 spike)

Rust Streamable-HTTP **execute** hot path. Phase A = bare path (catalog → REST → `where`), no governance.

## Quick start

```bash
cd crates
cargo run -p clawql-dataplane -- --self-mock --bind 127.0.0.1:8787
```

```bash
# initialize
curl -sS http://127.0.0.1:8787/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# execute
curl -sS http://127.0.0.1:8787/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"execute","arguments":{"operationId":"mock_listPets","where":"pets[?tag=='\''a'\'']"}}}'
```

Or: `../../scripts/dataplane/smoke.sh`

## Layout

| Module | Role |
| ------ | ---- |
| `catalog` | JSON op catalog (SQLite bind later) |
| `execute` | REST call + fields projection |
| `where_filter` | JMESPath caps matching TS |
| `mcp` | Minimal `/mcp` JSON-RPC |
| `policy` | Lean-shaped approval oracle (Verus in Phase C) |
| `mock_upstream` | In-process REST for benches |

## Bars

See [`docs/spikes/rust-dataplane/BARS.md`](../../docs/spikes/rust-dataplane/BARS.md).
