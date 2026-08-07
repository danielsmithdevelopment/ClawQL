# ClawQL edge gateway Worker

Phase 1 Cloudflare gateway for Developer / Teams / trial / demo tenants.

**Bindings** (match Pulumi `edge` profile):

| Binding | Purpose |
| --- | --- |
| `CLAWQL_VAULT` | R2 vault (`tenant-{id}/vault/Memory/…`) |
| `CLAWQL_SEMANTIC_CACHE` | KV Layer 5 cache |
| `CLAWQL_TENANTS` | D1 tenants + audit + vault index |
| `CLAWQL_QUEUE` | Optional request fan-out |

**Secrets / vars:** `CLAWQL_BOOTSTRAP_TOKEN`, `STRIPE_WEBHOOK_SECRET`, `CLAWQL_IDP_PROXY_ORIGIN`.

## Endpoints

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/healthz`, `/status` | none |
| GET | `/tools` | none |
| POST | `/search`, `/execute`, `/memory_ingest`, `/memory_recall`, `/cache` | Bearer |
| POST | `/mcp` | Bearer for `tools/call` |
| POST | `/webhooks/stripe` | Stripe-Signature |
| POST | `/demo/session`, `/demo/pipeline` | none (5‑min TTL sandbox) |

**Policy:** unlimited MCP executions — no Worker-side execution meter.

## Develop

```bash
cd cloudflare/gateway
npm install
npm test
npm run build
npm run dev   # wrangler; configure real binding IDs in wrangler.toml
```

Pulumi deploy reads `dist/index.js` when `clawql:deployWorkerStub=true` (now the full gateway module).

See [hosted-live-bootstrap.md](../../docs/deployment/hosted-live-bootstrap.md).
