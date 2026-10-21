# Tier C availability finding — survivor self-fence

**Context:** During `FLEET_PHASED_N=1000` on Cloudflare R2 (2026-10-21), the board stalled at **60/1000** with **duplicates=0**. Safety held; liveness did not.

## What happened

1. Victim node SIGKILL’d (intentional).
2. Survivor stayed up and began / continued lease renewals against R2.
3. Survivor emitted `SELF-FENCE: node lease not renewed within TTL` and exited **code=3** (`node_lease_watchdog_fence`).
4. The board’s `/program/resume` fetch had **no timeout**, so the trial hung until intervened — a harness liveness bug on top of the substrate fence.

Zero duplicates across the first 60 trials means fencing did its job: a node that could not confirm its lease stopped rather than risk dual writers. Customers would still see an **outage** until an orchestrator restarts the fenced node and retries resume.

## Lease timing (celld 0.4.0 defaults)

| Knob | Value |
| --- | --- |
| `CELLD_TTL_MS` | **10000** (10s node lease lifetime) |
| Observed renew start | `prior_authority_headroom_ms ≈ 6665` (~⅓ of TTL consumed) |
| Observed renew RTT (`elapsed_ms`) | typically **270–560ms**; spikes ≥559ms seen under peer-down load |
| Fence | Watchdog halts if lease not renewed within TTL |

Renewals are meant to land well inside the TTL. Under R2 latency + peer-tunnel retry storms (victim down → `Connection refused` on `/peer/tunnel`), a delayed renew cycle can burn the remaining headroom and trip the fence even though individual renew RTTs look “fine” relative to 10s when measured in isolation.

## Production implication

This is an **availability** risk on slow object stores, not a safety regression:

- **Safety:** fence prevents split-brain writes.
- **Availability:** without an orchestrator that restarts a code=3 node and retries resume, programs stall.

**Tuning:** raise `CELLD_TTL_MS` so renew headroom ≫ p99 R2 renew RTT (e.g. **30000** when p99 renew is hundreds of ms). Re-measure fence rate; do not claim the stall “went away” without the column.

## Board columns (phased evidence)

| Column | Property |
| --- | --- |
| `duplicates` | Safety — never repeated a write |
| `outcomeUnknown` | Honest uncertainty — person resolves |
| `survivorSelfFences` / `survivorRestarts` + recovery folded into `resumeMs` | Availability — orchestrator work made visible |
| `resumeDeadlineMisses` | Resumes that did not complete within `FLEET_PHASED_RESUME_DEADLINE_MS` (should be 0 after fetch timeouts) |

Harness restarts of a fenced survivor are **counted**, not hidden. Recovery time is included in that trial’s `resumeMs` (feeds p99 / p999).
