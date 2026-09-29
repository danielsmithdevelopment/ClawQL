# Hard candidate (`pageindex-ab-v1-hard-candidate`)

Public IETF RFCs (well-structured) + long synthetic Docling/weak docs + 8 tiny repos.

**Grown 2026-09-29** for k-sweep power: machine keys with `gold_sections` ≈ **262**
(target ≥190 so an ~8pp effect is detectable; n=72 only sees ~13pp).

| Gate | Status |
| ---- | ------ |
| `flag_artifact_gold_keys.py` | Must stay **0** defective / **0** map artifacts |
| Human pass | **Required** — [`HUMAN_PASS.md`](HUMAN_PASS.md) + [unified freeze sitting](../../design/HUMAN_PASS_ONE_SITTING.md) |
| Confirmatory spend / freeze | Blocked until human pass |

Harvey LAB and ExtractBench fixtures are excluded by design.

```bash
python3 benchmarks/pageindex-ab/scripts/flag_artifact_gold_keys.py
python3 benchmarks/pageindex-ab/scripts/build_hard_candidate.py   # regenerate from corpus/seed
```
