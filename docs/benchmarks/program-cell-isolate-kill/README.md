# ProgramCellDO isolate kill-node evidence

Local proof that a **ProgramCellDO** durable journal in celld DO storage survives `SIGKILL` of the celld binary:

1. **Write arm** — pause after write intent → SIGKILL → resume `outcome_unknown` (at-most-once)
2. **Read arm** — pause before interrupted read → SIGKILL → resume re-runs the read once

```bash
STREAMS_CELLD_SMOKE_REQUIRED=1 bash docs/examples/streams-celld/scripts/smoke-program-cell-kill.sh
```

## Honesty

- Proves DO journal survival across celld process kill for this Lab program cell.
- Does **not** prove multi-node fleet LTX / `celld diagnose`, or the full ADR 0015 three-arm product gate.
- Distinct from the host file-journal stand-in (`npm run demo:kill-node-standin`).
