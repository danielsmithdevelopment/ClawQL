# Decision — contiguous local 001–025 → GHA 1–25 (2026-08-16)

## Local contiguous (nemotron-clawql, Ollama judge)

- **All-pass held:** 002, 003, 005, 007, 009, 010, 015, 018
- **Regressions vs composed 001–010:** 001, 004, 006, 008 (agent precision: wrong matter / over-enumeration / date — not empty DuckDB / trust pre-ingest)
- **011+:** mostly fail; gold-tuned 001–010 knobs do not generalize
- Pre-ingest stayed healthy (`maintenance_fc true=9`, `hsr_sr_dated=6`) across tasks

## What we are _not_ doing in this commit

No new Solara/proof allowlists, MA N/k thresholds, or matter-id spoilers before the GHA baseline. Those would chase local Ollama variance and risk the 015/018 wins.

## GHA plan

Arm `.run-nemotron-sweep` → `1-25`, arms `nemotron,nemotron-clawql`, judge `claude-sonnet-4-6`. Iterate fails from GHA artifacts only.

## After-action — GHA merged 001–025 (2026-08-18)

Canonical scoreboard: **ClawQL 11/25 all-pass, 116/180 CPR** vs **baseline 0/25, 17/180**.
JSON: [`../results/aggregate-gha-001-025-nemotron-vs-clawql.json`](../results/aggregate-gha-001-025-nemotron-vs-clawql.json).
Docs: [`../../../docs/benchmarks/harvey-lab-clawql-results.md`](../../../docs/benchmarks/harvey-lab-clawql-results.md).

Honest misses (not infra): ClawQL lost CPR on **015** and **020**; ties **018** and **025**.
Next iteration should start there, without gold-ID spoilers.
