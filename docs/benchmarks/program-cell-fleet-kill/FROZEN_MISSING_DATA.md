# Frozen missing-data + phase-validity rules (v4)

**Frozen before Mac mini soak / any v4 board.** Do not loosen after results. Recorded on every `correctness_availability_v2` evidence file under `frozenCriteria.missingData` / `frozenCriteria.phaseValidity` and scored in `gates.missingData` / `gates.phaseValidity`.

## Missing data

| Rule | Pass iff | Failure surface |
| ---- | -------- | --------------- |
| **1. Effect ledger required** | Every write-kill and await trial has a persisted `effect-ledger.json` (`effectLedgerPersisted=true`) | Missing trial → board `ok=false`; `gates.missingData.missingLedgerFailures` |
| **2. Twin `captured:false` ceiling** | Among **outer twin-eligible** trials (`before_intent` / `after_call_before_journal` + `completedClean`), rate of `captured:false` (or `twin_capture_failed`) ≤ **`0.02`** (`FLEET_PHASED_TWIN_CAPTURE_FAIL_CEILING`) | Mid-flight `captured:false` is **expected** and **excluded** from the denominator |
| **3. Overwrite invalidates** | `FLEET_PHASED_ALLOW_OVERWRITE` was **not** set and no existing evidence file was replaced | Else `status=invalidated_overwrite`, `ok=false`, `evidenceOverwrite.invalidatesArtifact=true` |

Settle failures against the **persisted mock-pets ledger + twin digest**, never against the ProgramCell journal alone. Historical TTL3s trial 1 (`basis: journal_surrogate`, `effect_ledger: unavailable`) is explicitly not a verified settle.

## Phase validity (`during_call`)

| Rule | Pass iff | Failure surface |
| ---- | -------- | --------------- |
| **4. Some calls verified sent** | If the board includes `during_call` trials, **≥1** has `callVerifiedSent` (mock-pets `inFlight>0` before kill) | Else `status=invalid_phase_targeting`, `ok=false` — injector never mid-call; same invalidity class as trial-1 injection miss, board-wide |
| **Report** | `midFlightEffectDistribution` per mid-flight phase: `effects0` / `effects1` / `effects2plus` + `callVerifiedSent` | Always reported; zero effects with call sent is a valid mid-flight kill |

Tiny smokes may still show all-zero effects; v4 with ~250 `during_call` trials must not show **zero** `callVerifiedSent` — that would mean the phase is mislabeled.

## Mid-flight correctness (unchanged intent, now explicit)

| Rule | Failure reason |
| ---- | -------------- |
| At most one effect (**never two**) | `midflight_effect_gt_one` |
| Every in-flight trial is `outcome_unknown` | `midflight_not_outcome_unknown` |

## Evidence fields

- `frozenCriteria.missingData` / `frozenCriteria.phaseValidity`
- `gates.missingData.pass` / `gates.phaseValidity.pass`
- `midFlightEffectDistribution` (top-level + under `gates.phaseValidity`)
- `effectLedgerPersisted` / `effectGroundTruthSample` / `<evidence>-trials/index.json`

## Related

- [`TTL3S_THREE_CHECKS.md`](./TTL3S_THREE_CHECKS.md)
- [`SOAK_GATES.md`](./SOAK_GATES.md) · [`MAC_MINI_AGENT.md`](./MAC_MINI_AGENT.md)
- Durability STATUS — [`../durability-proof/STATUS.md`](../durability-proof/STATUS.md)
