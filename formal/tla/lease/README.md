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

## `LeaseRenewAmbiguous` — renew with unknown / late outcome

Open lead for TTL3s 2/100 ([`AMBIGUOUS_RENEWAL.md`](../../../docs/benchmarks/program-cell-fleet-kill/AMBIGUOUS_RENEWAL.md)).

| Config | Weak flag | Expect |
| ------ | --------- | ------ |
| `LeaseRenewAmbiguous.cfg` | both `FALSE` (target) | **PASS** — send-anchored belief; no optimistic Ambiguous bump |
| `LeaseRenewAmbiguousWeak.cfg` | `WeakIgnoreAmbiguousDivergence` | **COUNTEREXAMPLE** — optimistic Ambiguous bump → write past storage → drop |
| `LeaseRenewAmbiguousWeakReceipt.cfg` | `WeakStampAuthorityAtResponse` | **COUNTEREXAMPLE** — Applied stamps belief at receipt after RTT → belief > storage → drop |

```bash
scripts/formal/run-lease-renew-ambiguous-tlc.sh
```

**Product code checks:** (1) Ambiguous → readback, no belief bump. (2) `last_ok_mono_ms := anchor_mono_ms` at renew **send**, not Applied receipt. Both weak CEs are model teeth, not proven product bugs. Mechanism for 2/100 stays open. See `AMBIGUOUS_RENEWAL.md`.
