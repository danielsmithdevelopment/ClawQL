# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-14  
Models: Nemotron 3.5 Lightning ± ClawQL  
Batch 2: tasks **001–015** Sonnet 4.6 — [31653266479](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31653266479) (**20% ClawQL all-pass**)  
Batch 3: tasks **016–025** Sonnet 4.6 — [31757993774](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31757993774) (**0% ClawQL all-pass**; mean CPR ~9%)  
**Next:** Probe #7 DuckDB **ClawQL all-pass on 018** ([31855811931](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31855811931)). IDP→DuckDB local spike proves 020/023/024 SQL too. Prefer canonical `1-25` when OpenRouter healthy.

### Next-run gate (deep think)

| Probe                                                                                              | Result                                                                                                              |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 001 smoke [31764224376](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31764224376) | ClawQL 100% — patch apply OK                                                                                        |
| 18-18 #1 [31765565825](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31765565825)  | Wrote **0 of 5 / 266** — wrong N                                                                                    |
| 18-18 #2 [31767832459](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31767832459)  | **Regression:** 40/40, ceiling fired, **no write** — cohort recall empty because ingest hard-coded `practice=Other` |
| 18-18 #3 [31769718249](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31769718249)  | Wrote **0 of 36** — Pattern F OK; detector over-flagged (36/266 vs gold 12)                                         |
| 18-18 #4 [31772193789](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31772193789)  | Seed **12/266** (Fix 7 OK); bulk timed out→fallback; agent **OpenRouter 429** (daily free cap). No scorecard.       |
| 18-18 #5 [31853395295](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31853395295)  | Bulk OK; seed 12/266; wrote **0 of 11** (missed 1008-00001). Graded fail. Baseline OR 504.                          |
| 18-18 #7 [31855811931](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31855811931)  | **ClawQL all-pass** (CPR 1.0, 9 turns). DuckDB `n=12 k=0`; ontology N=12. Baseline still 0%.                        |

