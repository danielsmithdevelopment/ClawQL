# Monitoring and Schedule Recipes

## 1) Synthetic Health Check Bootstrap

### Use case

Create a first recurring service health check.

### Steps

1. `schedule.create` with `action.kind: "synthetic"`.
2. `schedule.trigger` with `dry_run: true`.
3. Fix assertions/URL if validation fails.
4. Enable regular cadence.

---

## 2) Failure Notification Loop

### Use case

You want automatic visibility when checks fail.

### Steps

1. Configure check schedule.
2. Configure `notify` channel strategy.
3. On failure, send concise `notify` message with runbook link.
4. `memory_ingest` recurring failure insights when pattern appears.

---

## 3) Recovery Signal Pattern

### Use case

Alert not only on failure, but also on recovered state.

### Steps

1. Capture failed state event.
2. On subsequent pass, send recovery `notify`.
3. Tag incident thread as recovered.
4. Summarize timeline in durable note.

---

## 4) Endpoint Contract Drift Watch

### Use case

Monitor critical API endpoint behavior over time.

### Steps

1. Build synthetic request with assertions for key response properties.
2. Schedule interval run.
3. Track failures as potential contract drift.
4. Escalate with `notify` and create follow-up work.

---

## 5) Low-Noise Monitoring Rollout

### Use case

Avoid alert fatigue while introducing monitoring.

### Steps

1. Start checks at low frequency.
2. Validate false-positive rate.
3. Tighten assertions gradually.
4. Increase frequency once stable.
