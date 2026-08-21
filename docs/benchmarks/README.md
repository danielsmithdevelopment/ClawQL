# Benchmarks and experiment artifacts

This directory holds **repro instructions**, **latest pointers**, **per-scenario write-ups and stats**, and **archived one-off runs**. Planning-context token math uses **`ceil(bytes / 4)`** unless a note says otherwise (see repo [README](../../README.md)).

---

## Start here

| Document                                                                                                   | Use                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`REPRODUCE.md`](REPRODUCE.md)                                                                             | Step-by-step commands to regenerate benchmark numbers locally.                                                                                                   |
| [`latest.md`](latest.md)                                                                                   | Pointer to the newest consolidated benchmark artifacts.                                                                                                          |
| [`latest.json`](latest.json)                                                                               | Machine-readable latest summary (when present).                                                                                                                  |
| [`openbench.md`](openbench.md)                                                                             | OpenBench harness adoption (adapter + ClawQL-specific tasks).                                                                                                    |
| [`openbench-stack-coverage.md`](openbench-stack-coverage.md)                                               | **Whole-stack** OpenBench coverage map + benchmark backlog.                                                                                                      |
| [`openbench-results-ledger.md`](openbench-results-ledger.md)                                               | **Full live A/B scoreboard + run diary** (update after every matrix).                                                                                            |
| [`openbench-task-explanations.md`](openbench-task-explanations.md)                                         | **Thorough prove / why / how** for every verified OpenBench task.                                                                                                |
| [`openbench-advanced-suites.md`](openbench-advanced-suites.md)                                             | **Next-gen suites (B-1…B-7)** broken into small tasks, phases, and gates.                                                                                        |
| [`openbench-advanced-specs.md`](openbench-advanced-specs.md)                                               | Advanced suites B-1…B-7 (specs; Phase 1 offline packs).                                                                                                          |
| [`openbench-b7-calderwood.md`](openbench-b7-calderwood.md)                                                 | **B-7** C&H institutional knowledge + amortization. Essay: [Memory Finds. Ontology Decides.](https://pragmaticvectors.com/posts/memory-finds-ontology-decides/). |
| [`harvey-lab-baseline.md`](harvey-lab-baseline.md)                                                         | Harvey LAB **firm-knowledge** baseline (Arm A, standard harness).                                                                                                |
| [`harvey-lab-clawql-results.md`](harvey-lab-clawql-results.md)                                             | Harvey LAB × ClawQL three-arm ledger (Opus A/B + Nemotron C when complete).                                                                                      |
| [`harvey-lab-pause-handoff.md`](harvey-lab-pause-handoff.md)                                               | **Pause/resume** for LAB × ClawQL (GHA + OpenRouter + Arm C).                                                                                                    |
| [`harvey-lab-action-plan.md`](harvey-lab-action-plan.md)                                                   | Reconciles the August 2026 Cursor action plan with shipped overlay.                                                                                              |
| [`harvey-lab-stack-lineage.md`](harvey-lab-stack-lineage.md)                                               | **Stack versions** — `python-duckdb-v1` (quarantined) vs `ts-clawql-data-v2` (current). Trace taint matrix.                                                      |
| [`harvey-lab-rules-compliance.md`](harvey-lab-rules-compliance.md)                                         | **LAB rules audit** — CONTRIBUTING / eval / peer (Trajectory) checklist for ClawQL arms.                                                                         |
| [`harvey-lab-ts-v2-smoke-gate.md`](harvey-lab-ts-v2-smoke-gate.md)                                         | **Operator checklist + Mac mini MLX paste guide** — quarantine → build → task 001 Node DuckDB gate → contiguous 001–025.                                         |
| [`../homelab/personal-agent-hermes-cline.md`](../homelab/personal-agent-hermes-cline.md)                   | **Personal agent** — Hermes/Ornith orchestrator + Cline/Nemotron executor on Mac Mini (ATR, WORM, Telegram); related to but distinct from LAB smoke.             |
| [`extractbench-clawql-results.md`](extractbench-clawql-results.md)                                         | ExtractBench × ClawQL IDP results ledger (long-doc completeness).                                                                                                |
| [`extractbench-action-plan.md`](extractbench-action-plan.md)                                               | ExtractBench × ClawQL IDP run plan and publishability bar.                                                                                                       |
| [`../inference/clawql-inference-training-pipeline.md`](../inference/clawql-inference-training-pipeline.md) | Post-LAB fine-tune flywheel (optional after ledger; Arm C skips blocking fine-tune).                                                                             |
| [`ouroboros-value-evidence.md`](ouroboros-value-evidence.md)                                               | **Evidence:** Ouroboros on converges vs off strategy thrash (verified A/B).                                                                                      |
| [`openbench-ouroboros-oscillation.md`](openbench-ouroboros-oscillation.md)                                 | Ouroboros oscillation-escape task design, caps, repro.                                                                                                           |
| [`openbench-github-actions.md`](openbench-github-actions.md)                                               | One-off Actions A/B (clawql-on vs off) — spin up, report, spin down.                                                                                             |

---

## Active experiment folders

| Path                                                                   | Scenario                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`all-providers-complex-workflow/`](all-providers-complex-workflow/)   | Largest cross-provider planning-context run (stats + markdown).         |
| [`multi-provider-complex-workflow/`](multi-provider-complex-workflow/) | Default multi-provider (GKE + Cloudflare + Jira mix) stats + narrative. |
| [`gcp-multi-service-mcp-workflow/`](gcp-multi-service-mcp-workflow/)   | GCP multi-service MCP workflow outputs.                                 |
| [`response-examples/`](response-examples/)                             | Small JSON snippets (e.g. Jira, Google, Cloudflare) for docs and tests. |

---

## Archive

| Path                                     | Use                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`archive/README.md`](archive/README.md) | Index of older run notes (GCP multi, multi-provider, Cloud Run GraphQL, Jira token experiments). |

---

## Parent indexes

- **All documentation:** [`../README.md`](../README.md)
- **Workflow JSON at repo root:** same directory as `docs/README.md` — see **Workflow artifacts** there (`workflow-*-latest.json`).
