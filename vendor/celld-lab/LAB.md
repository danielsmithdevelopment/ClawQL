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
| Authorizing overnight soak on lab binary | **Measured** on Mac mini/Colima — [`node-soak-lab-authorizing-mac-mini.json`](../../docs/benchmarks/program-cell-fleet-kill/node-soak-lab-authorizing-mac-mini.json) (`measured_v4_ready`). Host rules: [`SOAK_HOST.md`](../../docs/benchmarks/program-cell-fleet-kill/SOAK_HOST.md) / [`MAC_MINI_AGENT.md`](../../docs/benchmarks/program-cell-fleet-kill/MAC_MINI_AGENT.md) |
| Supersede process-evidence audit | Dual-sided logs (lease stamp **and** local `/proc` observation) — [`SUPERSEDE_AUDIT.md`](../../docs/benchmarks/program-cell-fleet-kill/SUPERSEDE_AUDIT.md). Pre-enrichment Mac mini audit = `count_and_flag_only` (not a pass). Authorizing baseline commit `112a8aa6e`. |

## Same-host supersede (claim path)

1. Writers stamp `host_process` on every node-lease CAS.
2. **Expiry ≠ dead.** Published expiry permits a **fenced** takeover (`lease_may_be_fenced`). Open-log abandonment / eager sweep recovery uses `lease_open_log_may_be_recovered_as_dead` — same-host process evidence, or cross-host/unstamped TTL+fencing. A wedged (still-live) owner past expiry must not have its open log recovered as abandoned. See [`EXPIRY_NOT_DEAD.md`](../../docs/benchmarks/program-cell-fleet-kill/EXPIRY_NOT_DEAD.md) · TLA `formal/tla/lease/LeaseSweepExpiry`.
3. Initial lease claim replaces an *unexpired* foreign generation only with `same_host_owner_dead=Some(true)`. Live same-host duplicates and unstamped/cross-host unexpired leases wait TTL / retry (never “looks dead”).

## Build

```sh
cargo build -p celld --release --manifest-path vendor/celld-lab/Cargo.toml
# binary: vendor/celld-lab/target/release/celld
CELLD_BIN=$PWD/vendor/celld-lab/target/release/celld npm run benchmark:fleet-node-soak
```

Authorizing soak and v4 must run a **binary built from this lab** (or equivalent upstream once merged). Stock 0.6.3 baseline soak is not authorizing — see [`node-soak-baseline-unfixed-0.6.3.json`](../../docs/benchmarks/program-cell-fleet-kill/node-soak-baseline-unfixed-0.6.3.json).
