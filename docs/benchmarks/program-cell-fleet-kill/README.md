# ProgramCellDO fleet peer kill (Tier C)

**Status:** measured on Cloudflare R2 (`clawql-streams-state`) — PoC [`evidence.json`](./evidence.json); phased board N=1000 [`phased-evidence.json`](./phased-evidence.json); framing [`AVAILABILITY.md`](./AVAILABILITY.md) · [`TTL-TRADEOFF.md`](./TTL-TRADEOFF.md).

## Run (R2)

```bash
export CELLD_BUCKET="s3://clawql-streams-state/tier-c-$(date +%Y%m%d%H%M%S)"  # fresh prefix recommended
export S3_ENDPOINT="https://${CLAWQL_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="${CLAWQL_SYNC_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${CLAWQL_SYNC_SECRET_ACCESS_KEY}"
export AWS_REGION=auto AWS_EC2_METADATA_DISABLED=true
export STREAMS_CELLD_FLEET_REQUIRED=1
npm run smoke:program-cell-fleet-kill
```

Soft-skips (evidence `status: not_measured`) when bucket unset or diagnose fails — unless `STREAMS_CELLD_FLEET_REQUIRED=1`.

## Honesty

- Requires a store that **enforces** `If-None-Match` / conditional writes. Local s3rver-class mocks fail diagnose by design; R2 passes.
- Proves peer resume after SIGKILL of one fleet node — not the AWS three-arm cost board in `aws-celld-burst` §13.
- Lab isolate kill (Tier B) remains `smoke-program-cell-kill.sh`.
