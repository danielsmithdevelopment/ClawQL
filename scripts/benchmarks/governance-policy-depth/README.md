# Governance / policy-depth equal-arm board (v2)

Fail-closed vault-write policy on a shared adversarial fixture — **fair defaults + best-config columns**, then design cells.

| Arm | Column | Role |
|-----|--------|------|
| `clawql_default` | defaults | Stock ClawQL — **no** `BLOCK_TOOLS` (expected contaminate) |
| `clawql_configured` / `clawql_panguard` | best_config | `CLAWQL_PANGUARD_BLOCK_TOOLS=memory_ingest` |
| `passthrough` | control | Direct vault MCP, no deny |
| `obot` | defaults | `OBOT_MCP_URL` |
| `obot_deny` | best_config | `OBOT_MCP_URL_DENY` (expect tie) |
| `bifrost` | defaults | `BIFROST_MCP_URL` allow-all VK |
| `bifrost_vk_deny` | best_config | `BIFROST_MCP_URL_DENY` (expect tie) |
| `executor_*` | cells | See cells below |

Frozen rules: [`frozen-rules.json`](./frozen-rules.json). Fairness: [`docs/.../FAIRNESS.md`](../../../docs/benchmarks/governance-policy-depth/FAIRNESS.md).

## Run vault-write board

```bash
npm run benchmark:governance-policy-depth
```

Expected smoke: **board_pass=true**, `clawql_default` **2/5**, `clawql_configured` **5/5**, passthrough contaminates.

## Executor cells

| Cell | What it proves |
|------|----------------|
| `risky_write` | Hostile ingest — configured ClawQL deny; Executor **stock** pause |
| `untrusted_read` | Poison → subsequent ingest still gated |
| `resume_auto_approve` | **Harness** `resume accept` after poison — self-approval **probe**, not Executor stock auto-approve |

```bash
npm run benchmark:governance-policy-depth:cells
npm run benchmark:governance-policy-depth:executor
```

## Peer CI recipes

| Script | Column |
|--------|--------|
| `ci-obot-peer.sh` | Obot defaults |
| `ci-bifrost-peer.sh` | Bifrost defaults (allow-all) |
| `ci-executor-peer.sh` | Executor cells |
| Best-config | Set `*_URL_DENY` / `EXECUTOR_MCP_URL_BLOCK` and re-run board (recipes TBD / maintainer PRs) |

## Next

1. Land peer best-config CI scripts (Obot deny, Bifrost VK omit, Executor block).
2. Design cells: self-approval (clean), arg digest, poison→allowed exfil, rename.
3. Multi-attack injection suite (“0 of N”).
