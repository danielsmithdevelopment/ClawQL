# Experiment: All-providers complex workflow (planning-context savings)

This benchmark compares:

- **Before:** embedding **all** loaded provider specs for the **`CLAWQL_PROVIDER=all-providers`** merge (Google top50 Discovery + Bitbucket, Cloudflare, GitHub, Jira, n8n, Sentry, Slack OpenAPI on disk)
- **After:** the committed structured report [`docs/workflow-complex-release-stack-latest.json`](../../workflow-complex-release-stack-latest.json) from `npm run workflow:complex-release-stack`

It uses the same heuristic as the multi-provider experiment: **`approxTokens = ceil(bytes / 4)`**.

## Run context

- Source report: `docs/workflow-complex-release-stack-latest.json`
- Stats: [`experiment-all-providers-complex-workflow-stats.json`](experiment-all-providers-complex-workflow-stats.json) (refresh with `npm run report:all-providers-benchmark`)
- Generated at: `2026-03-24T23:32:21.515Z`
- Merged operation count: `8990`
- Provider operations: `google=4141`, `bitbucket=262`, `cloudflare=2706`, `github=1099`, `jira=336`, `n8n=59`, `sentry=215`, `slack=172`

## Savings summary

| Metric | Value |
|---|---|
| Total loaded spec bytes | `55,475,059` bytes (~`13,868,765` tok) |
| Workflow JSON bytes | `144,764` bytes (~`36,191` tok) |
| Approx tokens saved | `13,832,574` |
| Reduction | `99.74%` |
| Compression ratio (before/after) | `383.21x` |

## Spec size breakdown

| Source | Bytes | ~Tokens |
|---|---:|---:|
| Google top50 Discovery | `20,523,053` | `5,130,764` |
| Vendor OpenAPI (7 bundles) | `34,952,006` | `8,738,002` |
| **Total** | **`55,475,059`** | **`13,868,765`** |

## Workflow output profile

| Metric | Value |
|---|---|
| Search steps | `10` |
| Search queries | `29` |
| Unique candidate operations (top hits in draft) | `128` |

## Reproduce

```bash
npm run workflow:complex-release-stack
npm run report:all-providers-benchmark
```

`report:all-providers-benchmark` recomputes byte totals from `providers/` and the latest workflow JSON, then overwrites `experiment-all-providers-complex-workflow-stats.json`. Edit this markdown if narrative fields need to change.
