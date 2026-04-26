# Skill: `notify` (optional)

Send Slack completion/failure signals via `chat.postMessage`.

## When to Use

- A workflow reaches completion/failure milestones.
- You need asynchronous visibility for operators/teams.
- You want lightweight status updates with links.

## Common Workflow

1. Ensure `CLAWQL_ENABLE_NOTIFY=1` and Slack auth/spec are present.
2. Send concise status message to target channel.
3. Include key links (issue, doc, runbook, dashboard).
4. Use `thread_ts` for follow-up updates in same thread.

## Patterns

### Pattern A: Job completion message

- include counts, duration, and output link

### Pattern B: Failure alert

- include failing step and next action owner

### Pattern C: Schedule check integration

- on synthetic check failure, post to incident channel

## Tips

- Keep message actionable: what failed, where, and who should act.
- Prefer one root thread per run.
- Never send secrets/tokens in message bodies.

## Message Template (Recommended)

- Status (`PASS`/`FAIL`)
- Workflow name
- Key identifier (issue/run id)
- Next action + owner
- Link(s) to runbook or artifact
