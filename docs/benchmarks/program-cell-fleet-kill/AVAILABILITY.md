# Tier C availability — lease TTL, failover, and three columns

**Context:** During `FLEET_PHASED_N=1000` on Cloudflare R2, a survivor self-fenced (`node_lease_watchdog_fence`, exit **code=3**) while **duplicates stayed 0**. Safety held; liveness needed an orchestrator. The board now counts that as its own column.

## The 12-second median is mostly the lease

A survivor can take over a Durable Object only after the dead node's lease expires. With stock `CELLD_TTL_MS=10000`, failover cannot be much faster than **~10s + detection**, which matches measured resume p50 (~12s) once ownership wait is included in `resumeMs`.

So the TTL pulls two ways:

| Longer TTL                                               | Shorter TTL                                             |
| -------------------------------------------------------- | ------------------------------------------------------- |
| More room for slow R2 renewals → fewer false self-fences | Faster lease expiry → faster failover                   |
| Every crash pauses programs for ~TTL or more             | Less headroom → more false fences under storage latency |

**Raising TTL alone trades one availability problem for another.** At 30s, every node kill pauses programs for ~30s+.

## Preferred levers (planned — not a measured result)

1. **Renew more often inside the same TTL** — e.g. every **⅕** of the TTL (stock celld 0.4.0 renews near **⅓**, `prior_authority_headroom_ms ≈ 6665` on a 10s lease), with retry on a slow renewal. Headroom rises; failover floor stays ~TTL.
2. **Keep leases on lower-latency storage** — R2 renew RTT of **270–560ms** is high for a lease. A regional DB or coordination service for leases (program state can stay on R2) would cut false fences at any TTL.

**celld 0.4.0 knobs:** only `CELLD_TTL_MS` is exposed. There is no `CELLD_RENEW_*` env. Renew cadence and lease-store placement are production asks / future celld surfaces — mark **planned** until run at the same sample size as stock. Do not pretend a 30s TTL is the preferred production tune.

## Parallel product work (does not block claim-path v2)

Claim-path N≈1000 v2 scores **correctness** (zero wrong outcomes) separately from **availability** (≤2% failure-rate ceiling on **all 1000** trials = 750 write-kill + 250 await; resume/recovery tails **reported without a ceiling**). “In time” = wall clock **`FLEET_PHASED_RESUME_DEADLINE_MS=60000`**, including orchestrator recovery. These celld items run **in parallel** so a later re-measure can show deadline-miss rate falling from X% to Y%:

| Track                            | Meaning                                                                                                                                                                                                | Where                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lease renew / regional store** | Cut false `SELF-FENCE` under R2 RTT (preferred levers above)                                                                                                                                           | Upstream celld — no `CELLD_RENEW_*` yet                                                                                                       |
| **Lease-sweep**                  | Retire dead node-session leases so a restarted peer is not blocked by a fenced identity; **bound** stuck maintain / dead-leader sweep / bundle GC so #490 cannot block the ticker forever                 | Vendored `0.4.0-clawql.3` had `CELLD_MAINTENANCE_PHASE_BUDGET_SECS`. **Stock tip 0.6.3 still needs the equivalent** — v3 N=1000 failed availability with **712** accumulated `nodes/fleet_*.json` (fresh `CELLD_NODE` every restart). **Harness mitigation (default):** stable `fleet_A`/`fleet_B` + post-fence wait ≥TTL (`FLEET_PHASED_FRESH_NODE_IDS=1` restores legacy). Multi-hour soak **240**/~3.75h: unique nodes **2** (PASS); 14 self-fences recovered; 6 ready flakes — [`node-soak-evidence.json`](./node-soak-evidence.json). **Upstream sweep still required** before v4. |
| **Alive vs ready**               | Process-up ≠ serving. Liveness must always answer; readiness may 503. Callers wait `/program/health` (or readiness), not confuse alive with serving                                                     | Vendored `0.4.0-clawql.3`: `/.well-known/celld/alive` + timed `/health`. **Stock 0.6.3 binary has `/health` only** (no `/alive` in strings). Harness prefers `/alive` then falls back. **Blocker for v4** alongside lease-sweep; require soak (stable node-id count, no self-fence pile-up) before next N=1000. |
| **Pause-aware clocks**           | Timers that handle the **host** being paused/suspended (wall time jumps while the machine was not running) — behind pause-fetch failures; **not** freezing the resume deadline during harness recovery | Still open on the celld / product list. Harness reports diagnostic `resumeActiveMs` + `recoveryMs` but scores availability on wall `resumeMs` |

## Stall forensics (stock 10s / R2)

| Knob / observation                | Value                                                  |
| --------------------------------- | ------------------------------------------------------ |
| `CELLD_TTL_MS`                    | **10000**                                              |
| Observed renew start              | `prior_authority_headroom_ms ≈ 6665` (~⅓ TTL consumed) |
| Observed renew RTT (`elapsed_ms`) | typically **270–560ms** under peer-down load           |
| Fence                             | Watchdog if lease not renewed within TTL               |

### ~900s resume tails — harness wait vs product hang

