# AWS (bundled top-50 preset)

ClawQL ships **50 curated AWS service OpenAPI specs** under the merged **`aws`** preset (SigV4 signing on **`execute`**). Same MCP flow as **`google`** for GCP: **`search`** → **`execute`**.

**Lookup reference:** [aws-apis-lookup.md](./aws-apis-lookup.md)

## Prerequisites

- IAM credentials with permissions for the APIs you call (principle of least privilege).
- Region for regional endpoints (default `us-east-1`).

## Environment

```bash
export CLAWQL_PROVIDER=aws
# or add to default stack without all-providers:
# export CLAWQL_ENABLE_AWS=1

export AWS_ACCESS_KEY_ID=…
export AWS_SECRET_ACCESS_KEY=…
# Optional STS:
# export AWS_SESSION_TOKEN=…
export AWS_REGION=us-east-1
```

Or via merged auth JSON (per-service labels in multi-spec):

```bash
CLAWQL_PROVIDER_AUTH_JSON='{"aws":{"X-Amz-Access-Key-Id":"…","X-Amz-Secret-Access-Key":"…"}}'
```

Prefer standard **`AWS_*`** env vars — ClawQL’s SigV4 path reads those first.

## Narrow the loaded spec

The **`aws`** preset merges 50 services — large index. For experiments, use a single service file:

```bash
CLAWQL_SPEC_PATH=providers/aws/apis/s3/openapi.yaml
```

Or hybrid merge:

```bash
CLAWQL_BUNDLED_PROVIDERS=github,aws
```

## Discover operations

```json
{"tool":"search","arguments":{"query":"s3 list buckets","limit":8}}
```

Merged `operationId`s are prefixed with the service slug, e.g. `s3::ListBuckets`.

### Example: list S3 buckets (read-only smoke)

```json
{
  "tool": "execute",
  "arguments": {
    "operationId": "s3::ListBuckets",
    "fields": {}
  }
}
```

Exact `operationId`s match the bundled OpenAPI (see [apis README](../../providers/aws/apis/README.md)).

## Default stack vs all-providers

| Mode | AWS loaded? |
|------|-------------|
| Bare `npx clawql-mcp` (no spec env) | No — use **`CLAWQL_ENABLE_AWS=1`** |
| **`CLAWQL_PROVIDER=aws`** | Yes (AWS top-50 only) |
| **`CLAWQL_PROVIDER=all-providers`** | Yes (with every other bundled vendor + Google top-50) |

## Troubleshooting

- **403 / SignatureDoesNotMatch:** check clock skew, region, and whether the operation requires a specific endpoint variant.
- **Operation not found:** run **`search`** again — slug prefix must match the loaded manifest.
- **Refresh specs:** `npm run fetch-aws-top50` (maintainers) — see [aws-apis-lookup.md](./aws-apis-lookup.md).

## Related

- [Bundled providers plugin](../plugins/bundled-providers.md)
- [Configuration § Feature tiers](../readme/configuration.md)
- [Agent setup prompt](../getting-started/agent-setup-prompt.md)
