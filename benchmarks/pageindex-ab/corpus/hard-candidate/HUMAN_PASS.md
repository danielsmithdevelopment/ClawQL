# Human pass — hard-candidate (acceptance sample)

**Status:** regenerated + grown 2026-09-29 (TOC/list filter; ~238 gold-clean keys).  
**Machine gate:** `flag_artifact_gold_keys.py` → defective **0**, map ghosts **0**.  
**Do not review all keys.** Use the stratified sample protocol in [`../../design/HUMAN_PASS_ONE_SITTING.md`](../../design/HUMAN_PASS_ONE_SITTING.md).

## Realistic review (same sitting as CodeGraph)

| Step | Action |
| ---- | ------ |
| 1 | Review **all 12** CodeGraph prove keys ([`codegraph-prove-keys.md`](../../design/codegraph-prove-keys.md)) — confirm single grep fails |
| 2 | Review the **60** rows in [`doc-human-pass-sample.json`](../../design/doc-human-pass-sample.json) |
| 3 | If **≥3** sample defects → **stop**, fix builder, re-sample — **do not sign** |
| 4 | If ≤2 defects and flagger still 0 → sign [`HUMAN_PASS_ONE_SITTING.md`](../../design/HUMAN_PASS_ONE_SITTING.md) |

```bash
python3 benchmarks/pageindex-ab/scripts/flag_artifact_gold_keys.py
python3 benchmarks/pageindex-ab/scripts/sample_doc_human_pass.py --n 60 --seed 20261015
```

## Power note

n≈238 gold-clean keys: independent-trials rough MDE ~8pp; with **deterministic** Flash-lite answers, single-comparison detectable difference is closer to **~9pp** — still inside k-sweep needs for a large default change.

## Signer

Sign on [`HUMAN_PASS_ONE_SITTING.md`](../../design/HUMAN_PASS_ONE_SITTING.md) (session row). Do not duplicate a full-set checklist here.
