# infra/aws-celld-burst

Sample manifests and notes for **Bursty Streams on AWS** (celld + Karpenter + Istio ambient + filler preemption).

**Canonical spec:** [`docs/streams/aws-celld-burst.md`](../../docs/streams/aws-celld-burst.md)

## Contents

| Path                                              | Purpose                                                     |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `manifests/priority-classes.yaml`                 | Tier 1–3 PriorityClasses from §5.2                          |
| `manifests/filler-disruption-budget.example.yaml` | Example Karpenter disruptionBudget for filler NodePool      |
| `loadtest/`                                       | Three-arm k6 scaffold + §13.5 result template (§13)         |
| `fetch-celld-leases-from-s3.sh`                   | Fail-closed S3 lease snapshot for `CelldFleetHealthService` (optional `CLAWQL_CELLD_AWS_*` overrides when `AWS_*` is R2 sync) |
| (repo) `scripts/run-burst-watch-from-s3-leases.sh` | Fetch leases then evaluate via `BurstWatchSources` (fail-closed) |

## Status

Draft / unverified. Do not cite §3 rate-card arithmetic as ClawQL-measured cost. Complete §12 / §13 (three-arm test with Cost Explorer) before external claims.
