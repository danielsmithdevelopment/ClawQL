# Governance / policy-depth (v2 — fair columns)

Equal-arm vault-write board with **two fair columns**, then **design cells** for the category claim.

**Live board:** [clawql.com/benchmarks#governance](https://clawql.com/benchmarks/#governance)

| Artifact                                         | Role                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [`FAIRNESS.md`](./FAIRNESS.md)                   | Why v1 was asymmetric; v2 columns + design cells                                                      |
| [`results-smoke.json`](./results-smoke.json)     | Smoke (includes clawql_default + clawql_configured)                                                   |
| [`results-obot.json`](./results-obot.json)       | Obot **defaults** peer                                                                                |
| [`results-bifrost.json`](./results-bifrost.json) | Bifrost **defaults** (allow-all VK)                                                                   |
| [`results-cells.json`](./results-cells.json)     | Executor cells (pause + harness resume probe)                                                         |
| Harness                                          | [`scripts/benchmarks/governance-policy-depth/`](../../../scripts/benchmarks/governance-policy-depth/) |

## Defaults column (fair)

No tool-specific deny for `memory_ingest`.

| Arm                | security_score | Notes                                   |
| ------------------ | -------------- | --------------------------------------- |
| **clawql_default** | **2/5**        | Stock — no `BLOCK_TOOLS` (contaminates) |
| passthrough        | **2/5**        | OVERRIDE written                        |
| **obot**           | **2/5**        | Default mcp-connect                     |
| **bifrost**        | **2/5**        | Allow-all VK                            |

## Best-config column (expect ties)

Each product’s recommended deny for the same tool.

| Arm                     | security_score | Notes                                              |
| ----------------------- | -------------- | -------------------------------------------------- |
| **clawql_configured**   | **5/5**        | `CLAWQL_PANGUARD_BLOCK_TOOLS=memory_ingest`        |
| obot_deny               | pending        | `OBOT_MCP_URL_DENY` — expected 5/5                 |
| bifrost_vk_deny         | pending        | `BIFROST_MCP_URL_DENY` — expected 5/5              |
| executor_policies_block | pending        | `EXECUTOR_MCP_URL_BLOCK` — expected 5/5 on fixture |

## Executor cells

```bash
npm run benchmark:governance-policy-depth:executor
```

| Cell                    | Notes                                                                             |
| ----------------------- | --------------------------------------------------------------------------------- |
| risky_write             | Executor **default** destructiveHint pause (fair)                                 |
| untrusted_read          | Poison + pause                                                                    |
| **resume_auto_approve** | **Harness** calls `resume accept` — self-approval _probe_, not stock auto-approve |

## Design cells (category claim)

See [`FAIRNESS.md`](./FAIRNESS.md): self-approval, arg digest swap, poison→allowed exfil, renamed routes. Plus multi-attack injection suite (“0 of N”).

## Related

- [dominance-roadmap.md](../dominance-roadmap.md) — criterion #7 governance
- [dominance-peers-wiring.md](../dominance-peers-wiring.md) — Obot / Bifrost recipes