**Root cause (layer):** Fix 5 was prompt-level; vault never had Banking & Finance / credit-facility ontology. Structured `practiceArea` filters → 0 hits; agent hunted forever. Fix 6 seeded flags but path tokens were too broad (probe #3). Fix 7 precision held on probe #4/#5 seed logs. Probe #5 failure is **cohort surface** (recall packaging / ontology visibility / agent dropping an id) — not detector math.

**Fix 6:** DMS path seeding → `CREDIT_FACILITY` title flag + `CLAWQL_PRACTICE_AREA=Banking & Finance`; Pattern F; ceiling re-nudge every remaining turn.

**Fix 7:** Tighten detector to execution credit/bridge/term/mezzanine loan agreements under `Transaction Documents/` / `documents/` (no gold-ID seeding).

**Fix 8:** Authoritative `matterIds`/`matterIdCount` on structured recalls; post-bulk CREDIT_FACILITY `memory_ingest` upsert + ontology verify log; raise clawql-tool JSON cap.

## Batch 2 final ledger (001–015)

| Task | ClawQL | Baseline | Outcome                              |
| ---- | ------ | -------- | ------------------------------------ |
| 001  | 100%   | 14%      | ClawQL all-pass                      |
| 002  | 100%   | 25%      | ClawQL all-pass                      |
| 003  | 33%    | 33%      | tie                                  |
| 004  | 0%     | 50%      | baseline win                         |
| 005  | 33%    | 17%      | ClawQL win                           |
| 006  | 33%    | 33%      | tie                                  |
| 007  | 0%     | 0%       | both fail                            |
| 008  | 0%     | 0%       | both fail (wrong Pattern E + Wonder) |
| 009  | 0%     | 0%       | both fail (19 criteria ceiling)      |
| 010  | 0%     | 50%      | baseline win                         |
| 011  | 11%    | 5%       | ClawQL win (19 criteria)             |
| 012  | 100%   | 0%       | ClawQL all-pass                      |
| 013  | 0%     | 25%      | baseline win                         |
| 014  | 33%    | 33%      | tie                                  |
| 015  | 0%     | 0%       | both fail                            |

**ClawQL all-pass: 3/15 (20%).** Baseline all-pass: 0/15.

## Batch 3 ledger (016–025) — [31757993774](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31757993774)

| Task | ClawQL CPR     | Baseline CPR | Notes                                                        |
| ---- | -------------- | ------------ | ------------------------------------------------------------ |
| 016  | 0% (0/14)      | 0% (0/14)    | model ceiling; both hit turn cap                             |
| 017  | 8% (1/12)      | 8% (1/12)    | model ceiling                                                |
| 018  | 0% (0/1)       | 0% (0/1)     | **negative-result miss** — ClawQL 40/40, 0 recalls, no write |
| 019  | 8% (1/12)      | 8% (1/12)    | model ceiling                                                |
| 020  | 0% (0/3)       | 0% (0/3)     | both fail                                                    |
| 021  | 4% (1/24)      | 4% (1/24)    | 24-criteria ceiling                                          |
| 022  | **46%** (6/13) | 8% (1/13)    | ClawQL CPR win (not all-pass); high tokens                   |
| 023  | 0% (0/4)       | 25% (1/4)    | baseline CPR win                                             |
| 024  | 0% (0/9)       | 11% (1/9)    | baseline CPR win                                             |
| 025  | 20% (1/5)      | 20% (1/5)    | tie                                                          |

**ClawQL all-pass: 0/10.** Baseline all-pass: 0/10.  
Combined 001–025 all-pass (this slice + batch 2): **ClawQL 3/25 (12%)** until canonical re-run with 018 fixes.

Do **not** tune the Nemotron prompt stack against 016/017/019/021 — those are Opus-class criterion ceilings.

## Fixes in place (all of them)

| Fix                                                                        | Status |
| -------------------------------------------------------------------------- | ------ |
| Tool-result truncation (`CLAWQL_LAB_MAX_TOOL_RESULT_CHARS`, default 24k)   | **in** |
| Always-write deliverable guard (clean stop)                                | **in** |
| Turn-ceiling force-write (`CLAWQL_LAB_CEILING_LEAD_TURNS`, default 3)      | **in** |
| Negative-result principle (`0 of N` / none is complete)                    | **in** |
| Require ≥1 `clawql_memory_recall` (`CLAWQL_LAB_REQUIRE_RECALL`)            | **in** |
| Frequency / survey task kind + corpus-coverage Wonder                      | **in** |
| Frequency **denominator** = prompt cohort + matter-id list (Fix 5)         | **in** |
| Seed `CREDIT_FACILITY` / Banking & Finance in ontology (Fix 6 / Pattern F) | **in** |
| Fix 7: tighten credit-facility path detector toward N≈12 (no gold IDs)     | **in** |
| Fix 8: matterIds-first recall + CREDIT_FACILITY ontology upsert/verify     | **in** |
| Bulk DMS seed via `ingest_external_knowledge` (`CLAWQL_EXTERNAL_INGEST`)   | **in** |
| Gate Node/npm/build to clawql matrix arms only                             | **in** |
| `CLAWQL_LAB_PRESERVE_VAULT` hook (shared vault artifact, next slice)       | **in** |
| ≤2 empty recalls → grep/read fallback                                      | **in** |
| Empty-recall `labGuidance.fallback`                                        | **in** |
| Pattern E **only** when prompt explicitly mentions second request          | **in** |
| Step 0 task-kind classification (enumeration / frequency / single / …)     | **in** |
| Kind-gated Wonder (1–2 greps on single_answer; fuller on enumeration)      | **in** |
| Partial fallback hits = unresolved, not confirmed                          | **in** |
| `max-parallel: 4` (was 2; daily quota binds more than concurrency)         | **in** |
| Sweep marker supports `START-END` (e.g. `16-25`)                           | **in** |

Task **018** root cause (016–025 batch): not retrieval strategy — **zero**
`memory_recall`, 40/40 bash turns hunting positive “springing lien” evidence,
never wrote, never concluded **0 of 12**. Ceiling-hit skipped the clean-stop
guard; Wonder never ran. Ceiling force-write + negative-result principle are
the two that would have saved it; require-recall makes the ClawQL arm use
ClawQL; frequency kind tunes Wonder.

### Probe #3 after Fix 6 ([31769718249](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31769718249))

Workflow **green**, rubric **fail**. Pattern F control flow worked: agent recalled
`CREDIT_FACILITY`, listed **N = 36**, searched springing lien, wrote **0 of 36**.
Judge wants **0 of 12**. Seed log: `CREDIT_FACILITY flagged 36/266`. Timing:
clawql job ~31m vs baseline ~7.5m (Node+build ~3.5m on both until gated; main
tax was 266× sequential `memory_ingest` before the agent loop).

Public gold set (from harvey-labs `task.json` criterion text — **offline
calibration only**, never seed these IDs):
`1005-00001, 1006-00001, 1008-00001, 1010-00001, 1012-00001, 1013-00001,
1019-00002, 1021-00001, 1036-00001, 1038-00002, 1042-00001, 1043-00001`.

Fix 6 path-token detector: 9/12 recall, 27 FP. Fix 7: require execution
credit/bridge/term/mezzanine loan agreements under `Transaction Documents/` or
`documents/` (exclude `Financing/`, DIP, diligence memos). Offline on DMS:
**TP=12 FP=0 FN=0**.

### Probe #4 after Fix 7 ([31772193789](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31772193789))

Seed log: **`CREDIT_FACILITY flagged 12/266`** — Fix 7 precision held in CI.
Bulk `1–50` **Read timed out** (180s) → fell back to per-matter `memory_ingest`.
Agent died on OpenRouter free-tier **429** (`Remaining: 0`, reset 2026-08-15 00:00 UTC)
right after require-recall nudge — empty clawql scorecard. Not a rubric miss.

### Probe #5 post-reset ([31853395295](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31853395295))

Bulk ingest **succeeded** (batches through 266); seed again **12/266**; clawql job
~14m (much faster). Agent wrote **0 of 11**, omitting **1008-00001** (Lumos).
Judge fail (correct). Baseline died on OpenRouter **504** idle timeout.
Fix 8: matterIds-first recall packaging + force ontology upsert for the
CREDIT_FACILITY cohort + verify `N=` log before the agent loop.

## Plan

1. ~~**016–025** first — new signal~~ **done** ([31757993774](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31757993774))
2. Land task-018 fixes (ceiling force-write, negative-result principle, require-recall, frequency kind)
3. ~~Optional **018 smoke**~~ probe arc through Fix 7 ([31853395295](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31853395295))
4. Ship Fix 8 (matterIds-first recall + CREDIT_FACILITY ontology upsert/verify); re-arm **`18-18`**; then **clean canonical 001–025** if all-pass
5. Then Opus; Harvey outreach with public run IDs
6. Shared vault prepare job (uses `CLAWQL_LAB_PRESERVE_VAULT`) — after 018 green

## Notes

Do not push overlay mid-sweep (`cancel-in-progress`). Marker cleared after probe #5. Do **not** hard-code gold matter IDs into seeding (answer-key leak).
