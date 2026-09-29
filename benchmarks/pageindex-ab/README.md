# PageIndex A/B harness (`pageindex-ab`)

Implements the eval in [`docs/benchmarks/pageindex-ab-eval-spec-v0.1.md`](../../docs/benchmarks/pageindex-ab-eval-spec-v0.1.md).

**Status:** scaffold only. Corpus, questions, and the scored run are not started. Graders score answers and citations — never which tools were used.

## Layout

```
benchmarks/pageindex-ab/
  README.md
  schema/           # answer contract, question, manifest, arm configs
  arms/             # per-arm tool allowlists + recall sources
  scripts/          # freeze hash, tier-1 grade, conformance, stats
  fixtures/
    contaminated-smoke/   # pilot only — never cite in product decisions
  corpus/           # frozen docs land here (git-lfs or external; hashed in manifest)
  questions/        # frozen question JSONL (hashed in manifest)
```

## Arms (ids)

| Id | Spec arm | Recall / tools |
| --- | --- | --- |
| `A-pageindex` | A | `pageindex_*` only (tree pre-built) |
| `B-vector` | B | `memory_recall` `sources: ["vector"]` + `read_around` |
| `C-fulltext` | C | `memory_recall` `sources: ["vault"]` + `read_around` |
| `Cplus-grep` | C+ (exploratory) | `grep` + `read_range` |
| `D-whole-doc` | D | no tools; docs with 30% context headroom only |
| `E-hybrid` | E | `sources: ["vault","vector","pageindex"]` |
| `E-minus` | E− | `sources: ["vault","vector"]` |

Confirmatory comparisons (Holm α=0.05): **A vs B**, **A vs C**, **E vs E−**. C+ is exploratory only.

## Quick checks (no API spend)

```bash
# Schema + smoke fixtures validate
python3 benchmarks/pageindex-ab/scripts/validate_scaffold.py

# Tier-1 grader on synthetic answers
python3 benchmarks/pageindex-ab/scripts/grade_tier1.py \
  --answers benchmarks/pageindex-ab/fixtures/contaminated-smoke/sample-answers.jsonl \
  --keys benchmarks/pageindex-ab/fixtures/contaminated-smoke/sample-keys.jsonl

# Paired bootstrap + McNemar on toy paired scores
python3 benchmarks/pageindex-ab/scripts/bootstrap_paired.py \
  --scores benchmarks/pageindex-ab/fixtures/contaminated-smoke/sample-paired-scores.jsonl
python3 benchmarks/pageindex-ab/scripts/mcnemar_paired.py \
  --scores benchmarks/pageindex-ab/fixtures/contaminated-smoke/sample-paired-scores.jsonl
```

## Preconditions before scored run

1. Shared Docling Markdown + section IDs per document.
2. `read_around` (or equivalent) for arms B/C/E/E−.
3. Frozen manifest with SHA-256 hashes (`scripts/hash_freeze.py`).
4. Predictions recorded in the eval spec.
5. Equal pilot tuning budget spent only on `contaminated-smoke`.

## Relationship to OpenBench task WINs

Retired cells `pageindex-section-qa`, `hybrid-recall-source-pin`, and `memory-recall-pageindex-pin` prove tools work. They do **not** authorize default-route or demote decisions — this suite does.
