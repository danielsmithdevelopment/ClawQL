# Day 8 — board canary panel + recording gate asserts canary

## Shipped

- **Board** shows canary % bar + rollback trigger (from hydrated `TaskView.canary`).
- **`board:hydrate` / `demo:approval-path`** POST canary + `arweaveId` with the task view.
- **`demo:gate`** requires `.local/canary/status.json` dry-run at 10% with `error_rate` rollback text.
- E2E local demo asserts the canary status file.

## Video beat

After release verify, either open `status.json` **or** show the board canary panel (same numbers). Live path remains Workers gradual deploy API.

## Still blocked

Live Artifacts / Turbo / public competition repo / gradual deploy credentials.
