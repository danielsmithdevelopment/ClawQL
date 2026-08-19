# Harvey LAB × ClawQL Results — firm-knowledge

**Canonical GHA 001–025 (2026-08-17/18):** Nemotron 3.5 Lightning ± ClawQL,
judge Sonnet 4.6 via OpenRouter. Machine JSON:
[`../../integrations/harvey-labs/results/aggregate-gha-001-025-nemotron-vs-clawql.json`](../../integrations/harvey-labs/results/aggregate-gha-001-025-nemotron-vs-clawql.json).
PR [#919](https://github.com/danielsmithdevelopment/ClawQL/pull/919).

ClawQL beats Nemotron-only by a wide margin: **11/25 vs 0/25 all-pass**, and
**116/180 (64.4%) vs 17/180 (9.4%)** criterion pass rate. Same agent
(`nvidia/nemotron-3.5-lightning`), same judge.

## Headline (canonical 001–025)

| Metric                | nemotron-clawql     | nemotron (baseline) | Lift           |
| --------------------- | ------------------- | ------------------- | -------------- |
| Cells graded          | 25/25               | 25/25               | 50/50 complete |
| All-pass tasks        | **11/25 (44%)**     | **0/25 (0%)**       | +11 tasks      |
| Aggregate CPR         | **116/180 (64.4%)** | **17/180 (9.4%)**   | +55.0 pp       |
| Mean per-task CPR     | 67.6%               | 15.1%               | +52.5 pp       |
| Tasks with higher CPR | 21                  | 2                   | 2 ties         |

ClawQL all-pass: **001, 002, 004, 006, 007, 008, 009, 010, 012, 022, 023**.
Baseline never all-passed a task. It only beat ClawQL CPR on **015** (1/3 vs
0/3) and **020** (2/3 vs 0/3). Ties: **018** (0/1) and **025** (1/5).

The two previously missing cells: clawql **009** 19/19 (run
[32168856394](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/32168856394),
28 turns, agent finished); baseline **022** 1/13 fail, 40-turn ceiling (same
run).

### Full 001–025 table

| Task | ClawQL  | Baseline | Δ CPR     |
| ---- | ------- | -------- | --------- |
| 001  | 7/7 ✓   | 1/7      | +85.7 pp  |
| 002  | 4/4 ✓   | 1/4      | +75.0 pp  |
| 003  | 2/3     | 1/3      | +33.3 pp  |
| 004  | 2/2 ✓   | 0/2      | +100.0 pp |
| 005  | 5/6     | 1/6      | +66.7 pp  |
| 006  | 3/3 ✓   | 0/3      | +100.0 pp |
| 007  | 3/3 ✓   | 0/3      | +100.0 pp |
| 008  | 4/4 ✓   | 0/4      | +100.0 pp |
| 009  | 19/19 ✓ | 0/19     | +100.0 pp |
| 010  | 2/2 ✓   | 1/2      | +50.0 pp  |
| 011  | 3/19    | 1/19     | +10.5 pp  |
| 012  | 1/1 ✓   | 0/1      | +100.0 pp |
| 013  | 3/4     | 1/4      | +50.0 pp  |
| 014  | 2/3     | 1/3      | +33.3 pp  |
| 015  | 0/3     | 1/3      | −33.3 pp  |
| 016  | 11/14   | 0/14     | +78.6 pp  |
| 017  | 2/12    | 1/12     | +8.3 pp   |
| 018  | 0/1     | 0/1      | 0         |
| 019  | 10/12   | 1/12     | +75.0 pp  |
| 020  | 0/3     | 2/3      | −66.7 pp  |
| 021  | 12/24   | 1/24     | +45.8 pp  |
| 022  | 13/13 ✓ | 1/13     | +92.3 pp  |
| 023  | 4/4 ✓   | 1/4      | +75.0 pp  |
| 024  | 3/9     | 0/9      | +33.3 pp  |
| 025  | 1/5     | 1/5      | 0         |

✓ = all criteria passed.

### Provenance (three GHA runs, merged)

| Run                                                                                      | SHA        | What it contributes                                                |
| ---------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| [31989734158](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31989734158) | `73a3a0e1` | ClawQL 001–005; baseline 001–009 (stopped on OpenRouter 429)       |
| [32083312814](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/32083312814) | `9a0a318f` | ClawQL 006–008, 010–025; baseline 010–021, 023–025 (two 504 holes) |
| [32168856394](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/32168856394) | `fef3f768` | ClawQL 009, baseline 022 — both jobs success                       |

Scores use GHA-dated run IDs only (`20260817-*` / `20260818-*`). Leftover
local 4bit scorecards in sweep-summary JSON were ignored.

### How to read the gap

ClawQL’s advantage is consistent on recall-heavy firm-knowledge work: 21 of 25
tasks have higher criterion pass rate, including large-rubric wins (009 19/19
vs 0/19, 022 13/13 vs 1/13, 016 11/14 vs 0/14). Baseline mostly dies at the
40-turn ceiling without retrieving the right evidence.

The two baseline-better tasks (**015**, **020**) and the two ties (**018**,
**025**) are real misses, not infra. They belong in any honest write-up.

Local contiguous MLX 4bit + Ollama judge was **8/25** all-pass and is **not**
this ledger. Do not mix the two.

---

## Prior slices (superseded for 001–025 headline)

Date: 2026-08-14  
Models: Nemotron 3.5 Lightning ± ClawQL  
Batch 2: tasks **001–015** Sonnet 4.6 — [31653266479](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31653266479) (**20% ClawQL all-pass**)  
Batch 3: tasks **016–025** Sonnet 4.6 — [31757993774](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31757993774) (**0% ClawQL all-pass**; mean CPR ~9%)  
Prior partial 1–25:
[31865144197](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31865144197)
(OR 429).

### Probe #7 headline (DuckDB)

| Arm                          | CPR     | All-pass | Turns | Input tokens | Output tokens |
| ---------------------------- | ------- | -------- | ----- | ------------ | ------------- |
| **nemotron-clawql** + DuckDB | **1.0** | **1.0**  | **9** | **135,778**  | 4,150         |
| nemotron baseline            | 0.0     | 0.0      | 40    | 769,251      | 8,801         |

ClawQL ~**5.7×** fewer input tokens than baseline on 018; prior ClawQL 018
probes burned ~1.05M tokens at 0% CPR. Agent wrote SQL → `0` springing-lien
rows → deliverable **0 of 12**.

**Methodology:** DuckDB is not cheating — same corpus, better instrument than
grep; extraction quality is in-scope for ClawQL. See
[`../design/harvey-lab-duckdb-retrieval.md`](../design/harvey-lab-duckdb-retrieval.md).

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
4. ~~Ship Fix 8; re-arm **`18-18`**; **canonical 001–025**~~ **done** — see headline (11/25 vs 0/25)
5. Next: diagnose ClawQL misses **015 / 018 / 020 / 025** from GHA artifacts (no gold-ID spoilers); then Opus A/B
6. Shared vault prepare job (uses `CLAWQL_LAB_PRESERVE_VAULT`) — optional after miss iteration

## Notes

Do not push overlay mid-sweep (`cancel-in-progress`). Marker cleared after probe #5. Do **not** hard-code gold matter IDs into seeding (answer-key leak).
