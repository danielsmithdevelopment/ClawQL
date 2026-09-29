# Memory stack default-route A/B (`pageindex-ab`)

Implements [`docs/benchmarks/pageindex-ab-eval-spec-v0.1.md`](../../docs/benchmarks/pageindex-ab-eval-spec-v0.1.md) **v0.2**.

**Question:** does each addition (BM25 ranker, PageIndex, CodeGraph) improve **today's** omit-`sources` default (`vault` IDF + `vector`) on **task completion**?

**Gates:** strict accuracy / task completion only. Latency, tokens, and $ are reported — never decisive.

## Layout

```
benchmarks/pageindex-ab/
  README.md
  arms/arms.json          # 8 confirmatory (2×2×2) + diagnostics
  schema/                 # answer / question / manifest
  scripts/                # tier-1 grade, bootstrap, McNemar, conformance, validate
  design/read-around.md   # precondition
  fixtures/contaminated-smoke/
  corpus/  questions/     # frozen set lands here
```

## Confirmatory factorial

| | PI off | PI on |
| --- | --- | --- |
| **IDF, CG off** | `H-idf` (today) | `H-idf-pi` |
| **BM25, CG off** | `H-bm25` | `H-bm25-pi` |
| **IDF, CG on** | `H-idf-cg` | `H-idf-pi-cg` |
| **BM25, CG on** | `H-bm25-cg` | `H-bm25-pi-cg` |

Contrasts (Holm α=0.05): PageIndex main effect, BM25 main effect, CodeGraph main effect, combination vs `H-idf`.

Diagnostics (`D-*`): alone baselines, grep, whole-doc, structured ontology, DuckDB SQL — never decide defaults.

## Quick checks (no API spend)

```bash
python3 benchmarks/pageindex-ab/scripts/validate_scaffold.py
```

## Preconditions

1. Okapi BM25 vault ranker flag (not implemented yet).
2. `read_around` for section expansion.
3. Code stratum repos + native `codegraph_sync` fixtures.
4. Cross-document list questions + ontology rows.
5. Correct [memory-stack post](https://pragmaticvectors.com/posts/agent-memory-stack/) — see [`docs/gtm/pragmaticvectors/agent-memory-stack-corrections.md`](../../docs/gtm/pragmaticvectors/agent-memory-stack-corrections.md).

## Industry claim track (separate)

LoCoMo / LongMemEval / BEAM with a strict judge — complements this suite; does not replace the factorial.
