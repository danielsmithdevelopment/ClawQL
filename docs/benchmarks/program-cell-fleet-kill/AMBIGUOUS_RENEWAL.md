# Ambiguous lease renewal (open mechanism lead)

**Status:** open lead for the TTL=3s wedged **2 × `lost_midflight_intent`**. Not resolved by expiry≠dead, quiet remasures, or N=300 zeros.

## What N=300 did and did not show

| Claim | Status |
| ----- | ------ |
| Loss is rare on the fixed build at TTL=3s | **Supported** — 0/300 lost → ~1% rule-of-three UB |
| Cause of the original 2/100 is gone | **Not supported** |
| Expiry-as-dead caused the 2/100 | **Ruled out** as sufficient — e2e pre-fix eager-recovered while owner was `T` and ProgramCell intent **survived** ([`EXPIRY_NOT_DEAD.md`](./EXPIRY_NOT_DEAD.md)) |

Publish the 2/100 as **mechanism unexplained**. See [`WEDGE_TTL3S_CORRECTNESS.md`](./WEDGE_TTL3S_CORRECTNESS.md).

## Regime mismatch

Neither remasures nor N=300 (avail failures ≈1.3%, quieter resumes) reproduced the **pressure regime** of the failing board:

| Signal | Failing TTL3s N=100 | Later quiet / N=300 |
| ------ | ------------------- | ------------------- |
| Correctness | **2** lost mid-flight | 0 |
| Availability failures | **5**/100 | N=300 ≈4/308 (~1.3%) |
| Resume tail | up to **~62s** (board window) | N=300 resume p99≈7.9s / max≈13.9s |
| Ambiguous renewals (`outcome="ambiguous"`) | present in truncated / pressure logs | sparse or absent under quiet R2 |

Likeliest remaining suspect: **ambiguous renewal** — a renew CAS reaches R2 (or may have), the client times out / gets `Ambiguous`, and the owner's belief about holding the lease diverges from storage truth.

Celld already treats store write failures as ambiguous unless proven not committed (`ownership_store.rs` `LeaseCasError::Ambiguous`; actor logs `outcome="ambiguous"`).

## Chase (parallel with Mac mini soak / v4)

### 1. Model it (TLA)

`formal/tla/lease/LeaseRenewAmbiguous` — renew in flight may resolve Applied / Rejected / **Ambiguous** (storage may or may not have extended). Safety: owner must not keep a mid-flight write authoritative once storage expiry allows survivor takeover under belief divergence.

```bash
scripts/formal/run-lease-renew-ambiguous-tlc.sh
```

If TLC finds a counterexample under the current product rules, that is faster than any board.

### 2. Force it (lab / board)

Inject latency or timeouts on **R2 node-lease renew** calls only (not all S3), so `outcome="ambiguous"` happens at scale. Pair with wedged TTL=3s board + append logs; require ambiguous count and trial-tied forensics before claiming root cause.

Env / harness hooks TBD on the Mac mini / lab path — do not raise `CELLD_TTL_MS` to hide the race.

## Next authorizing step (independent)

Run the **1000-cycle** soak on the **Mac mini** (Colima Linux) with the fixed build → `measured_v4_ready`, then v4 N=1000 there with append logs + R2 intent check. Report this open mechanism **alongside** v4 either way. See [`MAC_MINI_AGENT.md`](./MAC_MINI_AGENT.md).
