# Corpus

| Path | Role |
| --- | --- |
| `seed/` | Optional public RFC downloads via `scripts/fetch_public_corpus.py` (not frozen; large `.txt` gitignored). |
| `freeze-candidate/` | Synthetic 24-doc + 8-repo set + keys for offline factorial (`pageindex-ab-v1-candidate`). **Not spent.** |
| Frozen `pageindex-ab-v1` | Lands here after Docling conversion + second-annotator keys; hashed in the freeze manifest. |

Contaminated-smoke docs live under `fixtures/contaminated-smoke/docs/` and must never be cited or merged into the freeze set.

```bash
python3 benchmarks/pageindex-ab/scripts/build_freeze_candidate.py
python3 benchmarks/pageindex-ab/scripts/fetch_public_corpus.py
node benchmarks/pageindex-ab/scripts/run_retrieval_pilot.mjs --corpus freeze-candidate
```
