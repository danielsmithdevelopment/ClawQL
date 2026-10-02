---
title: Ouroboros
description: Evolutionary loop MCP tools via clawql-harness — opt-in as of 8.0 (CLAWQL_ENABLE_OUROBOROS_TOOLS). Optional Postgres lineage; Langfuse eval opt-in.
slug: ouroboros
status: shipped
package: clawql-harness
order: 9
prev: data
next: payments
---

# Ouroboros

**Plugin ID:** `clawql-harness` (Ouroboros harness)  
**Packages:** `packages/clawql-harness` — `createOuroborosHarnessPlugin` / `makeHarnessLayer`; library `packages/clawql-ouroboros`

Specification-first evolutionary loops with optional Postgres lineage storage. In **`clawql-mcp`**, agent-facing tools are **opt-in as of 8.0** — set **`CLAWQL_ENABLE_OUROBOROS_TOOLS=1`** or instance/tier `ouroboros.enabled: true` to register them through the harness. Default **off**: no additive agent-loop proof yet vs a working baseline (same bar applied to PageIndex / CodeGraph). This is a **demotion, not a purge** — the `clawql-ouroboros` / `clawql-harness` packages and server-side Ouroboros capability lifecycle stay regardless of this flag. **`CLAWQL_ENABLE_OUROBOROS`** (old name) is **deleted** — it was never a registration gate and is not resurrected; the new gate is **`CLAWQL_ENABLE_OUROBOROS_TOOLS`**.

## MCP tools

| Tool                                      | Purpose                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **`clawql_think`**                        | Structured planning / reflection helper                                                              |
| **`ouroboros_create_seed_from_document`** | Create a Seed from an input document                                                                 |
| **`ouroboros_run_evolutionary_loop`**     | Run Wonder/Reflect → Executor/Evaluator cycles                                                       |
| **`ouroboros_get_lineage_status`**        | Inspect lineage and convergence state                                                                |
| **`ouroboros_measure_drift`**             | 3-component drift vs root Seed ([#557](https://github.com/danielsmithdevelopment/ClawQL/issues/557)) |

## Registration and lineage

| Env / Helm                                                                       | Default           | Effect                                                                                                   |
| -------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| **`CLAWQL_ENABLE_OUROBOROS_TOOLS=1`** or instance/tier `ouroboros.enabled: true` | off               | `makeHarnessLayer(createOuroborosHarnessPlugin)` registers the tools above — Helm: **`enableOuroboros`** |
| **`CLAWQL_ENABLE_OUROBOROS`** (old name)                                         | _(deleted)_       | Never a registration gate; not resurrected                                                               |
| **`CLAWQL_OUROBOROS_DATABASE_URL`** or **`CLAWQL_OUROBOROS_DB_*`**               | unset = in-memory | Durable Postgres events (`clawql_ouroboros_events`)                                                      |
| **`CLAWQL_ENABLE_LANGFUSE_EVAL=1`**                                              | off               | Langfuse eval → `ouroboros_propose_seed_revision_from_eval` (nested under the harness gate above)        |

Do **not** teach **`clawql-ouroboros/mcp-hooks`** as the **`clawql-mcp`** registration path (OK for embedding the library in your own MCP host).

## Learn more

- [Ouroboros library](/ouroboros)
- [Ouroboros tools walkthrough](/learn/ouroboros-tools)
- [clawql-ouroboros.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/ouroboros/clawql-ouroboros.md)
