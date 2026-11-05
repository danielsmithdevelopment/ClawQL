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

## `LeaseRenewAmbiguous` — renew with unknown outcome

Open lead for TTL3s 2/100 ([`AMBIGUOUS_RENEWAL.md`](../../../docs/benchmarks/program-cell-fleet-kill/AMBIGUOUS_RENEWAL.md)).

| Config | `WeakIgnoreAmbiguousDivergence` | Expect |
| ------ | ------------------------------- | ------ |
| `LeaseRenewAmbiguous.cfg` | `FALSE` (target) | **PASS** — no optimistic belief bump; fence on divergence |
| `LeaseRenewAmbiguousWeak.cfg` | `TRUE` | **COUNTEREXAMPLE** — optimistic belief after Ambiguous → write past storage expiry → survivor drops intent |

```bash
scripts/formal/run-lease-renew-ambiguous-tlc.sh
```

**Product code check:** celld Ambiguous renew → readback; does **not** bump `last_ok` / held expiry. Weak CE is a model tooth, not a proven product bug. See `AMBIGUOUS_RENEWAL.md` § Code check.
