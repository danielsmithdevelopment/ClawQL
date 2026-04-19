# Case studies

Real-world ClawQL usage with concrete workflows, reproduction steps, and **token/context** comparisons.

| Study                                                                                                      | Focus                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GitHub provider — `danielsmithdevelopment/ClawQL`](github-provider-danielsmithdevelopment-clawql.md)      | Listing commits and updating repo description via MCP `search` / `execute`; planning-context savings vs pasting the full GitHub OpenAPI bundle.                                                                  |
| [Cloudflare docs site — `docs.clawql.com` MCP workflow](cloudflare-docs-site-mcp-workflow.md)              | End-to-end deploy of the docs Worker with `search` / `execute` / `memory_recall` / `memory_ingest`; Workers `fs` limits, token scopes, failures.                                                                 |
| [Vault memory + GitHub session — ingest, issues, audit (Apr 2026)](vault-memory-github-session-2026-04.md) | Large `memory_ingest` batch, GitHub triage (#39→#69, #88–#91), prioritization, and shipping optional **`audit`** ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)) with docs/Helm/site wiring. |

Token estimates use **`ceil(bytes / 4)`** to approximate tokens (same convention as [`README.md`](../README.md) benchmark notes).
