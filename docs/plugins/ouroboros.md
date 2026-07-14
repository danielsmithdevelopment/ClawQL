---
title: Ouroboros
description: Evolutionary loop MCP tools — seed documents, run loops, inspect lineage. CLAWQL_ENABLE_OUROBOROS=1.
slug: ouroboros
status: opt-in
package: clawql-ouroboros
order: 8
prev: sandbox
next: payments
---

# Ouroboros

**Plugin ID:** `clawql-ouroboros`  
**Package:** `packages/clawql-ouroboros` — `OuroborosPlugin`

Specification-first evolutionary loops with optional Postgres lineage storage.

## MCP tools

| Tool                                      | Purpose                                        |
| ----------------------------------------- | ---------------------------------------------- |
| **`ouroboros_create_seed_from_document`** | Create a Seed from an input document           |
| **`ouroboros_run_evolutionary_loop`**     | Run Wonder/Reflect → Executor/Evaluator cycles |
| **`ouroboros_get_lineage_status`**        | Inspect lineage and convergence state          |

## Enable

| Env                             | Default | Effect                                         |
| ------------------------------- | ------- | ---------------------------------------------- |
| **`CLAWQL_ENABLE_OUROBOROS=1`** | off     | Register `OuroborosPlugin` and all three tools |

Optional Postgres lineage: **`CLAWQL_OUROBOROS_DATABASE_URL`** or split **`CLAWQL_OUROBOROS_DB_*`** vars.

Eval webhook integration: **`CLAWQL_ENABLE_LANGFUSE_EVAL=1`** (requires Ouroboros on).

## Learn more

- [Ouroboros library](/ouroboros)
- [Ouroboros tools walkthrough](/learn/ouroboros-tools)
- [clawql-ouroboros.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/ouroboros/clawql-ouroboros.md)
