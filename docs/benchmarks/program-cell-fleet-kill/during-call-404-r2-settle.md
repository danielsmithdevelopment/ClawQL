# during_call 404 ×5 — read-only R2/DO settle (v2 prefix)

**Prefix:** `s3://clawql-streams-state/tier-c-phased-20261030212001`  
**Cell:** `ProgramCellDO:8b3f8c259c1b2bf1aed4a4270920817997c5d8f760e4dc8e59f3f428e2c89b4f`  
**Method:** read-only copies of live `_cf_KV` SQLite + scan of 1879 local generation DBs; live `GET /program/status` for present IDs. No writes to the prefix.

## Expected vs present (current run)

Among completed `during_call` trials (`i % 4 === 2`), live KV holds meta for **146/150**. The **only** gaps are the five 404 failures' indices — except **494**, which is present as create-only meta.

| Trial | Current-run keys in live KV / in-window local gens                               | Intent journaled?                                     | Live `/program/status`                                                    |
| ----- | -------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| 134   | **MISSING** (never in any local gen in neighbor window; e130–e144 never had 134) | no                                                    | N/A (no programId retained; neighbors 130+138 present)                    |
| 286   | **MISSING** in current-run window (prior-run ts `…057485` only)                  | no                                                    | N/A                                                                       |
| 390   | **MISSING** in current-run window (prior-run ts only)                            | no                                                    | N/A                                                                       |
| 442   | **MISSING** in current-run window (prior-run ts only)                            | no                                                    | N/A                                                                       |
| 494   | **PRESENT** `phased_during_call_494_1793409345554:meta` only                     | **never** (0 intent keys across all gens for this ts) | `ok:true`, `status:running`, `pauseKind` absent, `intents:[], entries:[]` |

Neighbor successful `during_call` programs (e.g. 130, 490) retain `pauseKind=during_call` and post-resume entries — the shape expected after journal-before-hang.

## Verdict

- **134, 286, 390, 442:** journaled intent **and** meta for this run are **absent** from R2-backed DO storage. Not a visibility-timeout 404 — durable state was never present (or was lost before any generation snapshot). → **durability / correctness** (not availability-only).
- **494:** create meta survived; the `during_call` intent + `pauseKind` meta update **never** became durable. Resume-time 404 can still be availability/visibility, but the mid-flight journal contract was not met in storage. → **durability / correctness** for intent; do **not** publish correctness=0 on the strength of “404 alone.”

Prior-run keys for indices 286/390/442/494 (different `Date.now()` suffixes, full meta+intent+entries) exist in older local gens and are **out of** the current-run timestamp windows — ignored for this settle.

## Harness follow-up (unchanged)

Retry mid-flight 404 until wall deadline; retain `programId`; later `/status` check. That remains the right permanent harness fix either way.
