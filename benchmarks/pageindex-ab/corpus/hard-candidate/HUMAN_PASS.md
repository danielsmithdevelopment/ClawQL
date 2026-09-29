# Human pass required — hard-candidate (rebuilt)

**Status:** regenerated 2026-09-29 with TOC/list-filtered `rfc_to_markdown` + map extract.  
**Machine gate:** `python3 benchmarks/pageindex-ab/scripts/flag_artifact_gold_keys.py` → `keys_flagged_defective: 0`, `map_artifact_section_count: 0`.  
**Do not freeze or spend confirmatory runs until this checklist is signed.**

The previous hard-candidate (pre-rebuild) produced 11 rule-based drops plus 8+ TOC/list gold defects and 92 map artifact sections. That set is **untrusted**; do not patch it further. This rebuild is a **fresh machine pass** only — not yet human-validated.

## Checklist

- [ ] Spot-check every RFC `section_lookup` / `buried_detail` key: gold title is a real body heading; ~60% depth keys are near mid-document among **body** headings.
- [ ] Spot-check 20+ `exact_term` / other types: answer appears in doc; not cite-impossible.
- [ ] Confirm no TOC leader-dot titles remain in `section-maps/rfc*.json` (filter should already guarantee this).
- [ ] Re-run `flag_artifact_gold_keys.py` after any manual key edits (must stay at 0 flagged).
- [ ] Only then: offline `H-idf` baseline on the **clean** key set; then any fair-test / Vectify retest on a **new** validated cohort (do not reuse spent void IDs as proof).

## Commands

```bash
python3 benchmarks/pageindex-ab/scripts/flag_artifact_gold_keys.py
# After human edits + approval:
# node benchmarks/pageindex-ab/scripts/...  # H-idf re-rank (cheap)
```

## Signer

| Role | Name | Date |
| ---- | ---- | ---- |
| Human pass | | |
