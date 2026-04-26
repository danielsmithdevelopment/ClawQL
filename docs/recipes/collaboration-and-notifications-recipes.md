# Collaboration and Notifications Recipes

## 1) Team Milestone Broadcast

### Use case

Keep stakeholders updated on major workflow milestones.

### Steps

1. Define milestone checkpoints.
2. Send `notify` at checkpoint completion.
3. Include links to issue, runbook, or artifact.
4. Post follow-ups in same thread.

---

## 2) Failure Escalation Message

### Use case

A check/workflow fails and needs fast owner assignment.

### Steps

1. Send `notify` with:
   - failure summary
   - impacted component
   - suggested owner
   - next action
2. Add recovery notification when resolved.

---

## 3) Async Handoff Recipe

### Use case

One engineer/session hands work to another.

### Steps

1. `memory_ingest` concise handoff note.
2. Send `notify` with note link and next actions.
3. Include blockers and assumptions explicitly.

---

## 4) Audit + Notify Pairing

### Use case

Need both machine-readable event trace and team visibility.

### Steps

1. `audit.append` for each major state transition.
2. `notify` for user-visible transitions (start/fail/recover).
3. `memory_ingest` end-of-run durable summary.

---

## 5) Weekly Ops Digest

### Use case

Provide recurring summary to operations channel.

### Steps

1. Collect week’s major runs/incidents.
2. Summarize high-signal outcomes.
3. Send one digest `notify`.
4. Store digest source in `memory_ingest`.
