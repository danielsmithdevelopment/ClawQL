# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-13  
Models: Nemotron 3.5 Lightning ± ClawQL; Opus 4.8 ± ClawQL (OpenRouter validation)  
Tasks: 250 total; batch 2 = first **15** (Sonnet 4.6 judge)  
Judges: Harvey-parity — `claude-sonnet-4-6` via OpenRouter

## Status

**Batch 2** ([31653266479](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31653266479)): tasks **001–011** scored; **012–015** still finishing.  
ClawQL all-pass so far **2/10+** (001, 002). Do **not** push overlay until the run completes.

### Batch 2 ledger (partial)

| Task | ClawQL CPR | Baseline CPR | Notes |
| ---- | ---------- | ------------ | ----- |
| 001 | 100% | 14% | All-pass; Wonder tax → ~630k cum. tokens (peak ~50k) |
| 002 | 100% | 25% | All-pass |
| 003 | 33% | 33% | Tie; ClawQL more efficient |
| 004 | 0% | 50% | Baseline lucky brute force |
| 005 | 33% | 17% | ClawQL wins |
| 006 | 33% | 33% | Tie; ClawQL less efficient |
| 007 | 0% | 0% | Both fail |
| 008 | 0% | 0% | Wrong Pattern E framing + Wonder proved wrong list |
| 009 | 0% | 0% | 19 criteria — model ceiling |
| 010 | 0% | 50% | Fallback OK; overfit partial greps |
| 011 | 11% | 5% | 19 criteria — model ceiling-ish |

### Batch-2 diagnosis (tasks 008 / 010)

- **Not recall looping.** 008: one Pattern E call with hits, then Wonder ground-wrong-answer.
- **HSR filing ≠ second request.** Pattern E must be scoped.
- **Wonder token sink:** cumulative tokens ≈ sum(per-turn); peak context stayed ~43–50k (truncation OK).
- **Batch-3 fixes (landed in tree, push after sweep):** task-kind classification, Pattern E scope gate, kind-gated Wonder (1–2 greps on single-answer), partial-hit = unresolved.

### Batch 1 critical bugs (fixed earlier)

Tool-result truncation (`ls -R` pin), deliverable guard, empty-recall fallback.

## Next

1. Let batch 2 finish → publish full 001–015 aggregate  
2. Push kind-gated Wonder / Pattern E scope (no mid-sweep push)  
3. Smoke 001 then batch 3 (N=15)  
4. Harvey outreach only with multi-task Sonnet ledger + public run IDs  

## Notes

Avoid pushing `integrations/harvey-labs/**` or the LAB workflow while a sweep runs (`cancel-in-progress`).
