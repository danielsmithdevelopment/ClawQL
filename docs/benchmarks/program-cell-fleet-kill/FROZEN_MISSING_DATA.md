# Frozen missing-data rules (v4)

**Frozen before Mac mini soak / any v4 board.** Do not loosen after results. Recorded on every `correctness_availability_v2` evidence file under `frozenCriteria.missingData` and scored in `gates.missingData`.

| Rule | Pass iff | Failure surface |
| ---- | -------- | --------------- |
| **1. Effect ledger required** | Every write-kill and await trial has a persisted `effect-ledger.json` (`effectLedgerPersisted=true`) | Missing trial → board `ok=false`; `gates.missingData.missingLedgerFailures` |
| **2. Twin `captured:false` ceiling** | Among **outer twin-eligible** trials (`before_intent` / `after_call_before_journal` + `completedClean`), rate of `captured:false` (or `twin_capture_failed`) ≤ **`0.02`** (`FLEET_PHASED_TWIN_CAPTURE_FAIL_CEILING`) | Mid-flight `captured:false` is **expected** and **excluded** from the denominator |
| **3. Overwrite invalidates** | `FLEET_PHASED_ALLOW_OVERWRITE` was **not** set and no existing evidence file was replaced | Else `status=invalidated_overwrite`, `ok=false`, `evidenceOverwrite.invalidatesArtifact=true` |

Settle failures against the **persisted mock-pets ledger + twin digest**, never against the ProgramCell journal alone. Historical TTL3s trial 1 (`basis: journal_surrogate`, `effect_ledger: unavailable`) is explicitly not a verified settle.

## Evidence fields

- `frozenCriteria.missingData` — the constants above
- `gates.missingData.pass` — scored result
- `effectLedgerPersisted` / `effectGroundTruthSample` / `<evidence>-trials/index.json`

## Related

- [`TTL3S_THREE_CHECKS.md`](./TTL3S_THREE_CHECKS.md)
- [`SOAK_GATES.md`](./SOAK_GATES.md) · [`MAC_MINI_AGENT.md`](./MAC_MINI_AGENT.md)
- Durability STATUS v2/v4 criteria — [`../durability-proof/STATUS.md`](../durability-proof/STATUS.md)
