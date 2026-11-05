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
2. **200-cycle enriched soak** on the fixed build vs [`SOAK_GATES.md`](./SOAK_GATES.md) — **done:** nodes=2, readyFails=0, selfFences=3 (correlated dual + 1 solo; cloud-VM pause signature, not sweep-stall). Host cannot authorize.
3. **This N=300 board.**
4. Only then consider **v4**.

## Evidence path

`docs/benchmarks/program-cell-fleet-kill/phased-n300-wedge-lab-enriched-ttl3s.json`

## Result (2026-11-05 America/Los_Angeles)

| Gate | Result |
| ---- | ------ |
| N | **300**/300 write-kill (+ 8 await) |
| `lost_midflight_intent` | **0** |
| Correctness failures | **0** (`gates.correctness.pass`) |
| Availability rate | **1.30%** (4/308) ≤ 2% ceiling |
| Board `ok` | **true** · `status=measured` |
| Binary | `lab_enriched_expiry_not_dead_1360bdf3f967` (sha256 `1360bdf…`) |
| TTL | 3000 · append logs · fenceMode `lab_enriched_wedged` |
| Supersede audit | [`n300-ttl3s-supersede-audit.json`](./n300-ttl3s-supersede-audit.json) — **0** supersede lines (`status=no_supersede_lines`) |

**Bar met.** Rule-of-three 95% UB on lost-intent rate: **3/300 = 1.0%**. Original 2/100 mechanism remains unidentified (e2e showed expiry-as-dead is not sufficient alone); this board clears the frozen N=300 correctness gate.

## Not a pass

- Quiet N=100 remasure at TTL 3s or 10s
- Predicate-only / TLA-only proof without the e2e pair and this board
