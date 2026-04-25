# ADR 0001: Ouroboros workflow engine (in-process orchestrator)

- Status: Accepted
- Date: 2026-04-23
- Related: [#110](https://github.com/danielsmithdevelopment/ClawQL/issues/110), [#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141), [#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142), [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)

## Context

ClawQL needs a workflow orchestrator path for multi-step work while keeping the existing
single-step `search` + `execute` path fast and simple. The product direction is an
in-process TypeScript Ouroboros loop (no additional service), with durable lineage in
Postgres when configured, and a feature flag to keep rollout controlled.

## Decision

### 1) Routing model

- Default request path remains direct `search` / `execute`.
- Ouroboros is selected only when workflow semantics require retries/evolution (for example,
  failed acceptance criteria, ambiguous outputs, or explicitly requested loop execution).
- Routing is internal; there is no user-visible "mode" toggle at runtime.
- MCP surface remains explicit and stable through `ouroboros_*` tools when enabled.

### 2) Seed contract

- Seed shape is owned by `clawql-ouroboros` (`SeedSchema` in package exports).
- Required core fields: goal, task type, brownfield context, constraints, acceptance criteria,
  ontology schema, evaluation principles, and exit conditions.
- Metadata carries lineage (`seed_id`, optional `parent_seed_id`) and execution context.
- Any transport-level callers (stdio, HTTP, gRPC) must pass payloads that validate against
  `SeedSchema` before loop execution.

### 3) Persistence model

- Event storage is append-only.
- With `CLAWQL_OUROBOROS_DATABASE_URL` (or split `CLAWQL_OUROBOROS_DB_*` vars), ClawQL uses
  Postgres table `clawql_ouroboros_events` for durable lineage.
- Without Postgres configuration, runtime falls back to in-memory event storage for local/dev.
- Lineage status is rebuilt from events and exposed via `ouroboros_get_lineage_status`.

### 4) Feature flag and rollout

- `CLAWQL_ENABLE_OUROBOROS=1` registers:
  - `ouroboros_create_seed_from_document`
  - `ouroboros_run_evolutionary_loop`
  - `ouroboros_get_lineage_status`
- Flag defaults off.
- Postgres persistence is optional and independently configured from the enable flag.

## Consequences

### Positive

- Fast path stays low latency for one-shot API workflows.
- Multi-generation workflows gain durable lineage and reproducibility.
- Architecture remains deploy-simple (single process) while supporting richer orchestration.

### Trade-offs

- Two execution paths require clear routing heuristics and observability.
- Default Wonder/Reflect/Executor/Evaluator remain intentionally minimal until more domain
  integrations are added.
- Postgres-backed lineage introduces operational dependencies in production deployments.

## Notes for implementation phases

- Phase 1 (`#110`): this ADR defines routing, seed contract, schema, and feature-flag model.
- Phase 2 (`#141`, `#142`): vertical slice behind `CLAWQL_ENABLE_OUROBOROS`, optional Postgres.
- Phase 3 (follow-up under `#110`): richer executor wiring to real `search` / `execute` flows
  and optional `notify` integration (`#77`) for workflow signals.
