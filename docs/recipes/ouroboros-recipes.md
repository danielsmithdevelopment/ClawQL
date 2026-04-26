# Ouroboros Recipes

## 1) Ambiguous Requirement to Converged Plan

### Use case

Requirements are underspecified and need iterative refinement.

### Steps

1. `ouroboros_create_seed_from_document`.
2. `ouroboros_run_evolutionary_loop` with small generation cap.
3. Inspect output quality and convergence.
4. Refine constraints/criteria and rerun if needed.
5. `memory_ingest` final converged approach.

---

## 2) Lineage Tracking for Review

### Use case

You need inspectable evidence of iteration path.

### Steps

1. Run loop with stable seed metadata.
2. Query `ouroboros_get_lineage_status`.
3. Extract generation summaries.
4. Attach lineage notes to review artifacts.

---

## 3) Execution Route Hint Recipe

### Use case

Default executor should route into internal ClawQL operations.

### Steps

1. Add route hints in seed context references.
2. Run loop.
3. Verify generation output includes expected route behavior.
4. Adjust hints and retry if routing misses intent.

---

## 4) Convergence Guardrail Recipe

### Use case

Loop keeps iterating without high-confidence completion.

### Steps

1. Tighten acceptance criteria.
2. Increase specificity of constraints.
3. Reduce scope of single loop run.
4. Rerun with bounded max generations.

---

## 5) Durable Lineage in Production

### Use case

Need lineage persistence beyond process lifetime.

### Steps

1. Configure Postgres-backed event storage.
2. Run production loops.
3. Query lineage status for diagnostics.
4. Capture post-run summary in vault notes.
