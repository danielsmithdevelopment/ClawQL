# Memory stack default-route A/B (`pageindex-ab`)

Implements [`docs/benchmarks/pageindex-ab-eval-spec-v0.1.md`](../../docs/benchmarks/pageindex-ab-eval-spec-v0.1.md) **v0.2**.

**Question:** does each addition (BM25 ranker, PageIndex, CodeGraph) improve **today's** omit-`sources` default (`vault` IDF + `vector`) on **task completion**?

**Gates:** strict accuracy / task completion only. Latency, tokens, and $ are reported — never decisive.

**Current lean:** keep `H-idf`. RRF PageIndex **hurts**. Neither PI nor BM25 joins the default. `pageindex_*` catalog default **off** in 8.0.0 (`CLAWQL_ENABLE_PAGEINDEX=1` to opt in).

**Rescore on 150 keys** (filtered saved cells, no re-run — [agent-rescore-150.json](design/agent-rescore-150.json)): `H-idf` **0.840**, RRF PI **0.753** (−0.087 main), union **0.853** (+0.013 / **+2 Q**), gated **0.840** (tie), BM25 **0**. Freeze log: [freeze-log-key-hygiene.md](design/freeze-log-key-hygiene.md). Gold ranks: [rfc-retrieval-miss-gold-ranks.md](design/rfc-retrieval-miss-gold-ranks.md).

**Freeze critical path:** ClawQL PageIndex **purged** ([#1175](https://github.com/danielsmithdevelopment/ClawQL/pull/1175)) — stands. Fair-test **void** ([`design/fair-test-void-retest.md`](design/fair-test-void-retest.md)); hard-candidate **grown** (~238 gold-clean keys for ~8pp k-sweep power) — **one-sitting human pass** (doc keys + [CodeGraph prove](design/codegraph-prove-keys.md)) before H-idf ([`design/HUMAN_PASS_ONE_SITTING.md`](design/HUMAN_PASS_ONE_SITTING.md)). Vectify redesign needs a **fresh validated** set, not a patched void cohort. **Track B** = [CodeGraph vs grep](design/agent-loop-freeze.md). Purge inventory: [`8.0.0-purge-inventory-spec-v0.1.md`](../../docs/releases/8.0.0-purge-inventory-spec-v0.1.md).

## Layout

```
benchmarks/pageindex-ab/
  README.md
  arms/arms.json          # 8 confirmatory (2×2×2) + union/gated extras + diagnostics
  schema/                 # answer / question / manifest
  scripts/                # grade, bootstrap, McNemar, pilots, displacement, builders
  design/read-around.md
  fixtures/contaminated-smoke/
  corpus/hard-candidate/    # RFCs + long synthetics (preferred; not spent)
  corpus/freeze-candidate/  # easy synthetic (ceilinged)
  questions/                # frozen JSONL lands here
```

## Confirmatory factorial

|                  | PI off          | PI on (RRF same-size top-k) |
| ---------------- | --------------- | --------------------------- |
| **IDF, CG off**  | `H-idf` (today) | `H-idf-pi`                  |
| **BM25, CG off** | `H-bm25`        | `H-bm25-pi`                 |
| **IDF, CG on**   | `H-idf-cg`      | `H-idf-pi-cg`               |
| **BM25, CG on**  | `H-bm25-cg`     | `H-bm25-pi-cg`              |

Contrasts (Holm α=0.05): PageIndex main effect, BM25 main effect, CodeGraph main effect, combination vs `H-idf`.

### Extra merge arms (diagnostic; hard-candidate)

| Arm id           | Behavior                                                        |
| ---------------- | --------------------------------------------------------------- |
| `H-idf-pi-union` | IDF top-k ∪ PageIndex hits — matches cheap-context product rule |
| `H-idf-pi-gated` | RRF PageIndex only when `headingQualityScore(markdown) ≥ 0.35`  |

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

# Free displacement check (converted_pdf gold-in-IDF-before-merge?)
node benchmarks/pageindex-ab/scripts/run_displacement_check.mjs --corpus hard-candidate
```

Agent-lite (cheap OpenRouter — retrieve → one completion):

```bash
export OPENROUTER_API_KEY=sk-or-…
export PAGEINDEX_AB_CORPUS=hard-candidate
export PAGEINDEX_AB_MODEL=google/gemini-2.5-flash-lite
export PAGEINDEX_AB_LIMIT=0          # 0 = full corpus
export PAGEINDEX_AB_TRIALS=3
export PAGEINDEX_AB_EXTRA_ARMS=1     # union + gated
node benchmarks/pageindex-ab/scripts/run_agent_factorial.mjs
```

GHA PR triggers:

| Sentinel file          | Corpus           | Limit | Trials | Extra arms |
| ---------------------- | ---------------- | ----- | ------ | ---------- |
| `.run-agent-lite`      | freeze-candidate | 24    | 1      | off        |
| `.run-hard-agent-lite` | hard-candidate   | 24    | 1      | on         |
| `.run-hard-agent-full` | hard-candidate   | full  | 3      | on         |

See `RUN_HARD_AGENT_FULL.md` to re-trigger after OpenRouter credits are topped up.
Agent-lite **checkpoints** each cell to `results/agent-factorial/agent-answers.jsonl` and
resumes on re-run (GHA also tries to reload the prior artifact). Exit code **5** = 402 credits.

**Note:** OpenRouter `limit_remaining` on the key is not prepaid account credits. Run
[36519248781](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36519248781)
failed with 402 after ~4700/4830 cells despite `limit_remaining≈$50`.

## Preconditions

| Item                                                    | Status                                            |
| ------------------------------------------------------- | ------------------------------------------------- |
| BM25 ranker (`CLAWQL_MEMORY_VAULT_RANKER`)              | Landed                                            |
| `read_around`                                           | Landed                                            |
| Contaminated-smoke pilot (3 docs + tiny-calc + 20 keys) | Landed                                            |
| Offline retrieval factorial runner                      | Landed (+ union/gated on hard-candidate)          |
| Displacement check                                      | Landed                                            |
| Easy freeze-candidate                                   | Landed (agent-lite ceiling — not discriminative)  |
| Hard-candidate (8 RFCs + long synthetics)               | Landed — offline + full agent-lite discriminative |
| Human freeze (`pageindex-ab-v1`)                        | **Not started**                                   |
| Full hard agent-lite × 3 trials                         | **Landed** 36522240396 / confirm 36524273079      |
| Full OpenCode × clawql-inference                        | Not yet (cost)                                    |
| Harvey / ExtractBench in freeze                         | **Excluded** (diagnostics / parallel tracks only) |
| Memory-stack post correction on live site               | Draft in-repo                                     |

## Industry claim track (separate)

LoCoMo / LongMemEval / BEAM with a strict judge — complements this suite; does not replace the factorial.
