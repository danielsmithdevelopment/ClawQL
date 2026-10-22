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

## Stall forensics (stock 10s / R2)

| Knob / observation                | Value                                                  |
| --------------------------------- | ------------------------------------------------------ |
| `CELLD_TTL_MS`                    | **10000**                                              |
| Observed renew start              | `prior_authority_headroom_ms ≈ 6665` (~⅓ TTL consumed) |
| Observed renew RTT (`elapsed_ms`) | typically **270–560ms** under peer-down load           |
| Fence                             | Watchdog if lease not renewed within TTL               |

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

**Does unknown undermine durability?** No. Durability here means the program survives, nothing is repeated, and nothing disappears silently. The in-flight case is the one place the callee’s truth is unavailable; marking it unknown is honesty, not weakness. Recovery is not limited to “retry / do nothing / ask a person” — **check by unique reference, then decide** (after the original can no longer land) is the preferred path when the API allows it; idempotency keys are the other. Person only when neither exists. Framing and product plan: [golem-overlap honesty § outcome unknown](../../gtm/golem-overlap-and-durability-honesty.md#why-outcome-unknown-and-why-that-does-not-undermine-durability).

## Comparison rows

See [`ttl-tradeoff-evidence.json`](./ttl-tradeoff-evidence.json) and [`TTL-TRADEOFF.md`](./TTL-TRADEOFF.md):

- **stock** — `CELLD_TTL_MS=10000`, leases on R2, celld default renew (~⅓ TTL). Failover ≈ TTL. **Measured N=1000.**
- **ttl_only_30s** — same renew fraction and R2, TTL stretched to 30s. Tradeoff demo (**n=40** — label sample size). Expect fewer fences, slower failover. **Not** the preferred sole production lever.
- **production_preferred** — **planned**, not measured. Keep failover TTL at the pause budget you accept; renew every ⅕ + regional lease store (pending celld knobs). Run at stock sample size before publishing numbers.

## Claim shape (stock)

> Across 1,000 crashes injected at every phase of a write, programs resumed on another node with no repeated writes (the 95% upper bound on the duplicate rate is 0.3%). The median resume took about 12 seconds, set by the lease timeout. Writes caught mid-flight are marked outcome unknown for a person to resolve. Under stock settings, 0.6% of surviving nodes paused themselves for safety, and 0.9% of resumes missed the recovery deadline.

Not durable execution / exactly-once. Two nodes, one object-storage provider unless the row says otherwise.
