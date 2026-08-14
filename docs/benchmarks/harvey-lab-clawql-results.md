# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-14  
Models: Nemotron 3.5 Lightning ± ClawQL  
Batch 2: tasks **001–015** Sonnet 4.6 — [31653266479](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31653266479) (**20% ClawQL all-pass**)  
Batch 3: tasks **016–025** Sonnet 4.6 — [31757993774](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31757993774) (**0% ClawQL all-pass**; mean CPR ~9%)  
**Next:** land task-018 control-flow fixes → optional 018 smoke → **clean canonical 001–025**

### Next-run gate (deep think — do not skip)

Do **not** arm `1-25` yet. Live PR [31764087476](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31764087476) is already running **task 001 smoke** (judge = **gpt-5.4-mini**, not Sonnet — default no-marker path). `cancel-in-progress` means any new LAB arming cancels it.

Ordered plan:

1. Let **001 smoke** finish → confirm patch apply (`ClawQL require-recall` in clawql log) + no empty-output regression.
2. Arm **`.run-nemotron-sweep` = `18-18`** (Sonnet, single task) — only probe that exercises frequency / negative-result / ceiling.
3. Only if 018 writes a deliverable (ideally `0 of N`) **and** OpenRouter quota is healthy (prefer **after midnight UTC** if same-day batch 3 burned the free tier) → arm **`1-25`** for the canonical ledger.

Sticky: default PR smoke ≠ Harvey-parity judge; Sonnet multi-task needs the sweep marker.

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

| Task | ClawQL CPR | Baseline CPR | Notes |
| ---- | ---------- | ------------ | ----- |
| 016  | 0% (0/14)  | 0% (0/14)    | model ceiling; both hit turn cap |
| 017  | 8% (1/12)  | 8% (1/12)    | model ceiling |
| 018  | 0% (0/1)   | 0% (0/1)     | **negative-result miss** — ClawQL 40/40, 0 recalls, no write |
| 019  | 8% (1/12)  | 8% (1/12)    | model ceiling |
| 020  | 0% (0/3)   | 0% (0/3)     | both fail |
| 021  | 4% (1/24)  | 4% (1/24)    | 24-criteria ceiling |
| 022  | **46%** (6/13) | 8% (1/13) | ClawQL CPR win (not all-pass); high tokens |
| 023  | 0% (0/4)   | 25% (1/4)    | baseline CPR win |
| 024  | 0% (0/9)   | 11% (1/9)    | baseline CPR win |
| 025  | 20% (1/5)  | 20% (1/5)    | tie |

**ClawQL all-pass: 0/10.** Baseline all-pass: 0/10.  
Combined 001–025 all-pass (this slice + batch 2): **ClawQL 3/25 (12%)** until canonical re-run with 018 fixes.

Do **not** tune the Nemotron prompt stack against 016/017/019/021 — those are Opus-class criterion ceilings.

## Fixes in place (all of them)

| Fix                                                                      | Status |
| ------------------------------------------------------------------------ | ------ |
| Tool-result truncation (`CLAWQL_LAB_MAX_TOOL_RESULT_CHARS`, default 24k) | **in** |
| Always-write deliverable guard (clean stop)                              | **in** |
| Turn-ceiling force-write (`CLAWQL_LAB_CEILING_LEAD_TURNS`, default 3)    | **in** |
| Negative-result principle (`0 of N` / none is complete)                  | **in** |
| Require ≥1 `clawql_memory_recall` (`CLAWQL_LAB_REQUIRE_RECALL`)          | **in** |
| Frequency / survey task kind + corpus-coverage Wonder                    | **in** |
| ≤2 empty recalls → grep/read fallback                                    | **in** |
| Empty-recall `labGuidance.fallback`                                      | **in** |
| Pattern E **only** when prompt explicitly mentions second request        | **in** |
| Step 0 task-kind classification (enumeration / frequency / single / …)   | **in** |
| Kind-gated Wonder (1–2 greps on single_answer; fuller on enumeration)    | **in** |
| Partial fallback hits = unresolved, not confirmed                        | **in** |
| `max-parallel: 4` (was 2; daily quota binds more than concurrency)       | **in** |
| Sweep marker supports `START-END` (e.g. `16-25`)                         | **in** |

Task **018** root cause (016–025 batch): not retrieval strategy — **zero**
`memory_recall`, 40/40 bash turns hunting positive “springing lien” evidence,
never wrote, never concluded **0 of 12**. Ceiling-hit skipped the clean-stop
guard; Wonder never ran. Ceiling force-write + negative-result principle are
the two that would have saved it; require-recall makes the ClawQL arm use
ClawQL; frequency kind tunes Wonder.

## Plan

1. ~~**016–025** first — new signal~~ **done** ([31757993774](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31757993774))
2. Land task-018 fixes (ceiling force-write, negative-result principle, require-recall, frequency kind)
3. Optional **018 smoke** on ClawQL arm → then **clean canonical 001–025** for the Nemotron ledger
4. Then Opus; Harvey outreach with public run IDs

## Notes

Do not push overlay mid-sweep (`cancel-in-progress`). Marker cleared after batch 3 so the next push does not re-arm 016–025.
