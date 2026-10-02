# Schedule synthetic check — dry_run

Create a ClawQL **schedule** synthetic HTTP check and trigger it with dry_run.

## Steps

1. Call tool **`clawql_schedule`** (or `schedule`) with `operation=create`:
   - `schedule.frequency`: `{ "type": "interval", "seconds": 300 }`
   - `action.kind`: `"synthetic"`
   - `action.synthetic_test`:
     - `name`: `"openbench-health"`
     - `request`: `{ "method": "GET", "url": "https://example.com/" }`
     - `assert`: `{ "status_in": [200] }`
2. Call **`clawql_schedule`** with `operation=trigger`, the returned `job_id`,
   and **`dry_run`: true**.
3. Write relative path `schedule.json` from the trigger result.

## Artifact

```json
{
  "dry_run": true,
  "status": "pass",
  "job_id": "<id from create>",
  "source": "schedule"
}
```

## Rules

- Ignore `decoy/`.
- Inventing `schedule.json` without schedule tool_use fails.
- Prefer exact relative path `schedule.json`.
- Stop after writing `schedule.json`.
