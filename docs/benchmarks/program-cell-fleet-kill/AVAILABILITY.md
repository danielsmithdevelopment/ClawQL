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

## Preferred levers (not “just make TTL bigger”)

1. **Renew more often inside the same TTL** — e.g. every **⅕** of the TTL (stock celld 0.4.0 renews near **⅓**, `prior_authority_headroom_ms ≈ 6665` on a 10s lease), with retry on a slow renewal. Headroom rises; failover floor stays ~TTL.
2. **Keep leases on lower-latency storage** — R2 renew RTT of **270–560ms** is high for a lease. A regional DB or coordination service for leases (program state can stay on R2) would cut false fences at any TTL.

**celld 0.4.0 knobs:** only `CELLD_TTL_MS` is exposed. There is no `CELLD_RENEW_*` env. Renew cadence and lease-store placement are production asks / future celld surfaces — do not pretend a 30s TTL is the preferred production tune.

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

## Comparison rows

See [`ttl-tradeoff-evidence.json`](./ttl-tradeoff-evidence.json) and [`TTL-TRADEOFF.md`](./TTL-TRADEOFF.md):

- **stock** — `CELLD_TTL_MS=10000`, leases on R2, celld default renew (~⅓ TTL). Failover ≈ TTL.
- **ttl_only_30s** — same renew fraction and R2, TTL stretched to 30s. Tradeoff demo: expect fewer fences, slower failover. **Not** the preferred sole production lever.
- **production_preferred** — keep failover TTL at the pause budget you accept; renew every ⅕ + regional lease store (pending celld knobs). Expected: stock-like resume p50, lower fence rate.

## Claim shape

> Programs survive a node crash, resuming on another node in about **N** seconds, with no repeated writes; a write interrupted in flight is marked outcome unknown for a person to resolve.

**N** is the measured resume p50 for that row (includes lease wait). Not durable execution / exactly-once. Two nodes, one object-storage provider unless the row says otherwise.
