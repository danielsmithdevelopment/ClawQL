# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-13  
Models: Nemotron 3.5 Lightning ± ClawQL  
Batch 2: tasks **001–015** Sonnet 4.6 — [31653266479](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31653266479)  
Next: tasks **016–025** (new signal) with Pattern E scope + kind-gated Wonder

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

## Fixes in place (all of them)

| Fix                                                                      | Status |
| ------------------------------------------------------------------------ | ------ |
| Tool-result truncation (`CLAWQL_LAB_MAX_TOOL_RESULT_CHARS`, default 24k) | **in** |
| Always-write deliverable guard                                           | **in** |
| ≤2 empty recalls → grep/read fallback                                    | **in** |
| Empty-recall `labGuidance.fallback`                                      | **in** |
| Pattern E **only** when prompt explicitly mentions second request        | **in** |
| Step 0 task-kind classification (enumeration / single_answer / …)        | **in** |
| Kind-gated Wonder (1–2 greps on single_answer; fuller on enumeration)    | **in** |
| Partial fallback hits = unresolved, not confirmed                        | **in** |
| `max-parallel: 2`                                                        | **in** |
| Sweep marker supports `START-END` (e.g. `16-25`)                         | **in** |

## Plan

1. **016–025** first — new signal with fixed adapter (no re-run of 001–015 yet)
2. If rates hold → **clean canonical 001–025** sweep for the Nemotron ledger entry
3. Then Opus; Harvey outreach with public run IDs

## Notes

Do not push overlay mid-sweep (`cancel-in-progress`).
