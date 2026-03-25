# Experiment: Multi-provider complex workflow token savings

This benchmark compares:

- **Before:** embedding all loaded provider specs for the workflow (Google top50 Discovery + Cloudflare OpenAPI + Jira OpenAPI)
- **After:** using the emitted workflow output captured in `multi-provider-test.md`

It mirrors the existing benchmark heuristic of **`approxTokens = ceil(bytes / 4)`**.

## Run context

- Source report: `docs/workflow-multi-provider-latest.json`
- Captured output: `multi-provider-test.md`
- Generated at: `2026-03-24T06:46:51.802Z`
- Merged operation count: `7174`
- Provider operations: `google=4141`, `cloudflare=2697`, `jira=336`

## Savings summary

| Metric | Value |
|---|---|
| Total loaded spec bytes | `40,835,581` bytes (~`10,208,896` tok) |
| Workflow output bytes | `47,374` bytes (~`11,844` tok) |
| Approx tokens saved | `10,197,052` |
| Reduction | `99.88%` |
| Compression ratio (before/after) | `861.98x` |

## Hypothetical naive workflow (full spec in context)

See `hypotheticalNaiveFullSpecInContext` in [`experiment-multi-provider-complex-workflow-stats.json`](experiment-multi-provider-complex-workflow-stats.json) for the same **14-query** run with:

- **Variant A:** each provider corpus loaded **once** when switching vendor (**~10.2M** spec tokens total).
- **Variant B:** full active-provider spec on **every** of the 14 model turns (**~50.7M** spec-input tokens, spec-only).

## Spec size breakdown

| Source | Bytes | ~Tokens |
|---|---:|---:|
| Google top50 Discovery | `20,523,053` | `5,130,764` |
| Cloudflare OpenAPI | `19,065,452` | `4,766,363` |
| Jira OpenAPI | `1,247,076` | `311,769` |
| **Total** | **`40,835,581`** | **`10,208,896`** |

## Workflow output profile

| Metric | Value |
|---|---|
| Search steps | `5` |
| Search queries | `14` |
| Output file | `multi-provider-test.md` |
| Output size | `47,374` bytes |

## Notes

- This is a **planning-context** comparison (spec corpus vs workflow output), not a REST-vs-GraphQL response-body benchmark.
- Token counts are rough estimates using the repository standard `chars/4` heuristic.
- Structured stats source: `experiment-multi-provider-complex-workflow-stats.json`.
