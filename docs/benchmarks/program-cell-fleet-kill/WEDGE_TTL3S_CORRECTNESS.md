# Wedged N=100 — TTL 3s correctness failure (mechanism unexplained)

**Status:** Original **2 × `lost_midflight_intent`** remains **mechanism unexplained**. N=300 on the fixed build shows the loss is **rare** (~1% rule-of-three UB), not that its cause is gone. Expiry≠dead was a real fix and is **not** the proven cause of the 2/100 (e2e).

## Frozen rule (do not loosen)

Correctness must be **0** under every condition you test. TTL may only affect **availability**. Lost mid-flight intents are correctness failures **whatever the TTL**. Moving the board to the TTL that passes is loosening.

## Headline (lab enriched — publish as unexplained)

| Field | Value |
| ----- | ----- |
| Binary | lab enriched `lab_enriched_10c9eae89` |
| Board | wedged N=100 · `correctness_availability_v2` · fenceMode `lab_enriched_wedged` |
| `CELLD_TTL_MS` | **3000** |
| Correctness | **FAIL** — **2** × `lost_midflight_intent` (`i=1`, `i=5`, `after_intent_before_call`) |
| Availability | **5**/100 (rate 0.05) — pass at ceiling |
| Regime | Resume tail up to **~62s**; truncated logs with **`outcome="ambiguous"`** renewals |
| Evidence | [`phased-n100-wedge-lab-enriched-ttl3s-failed.json`](./phased-n100-wedge-lab-enriched-ttl3s-failed.json) |
| Mechanism | **unexplained** — do not mark resolved |

## What later boards showed (not root cause)

| Arm | Result | Role |
| --- | ------ | ---- |
| TTL=10s N=100 | 0 lost | Diagnostic — longer TTL can hide loss |
| Quiet TTL=3s remasure | 0 lost; resume p99≈6.9s; **7** ambiguous renews | Intermittency — **does not** clear 2/100 |
| Stock same-host TTL=3s | 0 lost under quiet R2 | Not pressure-matched to the failing regime |
| SIGSTOP e2e pre/post expiry≠dead | Pre: eager recovery while `T`, intent **kept**; post: skip abandon | Expiry-as-dead **ruled out** as sufficient cause |
| Frozen **N=300** TTL=3s fixed build | **0**/300 lost; avail ≈1.3%; resume p99≈7.9s | Rate bound only — **did not** re-enter the 5-avail / ~62s resume regime |

## Likeliest open lead: ambiguous / slow renewal (narrowed)

Two TLC weak classes produce belief > storage and intent loss — both **ruled out as product matches**:

1. Optimistic belief bump after Ambiguous — product readbacks; no bump
2. Authority stamped at Applied **receipt** (RTT stretch) — product stamps `last_ok_mono_ms` at renew **send** (`anchor_mono_ms`)

See [`AMBIGUOUS_RENEWAL.md`](./AMBIGUOUS_RENEWAL.md). Mechanism stays **unexplained**.

Chase remaining:

1. **Force arm A** — timeout/drop renew **response** → Ambiguous→readback under wedged TTL=3s
2. **Force arm B** — delay Applied **response** of a storage-successful renew (late success / timing path)
3. Hunt any **other** unfenced append/ack/recovery step under that pressure

## Expiry ≠ dead (landed; separate)

Still correct and shipped: expiry permits **fenced** takeover; open-log abandon needs process evidence. See [`EXPIRY_NOT_DEAD.md`](./EXPIRY_NOT_DEAD.md). E2e proved the sweep differential; it did **not** reproduce program intent loss.

## Next

1. **Authorizing 1000-cycle soak on Mac mini** with the fixed build → `measured_v4_ready` ([`MAC_MINI_AGENT.md`](./MAC_MINI_AGENT.md)). Settles the post-fix soak self-fence question (void only if the monitor voids). Unblocked by the renew code check (no optimistic-bump fix required first).
2. **v4 N=1000** there with append logs + R2 intent check — report **mechanism unexplained** alongside the result (do not claim the 2/100 closed).
3. Forced renew-latency board in parallel — **both** Ambiguous/timeout and late-Applied arms.
