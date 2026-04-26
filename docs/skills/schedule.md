# Skill: `schedule` (optional)

Create and run persisted scheduled jobs (v1 synthetic checks).

## When to Use

- You need recurring synthetic checks.
- You want persisted schedule definitions and run history.
- You need manual trigger or dry-run validation of checks.

## Common Workflow

1. Create schedule job with `action.kind: "synthetic"`.
2. Validate target URL and assertions.
3. Trigger once with `dry_run: true`.
4. Enable normal cadence and monitor runs.
5. Pair failures with alerting (`notify`) if configured.

## Patterns

### Pattern A: Uptime probe

- interval schedule
- assert status code and response markers

### Pattern B: Contract drift check

- recurring request against API contract endpoint
- assert key fields

### Pattern C: Manual pre-deploy check

- one-off trigger before rollout gate

## Tips

- Start with low-frequency schedules until stable.
- Use strict allowlists/caps for synthetic requests.
- Add runbook links in job metadata where possible.

## Composed Workflow

1. Build and validate synthetic checks with `dry_run`.
2. Enable recurring schedule.
3. Route failures to `notify` channel.
4. Capture incident learnings with `memory_ingest`.
