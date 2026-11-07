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
| Correctness (published) | **FAIL** — **2** × `lost_midflight_intent` (`i=1`, `i=5`, `after_intent_before_call`) — fail file kept as-is |
| Correctness (reclassify) | Side-by-side: **i=1 → `injection_missed` (`basis: journal_surrogate`, `effect_ledger: unavailable` — not verified settle)**; **i=5 → `incomplete_no_pause` (unsettled)** — [`ttl3s-full-board-reclassify.json`](./ttl3s-full-board-reclassify.json) |
| Availability | **5**/100 (rate 0.05) — pass at ceiling |
| Regime | Resume tail up to **~62s**; truncated logs with **`outcome="ambiguous"`** renewals |
| Evidence | [`phased-n100-wedge-lab-enriched-ttl3s-failed.json`](./phased-n100-wedge-lab-enriched-ttl3s-failed.json) |
| Mechanism | **open** for any remaining loss; trial 1 is an injection miss, not a proven durability failure |

## What later boards showed (not root cause)

| Arm | Result | Role |
| --- | ------ | ---- |
| TTL=10s N=100 | 0 lost | Diagnostic — longer TTL can hide loss |
| Quiet TTL=3s remasure | 0 lost; resume p99≈6.9s; **7** ambiguous renews | Intermittency — **does not** clear 2/100 |
| Stock same-host TTL=3s | 0 lost under quiet R2 | Not pressure-matched to the failing regime |
| SIGSTOP e2e pre/post expiry≠dead | Pre: eager recovery while `T`, intent **kept**; post: skip abandon | Expiry-as-dead **ruled out** as sufficient cause |
| Frozen **N=300** TTL=3s fixed build | **0**/300 lost; avail ≈1.3%; resume p99≈7.9s | Rate bound only — **did not** re-enter the 5-avail / ~62s resume regime |

## Pre-latency checks ([`TTL3S_THREE_CHECKS.md`](./TTL3S_THREE_CHECKS.md))

| Check | Result |
| ----- | ------ |
| R2 settle i=1,5 | **i=1 injection miss** (completed, no durable pause; journal 0/1/2 write ok). **i=5 unsettled**. Pets ledger + twin digest unavailable (overwrite) |
| Full-board reclassify | All 100 rows old/new side-by-side — [`ttl3s-full-board-reclassify.json`](./ttl3s-full-board-reclassify.json). Published fail file **not** rewritten |
| Host / pause | Cloud Agent VM; trial 1 completed normally (pause clock does not explain it); trial 5 still candidate |
| Classifier | Timeout → `midflight_storage_unknown`; completed-without-pause → **`injection_missed`** |
| Evidence path | Unique TTL+UTC default; refuse overwrite unless `FLEET_PHASED_ALLOW_OVERWRITE=1` (escape hatch **recorded** in evidence when set) |
| Effect ledger | Per-trial `__writes` + twin digest persisted under `<evidence>-trials/` — **v4 precondition** |
| BOOTTIME | Lease `mono_ms` on Linux **CLOCK_BOOTTIME** — **hardening**, not claimed as the 2/100 fix |

Lease-belief Ambiguous/receipt paths remain ruled out ([`AMBIGUOUS_RENEWAL.md`](./AMBIGUOUS_RENEWAL.md)).

Chase remaining:

1. **Force arm A** — Ambiguous/timeout renew response
2. **Force arm B** — late Applied renew response
3. Dig trial 5 unsettled shape if it reappears under unique evidence paths

## Expiry ≠ dead (landed; separate)

Still correct and shipped: expiry permits **fenced** takeover; open-log abandon needs process evidence. See [`EXPIRY_NOT_DEAD.md`](./EXPIRY_NOT_DEAD.md). E2e proved the sweep differential; it did **not** reproduce program intent loss.

## Next

1. **Mac mini soak + v4 N=1000 landed** ([`mac-mini-v4-binary-authorization.json`](./mac-mini-v4-binary-authorization.json)): correctness 0; during_call `callVerifiedSent` 251/251 with durable intent visible; missing-data + phase-validity pass. Authorization is **conditional** (v4 omitted `celldLabGitCommit`/`celldSha256`; soak label was harness-stale). Remesure identity on the same binary to fully authorize.
2. **Do not close** TTL3s published **2/100** (mechanism unexplained), trial 1 journal_surrogate, or trial 5 unsettled — keep them beside any restored claim.
3. Forced renew-latency board in parallel — **both** Ambiguous/timeout and late-Applied arms.
4. After full authorization: short upstream supersede offer (tests, not a large patch); Golem/Pi peer package can cite the scoped lab claim.
