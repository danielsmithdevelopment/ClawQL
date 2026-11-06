# Lease TLA+ (sweep + ambiguous renew)

## `LeaseSweepExpiry` — expiry ≠ dead

| Config | `WeakTreatExpiryAsDead` | Expect |
| ------ | ----------------------- | ------ |
| `LeaseSweepExpiry.cfg` | `FALSE` (target) | **PASS** — open-log recovery only when `ownerDead` |
| `LeaseSweepExpiryWeak.cfg` | `TRUE` (historical) | **COUNTEREXAMPLE** — freeze past expiry → sweep drops mid-flight intent |

```bash
scripts/formal/run-lease-sweep-expiry-tlc.sh
```

Lab: `vendor/celld-lab/crates/celld/host_process.rs`.

## `LeaseRenewAmbiguous` — renew / late / pause divergence

Open lead for TTL3s 2/100 ([`AMBIGUOUS_RENEWAL.md`](../../../docs/benchmarks/program-cell-fleet-kill/AMBIGUOUS_RENEWAL.md) · [`TTL3S_THREE_CHECKS.md`](../../../docs/benchmarks/program-cell-fleet-kill/TTL3S_THREE_CHECKS.md)).

| Config | Weak flag | Expect | Product |
| ------ | --------- | ------ | ------- |
| `LeaseRenewAmbiguous.cfg` | all `FALSE` | **PASS** | — |
| `LeaseRenewAmbiguousWeak.cfg` | `WeakIgnoreAmbiguousDivergence` | **CE** | Ruled out (Ambiguous → readback) |
| `LeaseRenewAmbiguousWeakReceipt.cfg` | `WeakStampAuthorityAtResponse` | **CE** | Ruled out (`last_ok` at send) |
| `LeaseRenewAmbiguousWeakPause.cfg` | `WeakHolderClockPaused` | **CE** | **Open candidate** — mono `last_ok` vs wall expiry under VM suspend; fix = BOOTTIME |

```bash
scripts/formal/run-lease-renew-ambiguous-tlc.sh
```
