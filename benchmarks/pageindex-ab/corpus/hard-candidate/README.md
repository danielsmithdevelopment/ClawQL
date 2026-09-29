# Hard candidate (`pageindex-ab-v1-hard-candidate`)

Public IETF RFCs (well-structured) + long synthetic Docling/weak docs + 8 tiny repos.

**Rebuilt 2026-09-29** with TOC/list-filtered section mapping (`build_hard_candidate.py`). Prior machine keys (TOC ghosts / list-step gold) are **retired** — see `design/artifact-gold-flags-pre-rebuild.json`.

| Gate | Status |
| ---- | ------ |
| `flag_artifact_gold_keys.py` | **0** defective golds, **0** map artifacts (post-rebuild) |
| Human pass | **Required** — [`HUMAN_PASS.md`](HUMAN_PASS.md) |
| Confirmatory spend / freeze | Blocked until human pass |

Harvey LAB and ExtractBench fixtures are excluded by design.

```bash
python3 benchmarks/pageindex-ab/scripts/flag_artifact_gold_keys.py
python3 benchmarks/pageindex-ab/scripts/build_hard_candidate.py   # regenerate from corpus/seed
```
