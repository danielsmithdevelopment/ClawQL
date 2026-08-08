# Benchmarks and experiment artifacts

This directory holds **repro instructions**, **latest pointers**, **per-scenario write-ups and stats**, and **archived one-off runs**. Planning-context token math uses **`ceil(bytes / 4)`** unless a note says otherwise (see repo [README](../../README.md)).

---

## Start here

| Document                                                                   | Use                                                                         |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`REPRODUCE.md`](REPRODUCE.md)                                             | Step-by-step commands to regenerate benchmark numbers locally.              |
| [`latest.md`](latest.md)                                                   | Pointer to the newest consolidated benchmark artifacts.                     |
| [`latest.json`](latest.json)                                               | Machine-readable latest summary (when present).                             |
| [`openbench.md`](openbench.md)                                             | OpenBench harness adoption (adapter + ClawQL-specific tasks).               |
| [`openbench-stack-coverage.md`](openbench-stack-coverage.md)               | **Whole-stack** OpenBench coverage map + benchmark backlog.                 |
| [`openbench-results-ledger.md`](openbench-results-ledger.md)               | **Full live A/B scoreboard + run diary** (update after every matrix).       |
| [`openbench-task-explanations.md`](openbench-task-explanations.md)         | **Thorough prove / why / how** for every verified OpenBench task.           |
| [`openbench-advanced-suites.md`](openbench-advanced-suites.md)             | **Next-gen suites (B-1…B-7)** broken into small tasks, phases, and gates.   |
| [`openbench-advanced-specs.md`](openbench-advanced-specs.md)               | Advanced suites B-1…B-7 (specs; Phase 1 offline packs).                     |
| [`openbench-b7-calderwood.md`](openbench-b7-calderwood.md)                 | **B-7** Harvey/EngramLab C&H institutional knowledge + amortization.        |
| [`harvey-lab-baseline.md`](harvey-lab-baseline.md)                         | Harvey LAB **firm-knowledge** baseline (standard harness).                  |
| [`harvey-lab-clawql-results.md`](harvey-lab-clawql-results.md)             | Harvey LAB × ClawQL two-arm ledger (Opus vs Opus when complete).            |
| [`ouroboros-value-evidence.md`](ouroboros-value-evidence.md)               | **Evidence:** Ouroboros on converges vs off strategy thrash (verified A/B). |
| [`openbench-ouroboros-oscillation.md`](openbench-ouroboros-oscillation.md) | Ouroboros oscillation-escape task design, caps, repro.                      |
| [`openbench-github-actions.md`](openbench-github-actions.md)               | One-off Actions A/B (clawql-on vs off) — spin up, report, spin down.        |

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
