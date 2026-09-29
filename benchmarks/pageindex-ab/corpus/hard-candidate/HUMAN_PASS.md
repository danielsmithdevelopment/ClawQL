# Human pass required — hard-candidate (grown)

**Status:** regenerated 2026-09-29 with TOC/list-filtered `rfc_to_markdown` + **grown** gold-section ladder (16 RFCs, depth keys).  
**Machine gate:** `python3 benchmarks/pageindex-ab/scripts/flag_artifact_gold_keys.py` → `keys_flagged_defective: 0`, `map_artifact_section_count: 0`, `keys_with_gold_clean` ≥ 190 (currently **238**).  
**Do both human passes in one sitting:** [`../../design/HUMAN_PASS_ONE_SITTING.md`](../../design/HUMAN_PASS_ONE_SITTING.md) (this set + CodeGraph prove keys).  
**Do not freeze or spend confirmatory runs until this checklist is signed.**

## Why grow before signing

n≈72 gold-section keys only detects **~13pp** effects on a single comparison — enough to confirm a large k-sweep gain, not a subtle default change. With the builder fixed, more candidates are cheap; the human pass is the bottleneck. This grown set targets **~8pp** detectability so a k-sweep can change the default if the effect is real.

Prior pre-rebuild set (11 rule drops + TOC/list gold defects) is **untrusted** — do not patch it.

## Checklist

- [ ] Spot-check every RFC `section_lookup` / `buried_detail` / depth-ladder key: gold title is a real body heading; ~60% / depth-% keys sit near that percentile among **filtered** headings.
- [ ] Spot-check 20+ `exact_term` / other types: answer appears in doc; not cite-impossible.
- [ ] Confirm no TOC leader-dot titles / postal-junk headings (`48155 Münster`) in `section-maps/rfc*.json`.
- [ ] Re-run `flag_artifact_gold_keys.py` after any manual key edits (must stay at 0 flagged; gold-clean ≥ 190).
- [ ] Sign CodeGraph prove keys the **same sitting** ([`codegraph-prove-keys.md`](../../design/codegraph-prove-keys.md)).
- [ ] Only then: offline `H-idf` baseline on the **clean** key set; k-sweep `{3,6,10}`; any fair-test / Vectify retest on a **new** validated cohort (do not reuse spent void IDs as proof).

## Commands

```bash
python3 benchmarks/pageindex-ab/scripts/flag_artifact_gold_keys.py
# Vault ghosts (operator Memory + optional contaminated proxy):
python3 benchmarks/pageindex-ab/scripts/flag_artifact_gold_keys.py --vault "$CLAWQL_OBSIDIAN_VAULT_PATH"
# After human edits + approval:
# node benchmarks/pageindex-ab/scripts/...  # H-idf re-rank (cheap)
```

## Signer

| Role | Name | Date |
| ---- | ---- | ---- |
| Human pass (doc keys) | | |
