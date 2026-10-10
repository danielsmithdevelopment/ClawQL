# Day 7 — decider wired into pipeline + dry-run canary status

## Shipped

- Pipeline uses `@artifacts-attempts/decider` (`localCalibratedDecision` / `localOpenAIShapedDecision` + `applyDecision`).
- Builds the live `/v1/decisions` request shape (choices from evidence) even in local mode.
- **`writeCanaryStatus`** → `.local/canary/status.json` with percentage split + rollback trigger from the manifest (honest dry-run; live = Workers deployments API).

## Video beat

After release verify, open `.local/canary/status.json` and show `canary: 10%` + rollback trigger text. Say Wrangler/API is the production swap.
