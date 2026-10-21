# ProgramCellDO fleet peer kill (Tier C)

**Status:** harness shipped; measure when `CELLD_BUCKET` passes `celld diagnose` conditional-write.

## Run

```bash
export CELLD_BUCKET=s3://your-fleet-bucket
export AWS_ACCESS_KEY_ID=…
export AWS_SECRET_ACCESS_KEY=…
# optional: export S3_ENDPOINT=https://…   # R2 / S3-compatible
export STREAMS_CELLD_FLEET_REQUIRED=1
bash docs/examples/streams-celld/scripts/smoke-program-cell-fleet-kill.sh
```

Soft-skips (evidence `status: not_measured`) when bucket unset or diagnose fails — unless `STREAMS_CELLD_FLEET_REQUIRED=1`.

## Honesty

- Requires a store that **enforces** `If-None-Match` / conditional writes. Local s3rver-class mocks fail diagnose by design.
- Proves peer resume after SIGKILL of one fleet node — not the AWS three-arm cost board in `aws-celld-burst` §13.
- Lab isolate kill (Tier B) remains `smoke-program-cell-kill.sh`.
