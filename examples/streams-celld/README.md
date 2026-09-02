# ClawQL Streams — celld skeleton (Lab 5b)

Minimal **Workers / Durable Objects** bundle for [ClawQL Streams](https://docs.clawql.com/streams/clawql-streams) on **[celld v0.4.0](https://github.com/denoland/celld/releases/tag/v0.4.0)**.

| DO class | Role |
| -------- | ---- |
| `GatewayDO` | Webhook ingress (`POST /webhook/{subscriptionId}`), spawn sessions |
| `SubscriptionDO` | Significance filter stub (`sub:{id}` naming) |
| `AgentSessionDO` | Ephemeral session + WORM row + optional `fetch(INFERENCE_URL/healthz)` |

**Learn walkthrough:** [Streams getting started — Lab 5b](https://docs.clawql.com/learn/streams-getting-started#lab-5b--clawql-streams-wrangler-skeleton--bundle-check-30-min)

## Prerequisites

- [celld v0.4.0](https://github.com/denoland/celld/releases/tag/v0.4.0) on `PATH`
- [esbuild](https://esbuild.github.io/) on `PATH` (required by `celld deploy` / `celld dev`)

## Local dev (`celld dev`)

```bash
cd examples/streams-celld
celld dev --port 9876
```

Another terminal:

```bash
curl -s http://127.0.0.1:9876/health | jq .
curl -s -X POST http://127.0.0.1:9876/webhook/demo-lab \
  -H 'content-type: application/json' \
  -H 'x-clawql-event-id: lab-event-1' \
  -d '{"hello":"streams"}' | jq .
curl -s http://127.0.0.1:9876/admin/status | jq .
```

Repeat the webhook with the same `x-clawql-event-id` to observe idempotent session wake.

## Bundle size gate (64 MiB Workers limit)

```bash
node scripts/bundle-check.mjs
# or from repo root:
clawql streams celld bundle-check --project examples/streams-celld
```

## Fleet deploy (optional)

After Lab 5 bucket credentials:

```bash
export CELLD_BUCKET=s3://clawql-streams-state
export S3_ENDPOINT=https://ACCOUNT.r2.cloudflarestorage.com
export AWS_REGION=auto

celld deploy . \
  --bucket "$CELLD_BUCKET" \
  --endpoint "$S3_ENDPOINT" \
  --region "$AWS_REGION"

clawql streams celld start --bucket "$CELLD_BUCKET" --listen 127.0.0.1:8080
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/.well-known/celld/health
```

## Kubernetes (Helm)

See [`charts/clawql-mcp/values-streams-celld.example.yaml`](../../charts/clawql-mcp/values-streams-celld.example.yaml) and [`deployment/samples/streams-celld/`](../../deployment/samples/streams-celld/README.md).

## Next steps

- Replace stubs with `clawql-streams` + in-process `clawql-core` when the package ships
- Wire real significance filters and `fetch()` to [`clawql-inference`](https://docs.clawql.com/inference/clawql-inference)
- Run under Helm `streams.scalingBackend: celld` with LTX WORM on the fleet bucket
