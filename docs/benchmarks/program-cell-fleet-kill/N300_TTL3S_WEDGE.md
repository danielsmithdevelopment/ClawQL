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
| Binary | Lab release built **with** expiry≠dead fix |

Zero of 300 → 95% rule-of-three upper bound **3/300 = 1.0%**.

## Result (2026-11-05 America/Los_Angeles) — bar met; mechanism not closed

| Gate | Result |
| ---- | ------ |
| N | **300**/300 write-kill (+ 8 await) |
| `lost_midflight_intent` | **0** |
| Correctness failures | **0** |
| Availability rate | **1.30%** (4/308) ≤ 2% |
| Board `ok` | **true** |
| Resume tail | p99≈7.9s · max≈13.9s — **quieter** than the failing 2/100 regime (~62s resumes, 5 avail failures) |
| Supersede audit | [`n300-ttl3s-supersede-audit.json`](./n300-ttl3s-supersede-audit.json) — 0 supersede lines |

**What this clears:** the frozen N=300 correctness **rate** bar (loss rare on this build at TTL 3s).

**What this does not clear:** the **cause** of the original 2/100. Publish that board as [mechanism unexplained](./WEDGE_TTL3S_CORRECTNESS.md). Neither remasures nor N=300 re-entered the ambiguous-renewal / long-resume pressure regime. Open lead: [`AMBIGUOUS_RENEWAL.md`](./AMBIGUOUS_RENEWAL.md).

Evidence: [`phased-n300-wedge-lab-enriched-ttl3s.json`](./phased-n300-wedge-lab-enriched-ttl3s.json).

## Next

Mac mini authorizing soak → v4 N=1000 with append logs + R2 intent check; report unexplained mechanism alongside. Parallel: model + force ambiguous renewals.
