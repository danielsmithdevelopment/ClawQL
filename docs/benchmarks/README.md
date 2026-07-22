# Benchmarks and experiment artifacts

This directory holds **repro instructions**, **latest pointers**, **per-scenario write-ups and stats**, and **archived one-off runs**. Planning-context token math uses **`ceil(bytes / 4)`** unless a note says otherwise (see repo [README](../../README.md)).

---

## Start here

| Document                       | Use                                                            |
| ------------------------------ | -------------------------------------------------------------- |
| [`REPRODUCE.md`](REPRODUCE.md) | Step-by-step commands to regenerate benchmark numbers locally. |
| [`latest.md`](latest.md)       | Pointer to the newest consolidated benchmark artifacts.        |
| [`latest.json`](latest.json)   | Machine-readable latest summary (when present).                |
| [`openbench.md`](openbench.md) | OpenBench harness adoption (adapter + ClawQL-specific tasks).  |

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