Stalls land at **~875–921s**. Grep found no celld/R2 **15-minute** lease TTL. The arithmetic is harness-side; the _reason_ the harness waited is product-side.

| Layer                                   | Finding                                                                                                                                                            | Fix does                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Harness (explains the 15 minutes)**   | `waitNode` used `programAttempts=180` × `fetchJson` **5s** when `/health` accepts TCP but never responds → **180×5s=900s**. Also bypassed the 60s resume deadline. | **Wall-cap + `deadlineAt`** → faster **classified failure**, better p99 optics. Does **not** make the node healthy.                        |
| **celld (explains why `/health` hung)** | Same pattern as the N=1000 dead-leader-sweep spiral: process accepts connections, does not become ready.                                                           | **Bounded lease-sweep** + **alive vs ready** (still on the parallel product list). This is what removes the _incident_, not just the wait. |

**v2 mid-run (~500 write-kill):** five ~900s stalls seed cascades; **15 failures ≈ 5 stall incidents + twin + 1 lone mid-flight 404**. **p95≈14s / p99≈870s** = discrete stall class (1% of trials), not rising typical recovery. Running v2 process still has the pre-wall-cap harness.

**`during_call` resume 404 — R2 settle (correctness):** read-only check of the live v2 prefix showed trials **134/286/390/442** never had meta+intent in DO storage (neighbors present); **494** had create meta only, intent never durable. Upstream hang was in flight without a durable intent — **durability/correctness**, not availability-only. Zero outside writes (`writeCount=0`) only because the mock hung; a completing upstream would be a lost-order / double-charge risk on resume. Evidence: [`during-call-404-r2-settle.json`](./during-call-404-r2-settle.json). Harness must still retry mid-flight 404 until the wall deadline; product must enforce durable-ack-before-send (celld output-gate gap vs Cloudflare).

## Three columns

| Column                                                             | Property                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| `duplicates`                                                       | Safety — never repeated a write                         |
| `outcomeUnknown`                                                   | Honest uncertainty — person resolves                    |
| `survivorSelfFences` / `survivorRestarts` + recovery in `resumeMs` | Availability — orchestrator work made visible           |
| `resumeDeadlineMisses`                                             | Resumes past `FLEET_PHASED_RESUME_DEADLINE_MS` (want 0) |

## Why ~48% outcome unknown (per phase)

Read alone, “about half of crashes leave an unknown outcome” sounds alarming. It is an artifact of the design: kills are aimed evenly at **four** phases, and **two** of them are the in-flight window where an unknown outcome is the only honest answer.

| Kill phase                        | Outcome unknown (stock N=1000) | Notes                          |
| --------------------------------- | ------------------------------ | ------------------------------ |
| Before the approval is consumed   | **0** / 252 (0%)               | Must stay 0 — nonzero is a bug |
| After intent recorded             | **240** / 248 (~96.8%)         | In-flight window               |
| During the call                   | **241** / 251 (~96.0%)         | In-flight window               |
| After the call, before journaling | **0** / 249 (0%)               | Must stay 0 — nonzero is a bug |

In real operation, crashes mostly land outside the brief in-flight window, so unknown outcomes are far rarer than this targeted test shows. If the two outer phases ever show a nonzero rate, that is a bug to fix, not a number to explain.

**Does unknown undermine durability?** Marking a *durable* mid-flight intent as unknown is honesty, not weakness. **Lost pretends-journaled intent** (R2 settle) *does* undermine the mechanism claim — that is a durability defect, separate from the duplicate column. Recovery is not limited to “retry / do nothing / ask a person” — **check by unique reference, then decide** (after the original can no longer land) is the preferred path when the API allows it; idempotency keys are the other. Person only when neither exists. Framing and product plan: [golem-overlap honesty § outcome unknown](../../gtm/golem-overlap-and-durability-honesty.md#why-outcome-unknown-and-why-that-does-not-undermine-durability).

## Comparison rows

See [`ttl-tradeoff-evidence.json`](./ttl-tradeoff-evidence.json) and [`TTL-TRADEOFF.md`](./TTL-TRADEOFF.md):

- **stock** — `CELLD_TTL_MS=10000`, leases on R2, celld default renew (~⅓ TTL). Failover ≈ TTL. **Measured N=1000.**
- **ttl_only_30s** — same renew fraction and R2, TTL stretched to 30s. Tradeoff demo (**n=40** — label sample size). Expect fewer fences, slower failover. **Not** the preferred sole production lever.
- **production_preferred** — **planned**, not measured. Keep failover TTL at the pause budget you accept; renew every ⅕ + regional lease store (pending celld knobs). Run at stock sample size before publishing numbers.

## Claim shape (stock)

> Across 1,000 crashes injected at every phase of a write, programs resumed on another node with no repeated writes (the 95% upper bound on the duplicate rate is 0.3%). The median resume took about 12 seconds, set by the lease timeout. Writes caught mid-flight are marked outcome unknown for a person to resolve. Under stock settings, 0.6% of surviving nodes paused themselves for safety, and 0.9% of resumes missed the recovery deadline.

Not durable execution / exactly-once. Two nodes, one object-storage provider unless the row says otherwise.
