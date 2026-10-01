# Human pass — one sitting (realistic) — freeze stretch to 2026-10-15

**Status: PASSED (agent-reviewed 2026-09-30)** — see [`HUMAN_PASS_RESULT.json`](HUMAN_PASS_RESULT.json).  
No ceremonial signature. Acceptance sampling + CodeGraph grep checks are done; proceed to H-idf / Track B.

| Gate | What was reviewed | Result |
| ---- | ----------------- | ------ |
| **CodeGraph prove** | All 12 keys — single unique-string grep cannot answer (all need graph) | **pass** (0 soluble) |
| **Doc / k-sweep** | Stratified sample of 60 ([`doc-human-pass-sample.json`](doc-human-pass-sample.json), seed `20261015`) | **pass** (0 real defects; 3 auto-flags adjudicated FP) |

Machine gates: `keys_flagged_defective=0`, `map_artifact_section_count=0`, `keys_with_gold_clean=238`.

## CodeGraph decision rule (locked — clear to spend after this pass)

Canonical: [`codegraph-prove-decision.lock.json`](codegraph-prove-decision.lock.json) · narrative: [`agent-loop-freeze.md`](agent-loop-freeze.md).

- **Product question:** does **adding** CodeGraph improve today’s default (grep)? Treatment = **grep + CodeGraph**.
- **Margin:** Net \(\ge 5\) (treatment-correct / grep-only-wrong) on the 12 prove keys; anything less is a **tie → purge**.
- **No-harm:** 6 grep-solvable keys; treatment must score \(\ge 5/6\).
- **Usage:** record `used_codegraph` on treatment.
- **No-tools arm:** memory baseline. Required report; does not rescue a weak Net.
- **Diagnostic:** optional `A-codegraph-only` — never decides freeze.

## Doc sample (acceptance sampling)

```bash
python3 benchmarks/pageindex-ab/scripts/sample_doc_human_pass.py --n 60 --seed 20261015
```

Stop rule was ≥3 **real** defects → reject. Result: **0** real defects.

## Power calibration

n≈238 gold-clean keys: ~9pp single-comparison MDE with deterministic Flash-lite — inside k-sweep needs for large effects.

## Next (in progress)

1. Offline `H-idf` baseline on hard-candidate (clean set)
2. Schedule k-sweep `{3,6,10}` + union matched-k
3. Track B live loop when MCP wired: arms `A-no-tools,A-grep,A-codegraph`
