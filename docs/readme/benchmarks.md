# ClawQL Benchmarks and Case Studies

This page centralizes benchmark and workflow evidence that used to be embedded directly in the root README.

## Benchmark Philosophy

The headline token numbers compare planning-context size:

- full merged specs on disk, versus
- compact workflow/search artifacts

These are context-size comparisons, not direct per-call provider invoices.

## Primary Benchmark Artifacts

### All-providers complex workflow

- Stats JSON: `docs/benchmarks/all-providers-complex-workflow/experiment-all-providers-complex-workflow-stats.json`
- Write-up: `docs/benchmarks/all-providers-complex-workflow/experiment-all-providers-complex-workflow.md`
- Workflow output: `docs/workflows/workflow-complex-release-stack-latest.json`

### Default multi-provider complex workflow

- Stats JSON: `docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow-stats.json`
- Write-up: `docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow.md`
- Workflow output: `docs/workflows/workflow-multi-provider-latest.json`

### Token benchmark reproduction

- Latest outputs: `docs/benchmarks/latest.json`, `docs/benchmarks/latest.md`
- Reproduction guide: `docs/benchmarks/REPRODUCE.md`

## Case Studies

- Index: `docs/case_studies/README.md`
- Cloudflare docs site workflow: `docs/case_studies/cloudflare-docs-site-mcp-workflow.md`
- TrueNAS homelab case study: `docs/case_studies/truenas-scale-corgicave-homelab-networking-ssh-case-study-2026-04.md`
- Worker 1102 incident postmortem: `docs/case_studies/docs-clawql-worker-1102-mcp-memory-2026-04.md`

## Related Notes

- Website caching decisions: `docs/website/website-caching.md`
- Performance and Workers guardrails: `docs/website/website-performance-workers-guardrails.md`
