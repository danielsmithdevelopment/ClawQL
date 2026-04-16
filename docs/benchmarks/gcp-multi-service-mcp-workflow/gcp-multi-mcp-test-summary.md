# GCP Multi-Spec MCP Test Summary

One-page reference for the latest real-stdio MCP integration run.

- **Run command:** `npm run workflow:gcp-multi`
- **Report generated at:** `2026-03-23T05:22:54.608Z`
- **Transport:** MCP stdio (`node dist/server.js`)
- **Spec mode:** `CLAWQL_GOOGLE_TOP50_SPECS=1` + `CLAWQL_BUNDLED_OFFLINE=1`
- **Merged index size:** `TBD` operations from `50` Google Discovery specs
- **Search calls executed:** `11` (`1` cross-cutting + `10` workflow-step queries)
- **Tool-call status:** all returned `isError: false`

## Original Cross-Cutting Query

```text
enable APIs batch GKE cluster firewall logging monitoring DNS bucket BigQuery
```

Top 5 operations returned:

1. `container.projects.zones.clusters.monitoring`
2. `container.projects.zones.clusters.logging`
3. `logging.locations.buckets.createAsync`
4. `logging.locations.buckets.create`
5. `logging.projects.locations.buckets.createAsync`

## Workflow-Step Top Results

Top-1 per step from the same run:

| Step                              | Top operationId                                | specLabel                 |
| --------------------------------- | ---------------------------------------------- | ------------------------- |
| 0. Service Usage — enable APIs    | `serviceusage.services.batchEnable`            | `serviceusage-v1`         |
| 1. Resource Manager — project IAM | `cloudresourcemanager.projects.setIamPolicy`   | `cloudresourcemanager-v3` |
| 2. Networking & firewall          | `compute.regionNetworkFirewallPolicies.insert` | `compute-v1`              |
| 3. GKE cluster                    | `container.projects.zones.clusters.locations`  | `container-v1`            |
| 4. Logging                        | `logging.sinks.create`                         | `logging-v2`              |
| 5. Monitoring                     | `monitoring.folders.timeSeries.list`           | `monitoring-v3`           |
| 6. Load balancing (Compute)       | `compute.backendServices.getHealth`            | `compute-v1`              |
| 7. Cloud DNS                      | `dns.resourceRecordSets.create`                | `dns-v1`                  |
| 8. Cloud Storage                  | `storage.buckets.getIamPolicy`                 | `storage-v1`              |
| 9. BigQuery                       | `bigquery.tabledata.insertAll`                 | `bigquery-v2`             |

Distinct `specLabel`s represented in step top-1s: **9**.

## Token/Size Outcome (Heuristic)

From `docs/experiment-gcp-multi-mcp-stats.json`:

| Metric                                    | Value                                      |
| ----------------------------------------- | ------------------------------------------ |
| Raw Discovery payload (20 files total)    | `11,157,299` bytes (~`2,789,325` tokens\*) |
| Sum of 11 `search` response text payloads | `120,780` bytes (~`30,195` tokens\*)       |
| Relative size reduction                   | **~92.4x smaller**                         |

\* Token estimate uses `ceil(bytes / 4)` and is intentionally approximate.

## Reference Artifacts

- **Full MCP call results (all raw `CallToolResult` content):** `docs/workflow-gcp-multi-latest.json`
- **Detailed experiment write-up:** `docs/experiment-gcp-multi-mcp-workflow.md`
- **Machine-readable stats:** `docs/experiment-gcp-multi-mcp-stats.json`
- **Stats refresh command:** `npm run report:gcp-multi-experiment`
