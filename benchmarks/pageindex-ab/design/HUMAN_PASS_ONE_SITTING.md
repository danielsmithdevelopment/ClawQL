# Human pass — one sitting (realistic) — freeze stretch to 2026-10-15

**Do not review all ~250 doc keys.** At 1–2 minutes each that is 4–8 hours. Use acceptance sampling so both freeze gates fit in **about an hour or two**.

| Gate | What to review | Stop / sign rule |
| ---- | -------------- | ---------------- |
| **CodeGraph prove** | **All 12** keys in [`codegraph-prove-keys.md`](codegraph-prove-keys.md) | For each: confirm a **single unique-string grep** cannot answer. Drop/rewrite any that fall. Then sign. |
| **Doc / k-sweep** | Stratified sample of **~60** in [`doc-human-pass-sample.json`](doc-human-pass-sample.json) | If **≥3 defects** → **stop**, fix builder, re-sample — **do not sign**. If ≤2 defects → sign the set. |

Machine gates (already green): hard-candidate `keys_flagged_defective=0`, `map_artifact_section_count=0`, `keys_with_gold_clean=238`.

## CodeGraph decision rule (locked — clear to sign)

Canonical: [`codegraph-prove-decision.lock.json`](codegraph-prove-decision.lock.json) (`clear_to_sign: true`) · narrative: [`agent-loop-freeze.md`](agent-loop-freeze.md).

- **Product question:** does **adding** CodeGraph improve today’s default (grep)? Treatment = **grep + CodeGraph**.
- **Margin:** Net \(\ge 5\) (treatment-correct / grep-only-wrong) on the 12 prove keys; anything less is a **tie → purge**.
- **No-harm:** 6 grep-solvable keys; treatment must score \(\ge 5/6\) (extra tools must not distract on easy questions).
- **Usage:** record whether the treatment arm actually calls `codegraph_*`; ignoring CodeGraph when both are available is evidence on its own.
- **No-tools arm:** memory baseline on the public repo. Required report; does not rescue a weak Net.
- **Diagnostic:** optional `A-codegraph-only` (no grep) — never decides freeze.

Twelve keys on one TypeScript repo is **home turf** — the locked margin + no-harm + no-tools + usage exist so a thin win cannot keep the tools.

## Doc sample (acceptance sampling)

```bash
# Regenerated with fixed seed (committed ids must match sample_sha256)
python3 benchmarks/pageindex-ab/scripts/sample_doc_human_pass.py --n 60 --seed 20261015
```

| Field | Value |
| ----- | ----- |
| n | 60 |
| seed | `20261015` |
| Population | full hard-candidate `keys.jsonl` (stratified by stratum × question_type) |
| Reject if | **≥3** sample defects (wrong gold, cite-impossible, artifact heading, bogus answer) |
| Sign if | ≤2 defects **and** flagger still 0 on the full set |

### Defect examples

- Gold section is TOC/list/postal junk or absent from the doc map  
- `normalized_answer` not in the document (except `unanswerable: true`)  
- Depth-% / “60%” heading clearly not near that percentile among **filtered** headings  
- Question asks for something the builder hallucinated  

## Power calibration (doc set)

Rough MDE for n≈238 gold-clean keys was ~8pp under an independent-trials sketch. **Flash-lite answers are deterministic**, so for a **single comparison** the detectable difference is closer to **~9pp**. Still well inside what the k-sweep needs to change a default on a large effect; it is not powered for tiny ones.

## Sitting checklist (~1–2 h)

1. [ ] Read [`codegraph-prove-decision.lock.json`](codegraph-prove-decision.lock.json) — confirm Net≥5 / tie=purge / no-harm / no-tools are acceptable before any spend.
2. [ ] **All 12** prove keys: attempt one naive `grep` (+ optional read). Reject any grep-soluble key; note on the checklist.
3. [ ] Skim the 6 no-harm keys — confirm they remain intentionally grep-easy (no need for deep review).
4. [ ] Review the **60** sample rows in [`doc-human-pass-sample.json`](doc-human-pass-sample.json). Tally defects.
5. [ ] If defects ≥3: stop; open a builder fix; do **not** sign. Else continue.
6. [ ] Re-run `python3 benchmarks/pageindex-ab/scripts/flag_artifact_gold_keys.py` → must stay 0/0.
7. [ ] Sign below. Same day after sign: cheap `H-idf` + schedule k-sweep; schedule Track B with arms `A-no-tools,A-grep,A-codegraph` (additive; optional `A-codegraph-only` diagnostic).

## Signer

| Role | Name | Date | Defects found (doc sample) |
| ---- | ---- | ---- | -------------------------- |
| CodeGraph prove (12/12 grep check) | | | — |
| Doc sample (≤2 to sign) | | | |
| Session (both) | | | |
