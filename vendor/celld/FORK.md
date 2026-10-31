# ClawQL-maintained celld fork

**Upstream:** [denoland/celld](https://github.com/denoland/celld) Apache-2.0  
**Pinned base:** see [`UPSTREAM_PIN`](./UPSTREAM_PIN) (`v0.4.0`)  
**ClawQL binary:** `0.4.0-clawql.2`  
**Why:** ClawQL N=1000 R2 settle showed mid-flight kills where an upstream call left without a durable write intent. celld’s output gate existed but did not hold under those kills. GitHub integration here cannot create `danielsmithdevelopment/celld`, so this tree is vendored under ClawQL until a standalone fork repo is published.

## ClawQL patches (vs upstream v0.4.0)

| Patch | Env | Closes |
| ----- | --- | ------ |
| Confirm GET after each LTX PUT before `synced_seq` advances (fenced bucket ack) | `CELLD_FENCED_ACK` default **on** (`=0` disables); `CELLD_FENCED_ACK_CONFIRM_GET` default **on** (set `=0` for PUT-only latency A/B) | H1 — gate must not release fetch on a PUT survivors cannot read |
| Ownership/epoch still current at confirm before `synced_seq` / await_durable success; output gate **always** `VerifyOwnership` (Fleet + Bucket) | same fence flag | H2 — stale incarnation must not ack/send after lease epoch moved |
| Refuse start when a **live** foreign process generation holds `CELLD_NODE` | `CELLD_REFUSE_LIVE_INCARNATION` default **on** | H2 — duplicate-identity / stale incarnation |
| Refuse node-log bundle PUT when record is not Open at shipper epoch | (always) | H2 — stale writer must not land orphan bundles |
| Chaos: hang `/.well-known/celld/health` while flag file exists | `CELLD_WEDGE_HEALTH_FLAG=<path>` | Board: hang health → kill exercises stale path |

“Durable” for the output gate means: **committed under the current lease epoch**, with ownership still naming this node **at confirmation time** — not merely accepted in memory / local WAL, and not merely “object exists in the orphaned prefix.”

## Output gate default-on

`CELLD_OUTPUT_GATE` defaults to **on** (`1`). Set `CELLD_OUTPUT_GATE=0` explicitly to disable the durability wait (accepts loss of an acknowledged write). Boards may still force `=1` as belt-and-suspenders; that is not required for the default path.

## Build

```sh
cd vendor/celld
cargo build --release -p celld
# install:
install -m 755 target/release/celld ~/.local/lib/celld/releases/v0.4.0-clawql.2/celld
ln -sfn ../lib/celld/releases/v0.4.0-clawql.2/celld ~/.local/bin/celld
```

CI builds this binary from vendored source (SBOM + cosign) — see `.github/workflows/celld-vendor-release.yml`. Prefer the CI artifact over a hand-installed binary.

## Upstream

Patches are offered upstream — see [`UPSTREAM_OFFER.md`](./UPSTREAM_OFFER.md). If denoland/celld accepts them, drop the fork.

## Restore mechanism claim only after

1. This binary is pinned on CI / boards.  
2. Kill-after-fetch + stale-incarnation tests pass (`CLAWQL_REQUIRE_OUTPUT_GATE=1`).  
3. Focused wedged during_call board (hundreds of kills) is green.  
4. v3 board with automatic mid-flight storage intent check is green.  
5. Durable-ack latency (p50/p99 of gate wait; PUT-only vs PUT+GET) is published.
