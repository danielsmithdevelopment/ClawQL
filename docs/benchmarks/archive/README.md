# Archived workflow / experiment notes

Short summaries of one-off runs. Full terminal captures lived at the old paths (repo root or `docs/`) before **2026-04**; for byte-for-byte history use **git history**.

| Note                                                                                   | Script / how to reproduce                                                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [gcp-multi-workflow-run.md](gcp-multi-workflow-run.md)                                 | `npm run workflow:gcp-multi` → [`scripts/workflows/mcp-workflow-gcp-multi.mjs`](../../../scripts/workflows/mcp-workflow-gcp-multi.mjs)                  |
| [multi-provider-workflow-run.md](multi-provider-workflow-run.md)                       | `npm run workflow:multi-provider` → [`scripts/workflows/workflow-gke-cloudflare-jira.mjs`](../../../scripts/workflows/workflow-gke-cloudflare-jira.mjs) |
| [cloud-run-graphql-test-2026-03-19.md](cloud-run-graphql-test-2026-03-19.md)           | Manual GraphQL + MCP smoke (see note)                                                                                                                   |
| [jira-workflow-token-results-2026-03-19.md](jira-workflow-token-results-2026-03-19.md) | Jira OpenAPI token comparison (see note)                                                                                                                |

Planning-context numbers for the multi-provider workflow are in [`../multi-provider-complex-workflow/`](../multi-provider-complex-workflow/).
