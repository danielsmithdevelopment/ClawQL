# ClawQL-maintained celld fork

**Upstream:** [denoland/celld](https://github.com/denoland/celld) Apache-2.0  
**Pinned base:** see [`UPSTREAM_PIN`](./UPSTREAM_PIN) (`v0.4.0`)  
**Why:** ClawQL N=1000 R2 settle showed mid-flight kills where an upstream call left without a durable write intent. celld’s output gate existed but did not hold under those kills. GitHub integration here cannot create `danielsmithdevelopment/celld`, so this tree is vendored under ClawQL until a standalone fork repo is published.

## ClawQL patches (vs upstream v0.4.0)

| Patch | Env | Closes |
| ----- | --- | ------ |
| Confirm GET after each LTX PUT before `synced_seq` advances (fenced bucket ack) | `CELLD_FENCED_ACK` default **on** (`=0` disables) | H1 — gate must not release fetch on a PUT survivors cannot read |
| Refuse start when a **live** foreign process generation holds `CELLD_NODE` | `CELLD_REFUSE_LIVE_INCARNATION` default **on** | H2 — duplicate-identity / stale incarnation |
| Refuse node-log bundle PUT when record is not Open at shipper epoch | (always) | H2 — stale writer must not land orphan bundles |

“Durable” for the output gate means: **committed under the current lease epoch**, with ownership still naming this node — not merely accepted in memory / local WAL.

## Build

```sh
cd vendor/celld
cargo build --release -p celld
# install:
install -m 755 target/release/celld ~/.local/lib/celld/releases/v0.4.0-clawql.1/celld
ln -sfn ../lib/celld/releases/v0.4.0-clawql.1/celld ~/.local/bin/celld
```

ClawQL boards force `CELLD_OUTPUT_GATE=1`. Prefer this binary over stock `celld.dev` install until upstream lands equivalent fencing.

## Restore mechanism claim only after

1. This binary is pinned on CI / boards.  
2. Kill-after-fetch + stale-incarnation tests pass (`CLAWQL_REQUIRE_OUTPUT_GATE=1`).  
3. v3 board with automatic mid-flight storage intent check is green.  
4. Durable-ack latency (p50/p99 of gate wait) is published.
