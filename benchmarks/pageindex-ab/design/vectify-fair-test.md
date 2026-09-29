# VectifyAI PageIndex fair test (freeze-critical)

**Status:** pre-spend locks frozen — do not run live until this file matches the runners  
**Freeze:** 2026-10-15

## Gap

ClawQL’s shipped `pageindex_*` / hybrid RRF path is a **deterministic heading tree + lexical merge**. That is **not** how VectifyAI designed PageIndex. Their product is:

1. **Index:** tree with **LLM-written node summaries**
2. **Retrieve:** a **strong model navigates** the tree (reasoning, not similarity)

Judging `pageindex_*` only on our ranker-mode A/B would purge (or keep) the wrong thing. The fair test uses **their MIT implementation as-is** — no ClawQL port until it wins under the rules below.

## Cohorts

| Cohort | n | File | Purpose |
| ------ | - | ---- | ------- |
| **Misses** | 12 | [`deep-rfc-misses.json`](deep-rfc-misses.json) | Can Vectify recover what IDF cannot? |
| **No-harm** | 15 | [`no-harm-rfc-hits.json`](no-harm-rfc-hits.json) | Does recovery break questions today’s default already gets right? |

Both arms run on **both** cohorts every live spend.

## Arms (same strong model)

| Arm id | Method | Model |
| ------ | ------ | ----- |
| `H-idf-qrewrite` | LLM rewrite → 2–3 queries → IDF union top-k → answer from retrieved sections | **Same strong model** as Vectify chat |
| `D-vectify-pi` | Upstream `pageindex` SDK: LLM summaries + tree chat | **Same strong model** for chat; cheap model OK for index summaries |

**Locked:** query-rewrite and Vectify tree navigation share one OpenRouter model id (e.g. `openai/gpt-4o`). The heuristic 1/12 rewrite is only a floor — **not** the scored arm. Index/summary model may be cheaper (`openai/gpt-4o-mini` / flash-lite).

## Grading (answer-only)

- **Decision metric:** answer-only correctness (tier-1 text / variant match, or unanswerable `not_found`).
- **Citations are not scored.** Vectify section tags will not map to our Docling section ids; citation F1 must not enter the contrast.
- Report citation overlap only as a diagnostic when available.

## “Beat” definition (locked before first live run)

With n=12, a 3–0 win is only p ≈ 0.25 — noise. **Define:**

Let \(W\) = #misses Vectify correct and qrewrite wrong  
Let \(L\) = #misses qrewrite correct and Vectify wrong  
**Net** \(= W - L\)

| Outcome on misses | Condition | Meaning |
| ----------------- | --------- | ------- |
| **Vectify beats** | Net \(\ge 5\) (e.g. 5–0 ≈ p ≈ 0.06) **and** no-harm pass | Method win → port candidate |
| **Tie** | Net \(\in [-4, +4]\) | **Counts as purge** (no port) |
| **Qrewrite beats** | Net \(\le -5\) | Purge (no port) |

**No-harm pass (required for any Vectify win):** on the 15 known H-idf hits, Vectify answer-correct count \(\ge 14\) (allow one flake). A method that recovers misses but breaks hits is **not** a win — treat as tie → purge.

Also report qrewrite no-harm rate for context; it does not rescue Vectify if no-harm fails.

Smoke / contaminated-smoke do **not** count ([purge evidence rules](../../../docs/releases/8.0.0-purge-inventory-spec-v0.1.md#evidence-rules)).

## Documents (PDF source)

Upstream local `submit_document` is PDF-only. Prefer official IETF bytes so a loss cannot be blamed on our Markdown conversion:

1. **`ietf-pdf`:** `https://www.rfc-editor.org/rfc/rfcXXXX.pdf` when published (newer RFCs).
2. **`ietf-txt`:** authoritative `rfcXXXX.txt` rendered to a text PDF when no official PDF exists (common for older RFCs).
3. **`bridge` (last resort):** hard-candidate Markdown → text PDF.

Live / GHA default: `--pdf-source ietf` (tries 1 then 2). Do not score a run that fell back to `bridge` for any doc in the cohort without noting it in the decision artifact.

## How Track A and Track B combine (locked)

| Track A (Vectify vs qrewrite) | Track B (ClawQL agent loop vs grep) | Action at freeze |
| ----------------------------- | ----------------------------------- | ---------------- |
| Vectify **beats** | ClawQL `pageindex_*` **loses** | **Purge** current tools at 8.0.0; rebuild on Vectify’s design **after** 8.0.0; ship only once proven |
| Vectify **loses** or **tie** | loses or tie | **Purge**, done |
| any | ClawQL `pageindex_*` **beats** grep | **Keep opt-in** (`CLAWQL_ENABLE_PAGEINDEX=1`) |
| Vectify beats | ClawQL also beats | Keep opt-in; still consider porting Vectify design as upgrade path |

`codegraph_*` is decided only by Track B (grep-insoluble jobs), independent of Vectify.

## How to run

```bash
pip install -U pageindex

# Dry-run: cohorts + PDF fetch/bridge (no LLM)
python3 benchmarks/pageindex-ab/scripts/run_vectify_fair_test.py --dry-run --pdf-source ietf

# Live fair test (GHA preferred — uses repo OPENROUTER_API_KEY)
# Sentinel: touch benchmarks/pageindex-ab/.run-vectify-fair
export OPENROUTER_API_KEY=…   # local only if needed
export VECTIFY_FAIR_MODEL=openai/gpt-4o          # shared strong model
export VECTIFY_INDEX_MODEL=openai/gpt-4o-mini    # summaries only

python3 benchmarks/pageindex-ab/scripts/run_vectify_fair_test.py \
  --pdf-source ietf \
  --chat-model "$VECTIFY_FAIR_MODEL" \
  --index-model "$VECTIFY_INDEX_MODEL" \
  --out benchmarks/pageindex-ab/results/vectify-fair/

python3 benchmarks/pageindex-ab/scripts/run_query_rewrite_cohort.py \
  --model "$VECTIFY_FAIR_MODEL" \
  --cohort both \
  --out benchmarks/pageindex-ab/results/vectify-fair/

python3 benchmarks/pageindex-ab/scripts/decide_vectify_fair_test.py \
  --dir benchmarks/pageindex-ab/results/vectify-fair/
```

| Script | Role |
| ------ | ---- |
| [`../scripts/run_vectify_fair_test.py`](../scripts/run_vectify_fair_test.py) | `D-vectify-pi` |
| [`../scripts/run_query_rewrite_cohort.py`](../scripts/run_query_rewrite_cohort.py) | `H-idf-qrewrite` (LLM rewrite; same model) |
| [`../scripts/decide_vectify_fair_test.py`](../scripts/decide_vectify_fair_test.py) | Net≥5 + no-harm → beat / tie / purge |

**GHA:** push sentinel `benchmarks/pageindex-ab/.run-vectify-fair` (same pattern as agent-lite). Uses `secrets.OPENROUTER_API_KEY`. Remove the sentinel after the run lands.

## Scheduling (freeze 2026-10-15)

| Track | Work | Blocks |
| ----- | ---- | ------ |
| **A (parallel)** | This fair test (misses + no-harm) | Port-vs-purge for PageIndex *design* |
| **B (parallel)** | Strong-model agent loop vs grep — [agent-loop-freeze.md](agent-loop-freeze.md) | Catalog keep / purge |
| **C (can lag)** | k-sweep + union matched-k | Default k / union confound only |
