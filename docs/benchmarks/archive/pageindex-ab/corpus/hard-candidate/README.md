# Hard candidate (`pageindex-ab-v1-hard-candidate`)

Public IETF RFCs (well-structured) + long synthetic Docling/weak docs + 8 tiny repos.

**2026-09-30:** depth/position templates **retired**. Machine keys with `gold_sections` ≈ **162** (content-only). MaxP / k / rerank headroom → **EnterpriseRAG-Bench** (+ LongMemEval-S for vault); see [`next-hard-content-set.md`](../../design/next-hard-content-set.md).

| Gate | Status |
| ---- | ------ |
| `flag_artifact_gold_keys.py` | Must stay **0** defective / **0** map artifacts |
| Hard/no-harm overlap gate | `hard_content_key_gate.py` (overlap &lt; 0.3 / ≥ 0.6) — not kw-rank |
| Human pass | **Required** — [`HUMAN_PASS.md`](HUMAN_PASS.md) + [unified freeze sitting](../../design/HUMAN_PASS_ONE_SITTING.md) |
| Confirmatory spend / freeze | Blocked until human pass |

Harvey LAB and ExtractBench fixtures are excluded by design.

```bash
python3 benchmarks/pageindex-ab/scripts/flag_artifact_gold_keys.py
python3 benchmarks/pageindex-ab/scripts/hard_content_key_gate.py
python3 benchmarks/pageindex-ab/scripts/build_hard_candidate.py   # regenerate from corpus/seed
```
