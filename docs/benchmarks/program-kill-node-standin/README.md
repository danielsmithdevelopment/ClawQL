# ADR 0015 kill-node stand-in evidence

Local proof that the durable program **file journal** survives real `SIGKILL` of the runner process and resumes correctly (read replay / write `outcome_unknown`).

```bash
npm run demo:kill-node-standin
```

Writes `evidence.json` in this directory.

## Honesty

This is a **file-journal SIGKILL stand-in**. It does **not** prove celld V8-isolate / SQLite-LTX crash survival. That still requires `ProgramCellDO` + `SIGKILL` of the celld binary with `isolateReady` pin.

See also: `packages/clawql-api/src/program/kill-node-standin-demo.ts`, `celld-kill-node-demo.ts`.
