# Ambiguous lease renewal (open mechanism lead)

**Status:** open lead for the TTL=3s wedged **2 × `lost_midflight_intent`**. Not resolved by expiry≠dead, quiet remasures, or N=300 zeros.

**Code check (2026-11-05):** TLC weak counterexample is a **candidate only**. Product renew-on-timeout is **not** the optimistic-belief path the weak model uses → **CE does not apply as a product root-cause**. Mechanism stays **unexplained**. No pessimistic-belief + fence fix from this CE alone before v4.

## What N=300 did and did not show

| Claim | Status |
| ----- | ------ |
| Loss is rare on the fixed build at TTL=3s | **Supported** — 0/300 lost → ~1% rule-of-three UB |
| Cause of the original 2/100 is gone | **Not supported** |
| Expiry-as-dead caused the 2/100 | **Ruled out** as sufficient — e2e pre-fix eager-recovered while owner was `T` and ProgramCell intent **survived** ([`EXPIRY_NOT_DEAD.md`](./EXPIRY_NOT_DEAD.md)) |
| Optimistic belief after Ambiguous renew caused the 2/100 | **Ruled out as product match** — see code check below |

Publish the 2/100 as **mechanism unexplained**. See [`WEDGE_TTL3S_CORRECTNESS.md`](./WEDGE_TTL3S_CORRECTNESS.md).

## Regime mismatch

Neither remasures nor N=300 (avail failures ≈1.3%, quieter resumes) reproduced the **pressure regime** of the failing board:

| Signal | Failing TTL3s N=100 | Later quiet / N=300 |
| ------ | ------------------- | ------------------- |
| Correctness | **2** lost mid-flight | 0 |
| Availability failures | **5**/100 | N=300 ≈4/308 (~1.3%) |
| Resume tail | up to **~62s** (board window) | N=300 resume p99≈7.9s / max≈13.9s |
| Ambiguous renewals (`outcome="ambiguous"`) | present in truncated / pressure logs | sparse or absent under quiet R2 |

Likeliest remaining *regime* suspect is still pressure around renew / R2 latency — but **not** via optimistic expiry bump after Ambiguous.

Celld already treats store write failures as ambiguous unless proven not committed (`ownership_store.rs` `LeaseCasError::Ambiguous`; actor logs `outcome="ambiguous"`).

## Code check vs TLC weak counterexample

### What TLC weak shows (model only)

`WeakIgnoreAmbiguousDivergence = TRUE` counterexample (depth 7):

| State | Action | Meaning |
| ----- | ------ | ------- |
| 4 | `StartRenew` | renew in flight |
| 5 | `RenewAmbiguous` | **bumps** `ownerBeliefExpiresAt` 2→4 while `storageExpiresAt` stays 2 |
| 6 | `StartWrite` | mid-flight write under optimistic belief (`belief > storage`) |
| 7 | `SurvivorTakeover` | **unfenced step** — drops non-durable mid-flight intent |

Optimistic belief alone only costs availability if every write/ack/recovery path is epoch-fenced. Intent loss in this trace requires the takeover step to succeed against an owner that still believes it holds — i.e. belief diverged above storage.

Target config (`FALSE`) still **PASS**es: no optimistic bump; fence on divergence. Runner: `scripts/formal/run-lease-renew-ambiguous-tlc.sh`.

### What celld actually does on Ambiguous / renew timeout

| Site | Behavior |
| ---- | -------- |
| `actor/effects.rs` renew timeout | maps to `Failure::Ambiguous` (half remaining authority bound) |
| `node_lease_cas_completed` + `Err(Ambiguous)` | sets `readback_only = true`, enters `NodeAuthority::Reading`, emits `ReadSelfNodeLease` — **does not** advance `last_ok_mono_ms` / held expiry |
| `complete_node_lease_write` / `hold_node_lease` | only path that installs fresh Held + `last_ok_mono_ms = anchor` after **Applied** (or zombie adoption after readback proves storage extended) |
| `node_authoritative()` while `Reading`/`Writing` | true iff **prior** `last_ok_mono_ms` is still within TTL — last **confirmed** apply, not the in-flight renew |

So:

1. **Optimistic belief bump?** **No.** Ambiguous → readback; belief stays on last Applied until readback reconciles.
2. **Stop sending until re-read?** **No** — outputs continue while prior confirmed authority is fresh (`output_gate` / `node_authoritative`). That is *not* the weak CE (which needs belief **above** storage). Prior confirmed authority tracks the last storage-applied expiry under normal clocks.
3. **Unfenced product step matching State 7?** Not via this renew path: without belief > storage, the CE’s write-past-expiry + drop does not form. Takeover fencing is the expiry≠dead / epoch story, already separate.

**Verdict:** CE is a valid warning about a class of bugs; **celld’s renew path does not implement that class**. Do **not** land a “pessimistic belief + hold outputs on Ambiguous” fix from this CE alone. Mechanism for the 2/100 stays **open**.

## Chase (parallel with Mac mini soak)

### 1. Model it (TLA) — done for optimistic-bump class

`formal/tla/lease/LeaseRenewAmbiguous` — weak CE + product code check documented here. Keep the weak model as a regression tooth for any future renew path that would bump belief on Ambiguous.

### 2. Force it (lab / board) — still useful

Inject latency or timeouts on **R2 node-lease renew** calls only (not all S3), so `outcome="ambiguous"` happens at scale under wedged TTL=3s. That exercises the **real** Ambiguous→readback→continue-on-prior path and any *other* unfenced step under pressure — not the ruled-out optimistic bump. Env / harness hooks TBD.

## Sequencing

| Step | Status |
| ---- | ------ |
| Code check renew-on-timeout vs weak CE | **Done** — not optimistic; CE does not apply |
| Fix pessimistic+fence from this CE before v4 | **Not required** (would be speculative) |
| Mac mini authorizing 1000-cycle soak | **Unblocked** — does not depend on this CE |
| v4 N=1000 | May run after soak; must still report **mechanism unexplained** |
| Forced renew-latency board | Next chase for the open mechanism |

See [`MAC_MINI_AGENT.md`](./MAC_MINI_AGENT.md).
