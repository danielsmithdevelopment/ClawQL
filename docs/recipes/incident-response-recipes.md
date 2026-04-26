# Incident Response Recipes

## 1) Fast Triage Loop

### Use case

A production issue is active and you need rapid diagnosis.

### Steps

1. `memory_recall` for similar historical incidents.
2. `search` for diagnostics operations.
3. `execute` read/list/get calls to inspect live state.
4. `audit.append` key checkpoints (`identified`, `mitigated`, `validated`).
5. `notify` incident channel updates.

---

## 2) Hypothesis-Driven Debugging

### Use case

You have multiple possible root causes and need structured testing.

### Steps

1. Record hypotheses in `cache` (ephemeral list).
2. For each hypothesis:
   - run one targeted `search`/`execute` probe
   - record outcome in `audit.append`
3. Promote winning hypothesis to action.
4. `memory_ingest` final RCA and fix.

---

## 3) Rollback + Confirmation

### Use case

A recent change appears to have caused regression.

### Steps

1. Validate symptom with read calls.
2. Execute rollback action.
3. Re-run validation reads.
4. `notify` rollback status and owner.
5. `memory_ingest` incident timeline.

---

## 4) Post-Incident Knowledge Capture

### Use case

Incident resolved; you need durable lessons.

### Steps

1. Compile timeline from `audit` and run outputs.
2. `memory_ingest` with:
   - summary
   - root cause
   - mitigation
   - follow-up tasks
3. Add `wikilinks` to related systems and runbooks.

---

## 5) Repeat Failure Pattern Detection

### Use case

The same class of issue recurs over time.

### Steps

1. `memory_recall` with symptom keywords.
2. Cluster prior incidents by shared components.
3. Build preventive checklist.
4. Store checklist as durable note via `memory_ingest`.
