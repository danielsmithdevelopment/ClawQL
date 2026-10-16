# Lazy horizontal plugin — first-hit cost + fail-closed imports

Artifacts: [`lazy-plugin-first-hit.json`](./lazy-plugin-first-hit.json),
[`lazy-plugin-first-request.json`](./lazy-plugin-first-request.json)  
Probes: `scripts/benchmarks/lazy-plugin-first-hit.mjs`,
`scripts/benchmarks/lazy-plugin-first-request.mjs`

## First-hit costs

| Package / path | First cost | Warm | Notes |
| --- | ---: | ---: | --- |
| `clawql-memory/plugin` require | ~646 ms | cached | Pulls ONNX / embedding graph when memory is **on** |
| `memory_ingest` first MCP call | **~189 ms** | ~143 ms | ONNX already mapped at Ready when memory enabled |
| `clawql-automation/plugin` require | ~39 ms | ~0 | Workflow tools appear; **k8s maps stay false** |
| `@kubernetes/client-node` dynamic import | **~363 ms** | ~0.03 ms | Admission surface present (~880 exports) |
| `clawql-payments/plugin` require | ~176–359 ms | cached | Stripe |
| `clawql-data/plugin` require | ~44–54 ms | cached | DuckDB |

Operator / Kubernetes path: enabling workflow loads `clawql-automation` at Ready but
does **not** map `@kubernetes/client-node` until first `getWorkflowK8sClients()` /
workflow tool use (~363 ms one-time).

## Fail-closed imports

Failed imports do **not** leave a half-working feature:

| Case | Result |
| --- | --- |
| Missing package | `MODULE_NOT_FOUND` / “Cannot find module …” |
| Bad plugin subpath | `ERR_PACKAGE_PATH_NOT_EXPORTED` |
| Sync composer | No try/catch around `require` — flag-on + missing plugin **aborts listen** |

## Same-run memory gaps (smoke N=5 — corrected)

Do **not** mix ClawQL’s new plateau with MCPJungle’s earlier ~86 MB underload number.
Same-run smoke (`clawql_known_op` + MJ + AG, tree smaps):

| Arm | RSS | **Anonymous** | PSS | Gap vs ClawQL anon |
| --- | ---: | ---: | ---: | ---: |
| `clawql_known_op` | 166.6 | **116.5** | 119.7 | — |
| MCPJungle tree | 111.6 | **43.7** | 66.4 | **~73 MB** |
| agentgateway tree | 180.7 | **67.7** | 93.4 | **~49 MB** |

ClawQL’s own drop (~630 → ~112–117) is unchanged; the peer gap is wider than a
mixed-run “~26 MB vs old MJ 86” line suggested.
