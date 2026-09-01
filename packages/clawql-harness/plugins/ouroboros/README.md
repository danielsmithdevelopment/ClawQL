# Ouroboros harness plugin

`createOuroborosHarnessPlugin` / `OuroborosPlugin` is the **sole** ClawQL enablement surface for Ouroboros tools:

- `clawql_think` + Wonder/Reflect evaluate hooks (stagnation / personas)
- `ouroboros_create_seed_from_document`, `ouroboros_run_evolutionary_loop`, `ouroboros_get_lineage_status`, `ouroboros_measure_drift` (and Langfuse propose when opted in)

Tool implementations are shared with `clawql-ouroboros` (`buildOuroborosMcpToolDefinitions`). MCP loads this plugin via `makeHarnessLayer` — not via a parallel `makeOuroborosLayer` path.
