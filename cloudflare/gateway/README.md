# ClawQL edge gateway Worker

Cloudflare gateway for Developer / Teams / trial / demo tenants, with Phase 2 IDP reverse-proxy for Shared+.

**Fabric ladder:** [gateway-fabric.md](../../docs/deployment/gateway-fabric.md).

**Bindings** (match Pulumi `edge` profile):

| Binding                   | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `CLAWQL_VAULT`            | R2 vault (`tenant-{id}/vault/Memory/…`)                        |
| `CLAWQL_SEMANTIC_CACHE`   | KV Layer 5 cache                                               |
| `CLAWQL_TENANTS`          | D1 tenants + audit + vault index                               |
| `CLAWQL_QUEUE`            | Optional request fan-out                                       |
| `CLAWQL_GATEWAY_PROFILE`  | Pulumi sets `edge` (plain_text)                                |
| `CLAWQL_IDP_PROXY_ORIGIN` | Optional Shared+/IDP upstream (Pulumi `clawql:idpProxyOrigin`) |

**Secrets / vars:** `CLAWQL_BOOTSTRAP_TOKEN`, `STRIPE_WEBHOOK_SECRET`, optional `CLAWQL_IDP_PROXY_ORIGIN`.

Per-tenant override: D1 `feature_flags.idp_proxy_origin` (wins over the Worker env binding).

## Endpoints

| Method | Path                                                                | Auth                     |
| ------ | ------------------------------------------------------------------- | ------------------------ |
| GET    | `/healthz`, `/status`                                               | none                     |
| GET    | `/tools`                                                            | none                     |
| POST   | `/search`, `/execute`, `/memory_ingest`, `/memory_recall`, `/cache` | Bearer                   |
| POST   | `/mcp`                                                              | Bearer for `tools/call`  |
| POST   | `/webhooks/stripe`                                                  | Stripe-Signature         |
| POST   | `/demo/session`, `/demo/pipeline`                                   | none (5‑min TTL sandbox) |

**Policy:** unlimited MCP executions — no Worker-side execution meter.

**IDP tiers:** when Bearer resolves to `shared` / `dedicated` / `enterprise`, the Worker reverse-proxies to the resolved origin (or returns `503 upgrade_required`). Hop headers: `X-Correlation-Id`, `X-ClawQL-Tenant-Id`, `X-Forwarded-Proto`.

## Phase 2 checklist

- [x] Reverse-proxy Shared+ to K3s/EKS ingress
- [x] Pulumi `idpProxyOrigin` plain_text binding
- [x] Per-tenant `feature_flags.idp_proxy_origin`
- [ ] Operator: route live `gateway.clawql.app` → first customer ingress
- [ ] Teams→Shared upgrade + R2 vault continuity E2E

## Develop

```bash
cd cloudflare/gateway
npm install
npm test
npm run build
npm run dev   # wrangler; configure real binding IDs in wrangler.toml
```

Pulumi deploy reads `dist/index.js` when `clawql:deployWorkerStub=true` (now the full gateway module).

```bash
pulumi config set clawql:idpProxyOrigin 'https://idp.example.com'   # Phase 2
```

See [hosted-live-bootstrap.md](../../docs/deployment/hosted-live-bootstrap.md) and [gateway-fabric.md](../../docs/deployment/gateway-fabric.md).
