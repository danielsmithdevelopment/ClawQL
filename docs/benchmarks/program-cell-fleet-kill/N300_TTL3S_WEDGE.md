# Frozen bar — TTL 3s wedged N=300 (post expiry≠dead fix)

Frozen **before** the N=300 run. Do not loosen after results.

## Pass iff

| Gate | Criterion |
| ---- | --------- |
| Sample | **N=300** write-kill trials, wedged board (`FLEET_PHASED_WEDGE_HEALTH=1`) |
| TTL | **`CELLD_TTL_MS=3000`** (disclosed; not raised) |
| Correctness | **0** `lost_midflight_intent` (and 0 other correctness failures) — **any loss fails** |
| Score mode | `correctness_availability_v2` |
| Logs | **`FLEET_PHASED_APPEND_LOGS=1`** |
| Audit | Supersede audit on the board’s celld logs after the run |
| Binary | Lab release built **with** expiry≠dead fix (`lease_open_log_may_be_recovered_as_dead`) |

Zero of 300 → 95% rule-of-three upper bound **3/300 = 1.0%**.

## Order (do not skip)

1. **E2E SIGSTOP before/after** on real lab binaries ([`EXPIRY_NOT_DEAD.md`](./EXPIRY_NOT_DEAD.md)) — **done 2026-11-05:** pre-fix eager-recovers open log while owner is `T`, post-fix skips; **program intent kept on both** ⇒ 2/100 has another cause. Fix still ships; N=300 still required.
2. **200-cycle enriched soak** on the fixed build vs [`SOAK_GATES.md`](./SOAK_GATES.md) (availability regression check).
3. **This N=300 board.**
4. Only then consider **v4**.

## Evidence path

`docs/benchmarks/program-cell-fleet-kill/phased-n300-wedge-lab-enriched-ttl3s.json`

## Not a pass

- Quiet N=100 remasure at TTL 3s or 10s
- Predicate-only / TLA-only proof without the e2e pair and this board
