# infra/aws-celld-burst

Sample manifests and notes for **Bursty Streams on AWS** (celld + Karpenter + Istio ambient + filler preemption).

**Canonical spec:** [`docs/streams/aws-celld-burst.md`](../../docs/streams/aws-celld-burst.md)

## Contents

| Path | Purpose |
| ---- | ------- |
| `manifests/priority-classes.yaml` | Tier 1–3 PriorityClasses from §5.2 |
| `manifests/filler-disruption-budget.example.yaml` | Example Karpenter disruptionBudget for filler NodePool |
| `loadtest/` | Three-arm k6 scaffold + §13.5 result template (§13) |

## Status

Draft / unverified. Do not cite §3 rate-card arithmetic as ClawQL-measured cost. Complete §12 / §13 (three-arm test with Cost Explorer) before external claims.
