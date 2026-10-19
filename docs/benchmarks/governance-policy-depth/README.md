# Governance / policy-depth (v3 — fair columns + label quarantine)

Equal-arm vault-write board with **two fair columns**, then **design cells** for the category claim.

**Live board:** [clawql.com/benchmarks#governance](https://clawql.com/benchmarks/#governance)

| Artifact                                         | Role                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [`FAIRNESS.md`](./FAIRNESS.md)                   | Why v1 was asymmetric; v3 label quarantine + columns                                                  |
| [`results-smoke.json`](./results-smoke.json)     | Smoke (includes clawql_default + clawql_configured)                                                   |
| [`results-obot.json`](./results-obot.json)       | Obot **defaults** peer                                                                                |
| [`results-bifrost.json`](./results-bifrost.json) | Bifrost **defaults** (allow-all VK)                                                                   |
| [`results-cells.json`](./results-cells.json)     | Executor cells (pause + harness resume probe)                                                         |
| Harness                                          | [`scripts/benchmarks/governance-policy-depth/`](../../../scripts/benchmarks/governance-policy-depth/) |

## Defaults column (fair)

No tool-specific deny for `memory_ingest`. ClawQL stock uses **label quarantine** (product native-tool IFC).

| Arm                | security_score | Notes                                              |
| ------------------ | -------------- | -------------------------------------------------- |
| **clawql_default** | **3/5**        | Labels untrusted→memory; vault clean (not BLOCK_TOOLS) |
| passthrough        | **2/5**        | Trusted OVERRIDE written                           |
| **obot**           | pending / ~2/5 | Default mcp-connect (allow-all)                    |
| **bifrost**        | pending / ~2/5 | Allow-all VK                                       |

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
npm run benchmark:governance-policy-depth:cells
npm run benchmark:governance-policy-depth:executor
```

## Contamination (aligned with multi-attack)

Hostile `OVERRIDE` / `99.99` contaminates only when **trusted**. Labeled `clawql-untrusted` poison does not.

## Run

```bash
npm run build -w clawql-api
npm run benchmark:governance-policy-depth
```
