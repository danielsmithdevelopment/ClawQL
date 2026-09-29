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
  corpus/freeze-candidate/  # synthetic candidate (not spent)
  questions/                # frozen JSONL lands here
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
npm run build -w clawql-pageindex -w clawql-memory

python3 benchmarks/pageindex-ab/scripts/validate_scaffold.py
python3 benchmarks/pageindex-ab/scripts/offline_ranker_compare.py

# Contaminated-smoke (NEVER cite)
node benchmarks/pageindex-ab/scripts/run_retrieval_pilot.mjs --corpus contaminated-smoke

# Synthetic freeze-candidate factorial (not spent)
python3 benchmarks/pageindex-ab/scripts/build_freeze_candidate.py
node benchmarks/pageindex-ab/scripts/run_retrieval_pilot.mjs --corpus freeze-candidate
```

Optional public RFC seeds:

```bash
python3 benchmarks/pageindex-ab/scripts/fetch_public_corpus.py
```

Agent-lite factorial (cheap OpenRouter path — retrieval + one completion per cell):

```bash
export OPENROUTER_API_KEY=sk-or-…
export PAGEINDEX_AB_MODEL=google/gemini-2.5-flash-lite   # default
export PAGEINDEX_AB_LIMIT=24                             # stratified sample
export PAGEINDEX_AB_TRIALS=1
node benchmarks/pageindex-ab/scripts/run_agent_factorial.mjs
# → results/agent-factorial/agent-report.json
```

GHA (uses repo `OPENROUTER_API_KEY` secret):

Until `pageindex-ab.yml` is on the default branch, trigger agent-lite by
touching `benchmarks/pageindex-ab/.run-agent-lite` on a PR (path filter).

After it lands on default:

```bash
gh workflow run pageindex-ab.yml \
  -f mode=agent-factorial \
  -f model=google/gemini-2.5-flash-lite \
  -f limit=24 \
  -f trials=1
```

## Preconditions

| Item | Status |
| --- | --- |
| BM25 ranker (`CLAWQL_MEMORY_VAULT_RANKER`) | Landed |
| `read_around` | Landed |
| Contaminated-smoke pilot (3 docs + tiny-calc + 20 keys) | Landed |
| Offline retrieval factorial runner | Landed |
| Synthetic freeze-candidate (24 docs + 8 repos + keys) | Landed |
| Human freeze (`pageindex-ab-v1`) + Docling PDFs | **Not started** |
| Agent-lite (flash-lite, n=24, GHA) | Landed — all arms 0.958, contrasts 0 (~$0.008) |
| Full OpenCode × clawql-inference | Not yet (cost) |
| Memory-stack post correction on live site | Draft in-repo |

## Industry claim track (separate)

LoCoMo / LongMemEval / BEAM with a strict judge — complements this suite; does not replace the factorial.
