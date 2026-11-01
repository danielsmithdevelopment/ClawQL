# celld lab fork (availability — not the product pin)

**Product pin remains** stock `denoland/celld` **v0.6.3** ([`../celld/UPSTREAM_PIN`](../celld/UPSTREAM_PIN)).

This tree is tip **v0.6.3** plus ClawQL **availability** patches for the pre-v4 order.

## Status

| Item | State |
| ---- | ----- |
| Alive ≠ ready (`/.well-known/celld/alive` + timed `/health` + WEDGE on readiness only) | **Landed** |
| Bounded maintenance / lease-sweep ticker (`CELLD_MAINTENANCE_PHASE_BUDGET_SECS`) | **Landed** |
| Lease stamps `host_process` (`pid` + start ticks + `boot_id`) | **Landed** |
| Same-host supersede when prior `host_process` is provably dead (claim path) | **Landed** — recovery fence + sweep + initial CAS refuse live/unknown |
| Authorizing overnight soak on lab binary | **Blocked on cloud-agent VM suspend** — awake windows 0/0 (e.g. ~304 cycles); need non-suspending host |

## Same-host supersede (claim path)

1. Writers stamp `host_process` on every node-lease CAS.
2. Predecessor recovery / dead-leader sweep may fence when expiry passed **or** `host_process` is provably dead on this host (`host_process.rs`).
3. Initial lease claim replaces an *unexpired* foreign generation only with `same_host_owner_dead=Some(true)`. Live same-host duplicates and unstamped/cross-host unexpired leases wait TTL / retry (never “looks dead”).

## Build

```sh
cargo build -p celld --release --manifest-path vendor/celld-lab/Cargo.toml
# binary: vendor/celld-lab/target/release/celld
CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld npm run benchmark:fleet-node-soak
```

Authorizing soak and v4 must run a **binary built from this lab** (or equivalent upstream once merged). Stock 0.6.3 baseline soak is not authorizing — see [`node-soak-baseline-unfixed-0.6.3.json`](../../docs/benchmarks/program-cell-fleet-kill/node-soak-baseline-unfixed-0.6.3.json).
