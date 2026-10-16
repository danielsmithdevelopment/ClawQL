# Process trees for board memory (RSS / anon / PSS)

Every gateway arm is measured with a **/proc PPID walk** from the harness-spawned
root PID (`treeSmaps` / `treeProcessInventory` in `run-board.mjs`). The mock
upstream is **not** included (shared fixture, not part of the gateway).

## What each arm includes

| Arm | Root process | Must also include | Serves workflow how |
| --- | --- | --- | --- |
| `clawql_*` | `dist/server-http.js` | — (single process) | Catalog + search/execute in one Node listen |
| `mcpjungle` | `mcpjungle start` (Go) | `cf-rest-mcp.mjs` (Node stdio child) while session open | Go multiplexer + REST→MCP OpenAPI adapter |
| `agentgateway` | `agentgateway` | `cf-rest-mcp.mjs` (Node stdio child) | Same split; child usually persistent |
| `direct` | — | — | No gateway; raw HTTP to mock |
| `executor_v2` | (external Executor host) | not tree-sampled today | Hosted OpenAPI tools app |
| `cloudflare_codemode` | — | — | Tokens-only on board |

## MCPJungle idle vs session

| State | Processes | Typical anon |
| --- | --- | ---: |
| Idle (no MCP session) | Go only | ~10–14 MB |
| Stateful session (`tools/list`+) | Go + `cf-rest-mcp.mjs` | ~28 MB at list; **~44 MB** after short smoke load |
| Equal-arm underload (other harness, N=40k) | Go + fat catalog MCP | ~86 MB (not this board) |

**Do not** compare idle Go-only to ClawQL. Board/smoke samples **during** live
sessions; smoke plateau **43.7 MB anon** included the REST child (fair).

## Same-run smoke gaps (corrected)

| Arm | Anon median | Gap vs ClawQL |
| --- | ---: | ---: |
| `clawql_known_op` | 116.5 | — |
| MCPJungle (Go+REST) | 43.7 | **~73 MB** |
| agentgateway (gw+REST) | 67.7 | **~49 MB** |

## Live board inventory (2026-10-15 remasure)

While `clawql_default` was running (before MJ arm), observed trees:

| PID role | Example cmd | Notes |
| --- | --- | --- |
| Board harness | `node …/run-board.mjs` | Not in arm totals |
| Mock | `cloudflare-replay-mock.mjs` | Shared; excluded |
| ClawQL default/compact/program | `dist/server-http.js` ×3 | Separate listens |
| MCPJungle | `mcpjungle start …` | REST child appears when MJ session opens |
| agentgateway | `agentgateway -f …` | Child `cf-rest-mcp.mjs` already up |

Harness (this branch) attaches `processes` / `has_rest_mcp` on each memory sample
and warns if an aggregator sample is missing REST→MCP.
