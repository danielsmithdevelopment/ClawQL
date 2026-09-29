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
  scripts/                # grade, bootstrap, McNemar, pilots, freeze-candidate builder
  design/read-around.md
  fixtures/contaminated-smoke/
  corpus/hard-candidate/    # RFCs + long synthetics (preferred; not spent)
  corpus/freeze-candidate/  # easy synthetic (ceilinged)
  questions/                # frozen JSONL lands here
```

## Confirmatory factorial

|                  | PI off          | PI on          |
| ---------------- | --------------- | -------------- |
| **IDF, CG off**  | `H-idf` (today) | `H-idf-pi`     |
| **BM25, CG off** | `H-bm25`        | `H-bm25-pi`    |
| **IDF, CG on**   | `H-idf-cg`      | `H-idf-pi-cg`  |
| **BM25, CG on**  | `H-bm25-cg`     | `H-bm25-pi-cg` |

Contrasts (Holm α=0.05): PageIndex main effect, BM25 main effect, CodeGraph main effect, combination vs `H-idf`.

Diagnostics (`D-*`): alone baselines, grep, whole-doc, structured ontology, DuckDB SQL — never decide defaults.

## Quick checks (no API spend)

```bash
npm run build -w clawql-pageindex -w clawql-memory

python3 benchmarks/pageindex-ab/scripts/validate_scaffold.py
python3 benchmarks/pageindex-ab/scripts/offline_ranker_compare.py

# Contaminated-smoke (NEVER cite)
node benchmarks/pageindex-ab/scripts/run_retrieval_pilot.mjs --corpus contaminated-smoke

# Hard candidate (preferred; Harvey/ExtractBench excluded)
python3 benchmarks/pageindex-ab/scripts/build_hard_candidate.py
node benchmarks/pageindex-ab/scripts/run_retrieval_pilot.mjs --corpus hard-candidate
```

Agent-lite (cheap OpenRouter — retrieve → one completion):

```bash
export OPENROUTER_API_KEY=sk-or-…
export PAGEINDEX_AB_CORPUS=hard-candidate
export PAGEINDEX_AB_MODEL=google/gemini-2.5-flash-lite
export PAGEINDEX_AB_LIMIT=24
node benchmarks/pageindex-ab/scripts/run_agent_factorial.mjs
```

GHA: touch `benchmarks/pageindex-ab/.run-hard-agent-lite` on the PR
(until `pageindex-ab.yml` is on the default branch).

## Preconditions

| Item                                                    | Status                                              |
| ------------------------------------------------------- | --------------------------------------------------- |
| BM25 ranker (`CLAWQL_MEMORY_VAULT_RANKER`)              | Landed                                              |
| `read_around`                                           | Landed                                              |
| Contaminated-smoke pilot (3 docs + tiny-calc + 20 keys) | Landed                                              |
| Offline retrieval factorial runner                      | Landed                                              |
| Easy freeze-candidate                                   | Landed (agent-lite ceiling — not discriminative)    |
| Hard-candidate (8 RFCs + long synthetics)               | Landed — offline PI helps RFCs, hurts converted-PDF |
| Human freeze (`pageindex-ab-v1`)                        | **Not started**                                     |
| Agent-lite on hard-candidate                            | In progress via GHA                                 |
| Full OpenCode × clawql-inference                        | Not yet (cost)                                      |
| Harvey / ExtractBench in freeze                         | **Excluded** (diagnostics / parallel tracks only)   |
| Memory-stack post correction on live site               | Draft in-repo                                       |

## Industry claim track (separate)

LoCoMo / LongMemEval / BEAM with a strict judge — complements this suite; does not replace the factorial.
