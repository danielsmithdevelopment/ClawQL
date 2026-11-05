# Lease sweep vs wedged owner (TLA+)

`LeaseSweepExpiry.tla` — published lease **expiry ≠ dead**.

| Config | `WeakTreatExpiryAsDead` | Expect |
| ------ | ----------------------- | ------ |
| `LeaseSweepExpiry.cfg` | `FALSE` (target) | **PASS** — open-log recovery only when `ownerDead` |
| `LeaseSweepExpiryWeak.cfg` | `TRUE` (historical) | **COUNTEREXAMPLE** — freeze past expiry → sweep drops mid-flight intent |

Run:

```bash
scripts/formal/run-lease-sweep-expiry-tlc.sh
```

## Mapping

| Spec | Intended lab code (vendored stack; not yet on `main`) |
| ---- | ----------------------------------------------------- |
| Target open-log abandon | `lease_open_log_may_be_recovered_as_dead` (process evidence) |
| Fence on expiry | `lease_may_be_fenced` (epoch bump + CAS; does not drop intent) |
| WeakTreatExpiryAsDead | Historical “expiry ⇒ dead” sweep predicate |

Lab implementation + deterministic JS recipe live on the celld soak stack
([PR #1464](https://github.com/danielsmithdevelopment/ClawQL/pull/1464) and
parents). This directory lands the **oracle on `main`** so CI enforces the
invariant while the Rust/vendor path merges separately.

Narrative: [`docs/benchmarks/program-cell-fleet-kill/EXPIRY_NOT_DEAD.md`](../../../docs/benchmarks/program-cell-fleet-kill/EXPIRY_NOT_DEAD.md).
