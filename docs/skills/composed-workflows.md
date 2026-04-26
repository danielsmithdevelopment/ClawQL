# Composed MCP Workflows

Reusable end-to-end recipes that combine multiple ClawQL MCP tools.

## 1) Safe API Change Rollout

Use when you need to modify external systems with low risk.

### Steps

1. `search` to discover candidate operations.
2. `execute` a read operation first (`get`/`list`) to confirm current state.
3. `execute` the mutation operation with minimal required args.
4. `execute` a read operation again for post-change verification.
5. `notify` success/failure summary to team channel.
6. `memory_ingest` final decision and outcomes.

### Why this works

- Prevents blind writes.
- Produces an explicit before/after trail.

---

## 2) Incident Triage to Durable Postmortem

Use for failures, outages, regressions, and high-severity bugs.

### Steps

1. `memory_recall` for prior incidents and known fixes.
2. `search`/`execute` for live diagnostics.
3. `audit.append` at key triage checkpoints.
4. `notify` incident updates (threaded).
5. `memory_ingest` postmortem summary with evidence links.

### Why this works

- Keeps responders aligned in real time.
- Preserves durable lessons after the incident closes.

---

## 3) Knowledge-Grounded Automation

Use when actions must be based on enterprise source material.

### Steps

1. `knowledge_search_onyx` to gather relevant evidence.
2. Summarize evidence and identify required action.
3. `execute` required API operations.
4. `notify` completion with references.
5. `memory_ingest` outcome and citation summary.

### Why this works

- Reduces guesswork and hallucinated rationale.
- Creates traceable decision history.

---

## 4) Synthetic Monitoring Loop

Use for recurring health checks and early failure detection.

### Steps

1. `schedule.create` synthetic check job.
2. `schedule.trigger` with `dry_run: true` to validate assertions.
3. Enable recurring cadence.
4. On failure, `notify` incident channel.
5. `memory_ingest` recurring failure patterns and remediation notes.

### Why this works

- Validates checks before enabling noise in production.
- Converts repeated alerts into durable operational knowledge.

---

## 5) Research and Planning Session

Use for feature design, migrations, and roadmap shaping.

### Steps

1. `memory_recall` for prior decisions and context.
2. Use `cache` for temporary option scoring and scratch.
3. `search`/`execute` to verify feasibility assumptions.
4. `memory_ingest` selected approach and rationale.

### Why this works

- Keeps scratch ephemeral.
- Preserves only final, high-signal decisions.

---

## 6) Document Ingestion and Normalization Cycle

Use when importing new knowledge sources for downstream recall.

### Steps

1. `ingest_external_knowledge` with `dryRun: true`.
2. Validate path/scope and content shape.
3. Re-run with `dryRun: false`.
4. `memory_recall` spot-check discoverability.
5. `memory_ingest` ingest summary (source, scope, caveats).

### Why this works

- Avoids accidental noisy imports.
- Confirms imported data is actually usable in recall workflows.

---

## 7) Spec-First Iterative Orchestration (Ouroboros)

Use when requirements are ambiguous and need iterative convergence.

### Steps

1. `ouroboros_create_seed_from_document` from input spec/context.
2. `ouroboros_run_evolutionary_loop` with bounded generations.
3. `ouroboros_get_lineage_status` to inspect outputs and convergence.
4. If converged, `notify` and persist via `memory_ingest`.
5. If not converged, refine seed constraints and rerun.

### Why this works

- Makes iteration explicit and inspectable.
- Preserves lineage for audit and reproducibility.

---

## Operational Guardrails

- Use `search` before `execute` unless operationId is already validated.
- Treat `cache` and `audit` as ephemeral; use `memory_ingest` for durable records.
- Keep notify messages actionable: status, owner, next step, link.
- Keep imported/injected knowledge scoped and reviewable.
- Separate "what is shipped" from "roadmap intent" in final notes.
