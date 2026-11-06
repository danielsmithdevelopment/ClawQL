# Expiry ≠ dead (lease sweep)

**Lead (closed as a safety fix; not the 2/100 mechanism):** `lease_may_be_fenced_as_dead` treated published expiry as death. That is unsafe whether or not it caused the TTL=3s wedge trials 1 and 5. E2e showed the fix is real **and** not sufficient to explain those losses.

## Rule

| Concept | Criterion |
| ------- | --------- |
| **Fenced takeover** | Expiry **or** same-host process evidence. Takeover must fence (epoch bump + storage CAS the old owner cannot pass). |
| **Dead** (abandon open log) | Same-host **process evidence**, or cross-host/unstamped **TTL + fencing**. Never expiry alone on a still-live same-host owner. |

## Fix (lab)

- `lease_may_be_fenced` — expiry permits **fencing**, not abandonment.
- `lease_open_log_may_be_recovered_as_dead` — open-log sweep only when abandoned under the table above.
- `sweep_dead_leaders` uses the abandonment predicate for open logs; sealed GC stays on fenceable.

## E2E paired result (2026-11-05)

Absolute `CELLD_BIN`, `/proc/exe` check, owner confirmed `State: T` for the hold.

| Build | Eager while `T` | Skip abandon | Program intent |
| ----- | --------------- | ------------ | -------------- |
| Pre-fix `22a6569…` | **1** (recovered+sealed) | 0 | **kept** |
| Post-fix `1360bdf…` | **0** | **≥2** | **kept** |

Verdicts: `pre_fix_sweep_fired_intent_kept` · `post_fix_skip_abandon_intent_kept`.

**Expiry≠dead is confirmed; program loss is not.** The TTL=3s 2/100 has **another cause** — publish as [mechanism unexplained](./WEDGE_TTL3S_CORRECTNESS.md). Open lead: [ambiguous renewal](./AMBIGUOUS_RENEWAL.md).

Evidence: [`expiry-sweep-e2e-pre-fix.json`](./expiry-sweep-e2e-pre-fix.json) · [`expiry-sweep-e2e-post-fix.json`](./expiry-sweep-e2e-post-fix.json).

```bash
node docs/examples/streams-celld/scripts/expiry-sweep-intent.test.mjs
scripts/formal/run-lease-sweep-expiry-tlc.sh
npm run benchmark:fleet-expiry-sweep-e2e   # CELLD_BIN + EXPECT_* as in harness header
```

## 200-cycle soak (count the fences)

Evidence: [`node-soak-200-expiry-not-dead.json`](./node-soak-200-expiry-not-dead.json) · fixed `1360bdf…` · n=200 · `CELLD_TTL_MS=10000`.

| Gate | Result |
| ---- | ------ |
| Unique nodes | **2** |
| readyFails | **0** |
| selfFences | **3** |
| Suspend void | **`voided=false`** — monitor growth ≈0; **do not** reclassify as host pause after the fact |
| Gate outcome | **fails** self-fence / Wilson ceilings (self-fence gate allows **zero**) |

**Framing:** Voiding depends on the monitor, not a later narrative. With the monitor silent, these **3 self-fences count**. That is a **possible regression signal** vs the authorizing soak that had **0** self-fences before expiry≠dead. It may be the cloud host, but only a soak on a host that does not suspend can tell — [`MAC_MINI_AGENT.md`](./MAC_MINI_AGENT.md).

## Order

1. E2e before/after — **done** (sweep differential; intent kept → another cause)
2. 200-cycle soak — **done** (3 self-fences **count**; not authorizing)
3. N=300 TTL3s — **PASS** 0/300 lost (rate bound only) — [`N300_TTL3S_WEDGE.md`](./N300_TTL3S_WEDGE.md)
4. **Authorizing 1000-cycle soak on Mac mini** with fixed build → `measured_v4_ready`
5. **v4 N=1000** there (append logs + R2 intent check); report **mechanism unexplained** alongside
6. Parallel: ambiguous-renewal TLA + forced renew latency — [`AMBIGUOUS_RENEWAL.md`](./AMBIGUOUS_RENEWAL.md)
