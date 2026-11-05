# Ambiguous lease renewal (open mechanism lead)

**Status:** open lead for the TTL=3s wedged **2 × `lost_midflight_intent`**. Not resolved by expiry≠dead, quiet remasures, or N=300 zeros.

**Code checks (2026-11-05):** Two TLC weak classes that produce belief > storage are **ruled out as product matches**. Mechanism stays **unexplained**. No speculative renew-belief fix before v4 from these CEs alone.

| Candidate | Product? | Doc |
| --------- | -------- | --- |
| Optimistic belief bump after Ambiguous | **No** — Ambiguous → readback | § Optimistic Ambiguous |
| Authority stamped at Applied *receipt* (RTT stretch) | **No** — `last_ok_mono_ms := anchor_mono_ms` at *send* | § Receipt stamp |

## What N=300 did and did not show

| Claim | Status |
| ----- | ------ |
| Loss is rare on the fixed build at TTL=3s | **Supported** — 0/300 lost → ~1% rule-of-three UB |
| Cause of the original 2/100 is gone | **Not supported** |
| Expiry-as-dead caused the 2/100 | **Ruled out** as sufficient — e2e pre-fix eager-recovered while owner was `T` and ProgramCell intent **survived** ([`EXPIRY_NOT_DEAD.md`](./EXPIRY_NOT_DEAD.md)) |
| Optimistic belief after Ambiguous renew | **Ruled out as product match** |
| Receipt-stamped `last_ok` stretching past storage | **Ruled out as product match** |

Publish the 2/100 as **mechanism unexplained**. See [`WEDGE_TTL3S_CORRECTNESS.md`](./WEDGE_TTL3S_CORRECTNESS.md).

## Regime mismatch

Neither remasures nor N=300 (avail failures ≈1.3%, quieter resumes) reproduced the **pressure regime** of the failing board:

| Signal | Failing TTL3s N=100 | Later quiet / N=300 |
| ------ | ------------------- | ------------------- |
| Correctness | **2** lost mid-flight | 0 |
| Availability failures | **5**/100 | N=300 ≈4/308 (~1.3%) |
| Resume tail | up to **~62s** (board window) | N=300 resume p99≈7.9s / max≈13.9s |
| Ambiguous renewals (`outcome="ambiguous"`) | present in truncated / pressure logs | sparse or absent under quiet R2 |

Likeliest remaining *regime* suspect is still pressure around renew / R2 latency — but **not** via the two ruled-out belief > storage classes above.

Celld already treats store write failures as ambiguous unless proven not committed (`ownership_store.rs` `LeaseCasError::Ambiguous`; actor logs `outcome="ambiguous"`).

## Code check: optimistic Ambiguous

### TLC (`WeakIgnoreAmbiguousDivergence`)

| State | Action | Meaning |
| ----- | ------ | ------- |
| `StartRenew` | renew in flight | |
| `RenewAmbiguous` | **bumps** belief while storage may stay put | |
| `StartWrite` | mid-flight write under optimistic belief | |
| `SurvivorTakeover` | drops non-durable mid-flight intent | |

### Product

| Site | Behavior |
| ---- | -------- |
| `actor/effects.rs` renew timeout | `Failure::Ambiguous` |
| `node_lease_cas_completed` + Ambiguous | `readback_only`; `ReadSelfNodeLease`; **no** `last_ok` advance |
| `hold_node_lease` | fresh Held only after Applied / zombie adopt |

**Verdict:** not product. Keep weak cfg as regression tooth.

## Code check: receipt-stamped authority (timing)

Same divergence can appear through **time** instead of an epoch-style bump: storage expiry is whatever the CAS body carried (sampled at **send**); if the holder stamps local authority when the Applied **response arrives**, every slow RTT stretches belief past storage by that latency. Failing regime (slow resumes, ambiguous renews) is exactly where that would show.

### Where `last_ok_mono_ms` is stamped (product)

| Site | Stamp |
| ---- | ----- |
| Renew start (`Timer::NodeLeaseRenew`) | `desired.expires_ms = now_ms + ttl`; `PendingNodeLease.anchor_mono_ms = now_mono_ms` (**send**) |
| `hold_node_lease` after Applied | `last_ok_mono_ms: anchor_mono_ms` — **not** completion mono |
| Doc on `PendingNodeLease::anchor_mono_ms` | Explicitly: bucket says `expires_ms` sampled at send; anchoring the fence to write **completion** would serve after peers declare dead for an unbounded RTT |

Zombie adoption after Ambiguous readback takes `min(delta_anchor, observed_anchor)` — earlier of the two, not a receipt stretch of a successful renew.

**Verdict:** stamped at **request send**. Receipt-stamp CE **ruled out** as product match. No “stamp at send minus drift margin” fix required — already send-anchored.

### TLC (`WeakStampAuthorityAtResponse`)

Late Applied after Ticks during flight (receipt CE, depth 9 excerpt):

| State | Action | Meaning |
| ----- | ------ | ------- |
| `StartRenew` | `renewSentAt = 2` | CAS body / send anchor |
| `Tick` ×2 | clock → 4, renew still in flight | response latency |
| `RenewApplied` | storage → 4 (send+TTL), belief → **6** (receipt+TTL) | belief > storage by RTT |
| `StartWrite` | write under stretched belief | |
| `SurvivorTakeover` | drops mid-flight intent | |

Target (both weaks `FALSE`): belief also send-anchored → **PASS**. Runner: `scripts/formal/run-lease-renew-ambiguous-tlc.sh`.

## Forced-latency chase (two arms)

Different code paths — run **both** under wedged TTL=3s before claiming anything about renew under pressure:

| Arm | Inject | Exercises |
| --- | ------ | --------- |
| **A — Ambiguous / timeout** | Drop or time out the renew **response** (CAS may or may not have landed) | Ambiguous → readback path |
| **B — Late success** | Delay the **response** of a renew that **succeeded** at storage (Applied still returns, late) | Timing path — would expose receipt-stamp if it existed; still useful as soak of send-anchored authority under slow R2 |

Env / harness hooks TBD (renew-only, not all S3). Do not raise `CELLD_TTL_MS` to hide the race.

## Sequencing

| Step | Status |
| ---- | ------ |
| Code check optimistic Ambiguous | **Done** — not product |
| Code check receipt-stamp `last_ok` | **Done** — stamped at send; not product |
| Speculative renew-belief fix before v4 | **Not required** from these CEs |
| Mac mini authorizing 1000-cycle soak | **Unblocked** |
| v4 N=1000 | After soak; still report **mechanism unexplained** |
| Forced renew-latency arms A+B | Next chase for the open mechanism |

See [`MAC_MINI_AGENT.md`](./MAC_MINI_AGENT.md).
