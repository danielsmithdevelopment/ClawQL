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

Related lab fix: `vendor/celld-lab/crates/celld/host_process.rs`
(`lease_open_log_may_be_recovered_as_dead` vs `lease_may_be_fenced`).
