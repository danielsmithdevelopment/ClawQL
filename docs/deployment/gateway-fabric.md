# Gateway fabric ladder

ClawQL exposes one customer-facing hostname (`gateway.clawql.app`) while backends climb a **fabric ladder**. Each rung keeps the same MCP / REST surface; only where traffic lands changes.

| Rung                     | Who                                                | Where traffic runs                                                                         | Status                                                                            |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **1. Edge Worker**       | Developer / Teams / trial / demo                   | Cloudflare Worker + R2 / KV / D1                                                           | Phase 1 shipped ([`cloudflare/gateway`](../../cloudflare/gateway))                |
| **2. Edge → IDP proxy**  | Shared / Dedicated / Enterprise (when AWS is live) | Worker reverse-proxies to K3s/EKS ingress                                                  | Phase 2 (this doc)                                                                |
| **3. Dedicated VG**      | Dedicated / enterprise golden hosts                | Packer/Pulumi host boots Managed Edge Gateway (`/mcp` + `/v1` on `:8080`) after vault sync | Alpha shipped ([#748](https://github.com/danielsmithdevelopment/ClawQL/pull/748)) |
| **4. Helm Managed Edge** | In-cluster one-hostname edge                       | `charts/clawql-mcp` `managedGateway` (off by default)                                      | Wedge shipped; production hardening follow-up                                     |
| **5. Full VG fabric**    | Enterprise Regional Hub path                       | WORM / NATS / Valkey + native JWT ATR                                                      | Not yet                                                                           |

See also: [hosted-live-bootstrap.md](./hosted-live-bootstrap.md), [GTM playbook](../gtm/clawql-gtm-playbook.md), [inference / Managed Edge Gateway](../getting-started/inference.md).

## Phase 2 — Edge Worker IDP proxy

When the first Shared+/IDP customer is provisioned on AWS:

1. Stand up `idp-k3s` (or `eks`) per [hosted-live-bootstrap](./hosted-live-bootstrap.md#phase-2--first-idp-customer-k3s).
2. Point the edge Worker at the ingress:

   ```bash
   # Pulumi (preferred for stacks)
   pulumi config set clawql:idpProxyOrigin 'https://idp.example.com'
   pulumi up

   # Or Wrangler var / secret on an already-deployed Worker
   wrangler secret put CLAWQL_IDP_PROXY_ORIGIN   # or vars in wrangler.toml
   ```

3. **Per-tenant override** (multi-cluster / multi-ingress): set D1 `tenants.feature_flags`:

   ```json
   { "idp_proxy_origin": "https://acme.idp.example.com" }
   ```

   Resolution order: `feature_flags.idp_proxy_origin` → Worker `CLAWQL_IDP_PROXY_ORIGIN` → `503 upgrade_required`.

4. Smoke: Bearer token for a `shared`/`dedicated`/`enterprise` tenant → Worker proxies with hop headers `X-Correlation-Id`, `X-ClawQL-Tenant-Id`, `X-Forwarded-Proto`.

Developer/Teams traffic stays native on the Worker (R2 vault, KV Layer 5, D1 audit). IDP tiers never execute tools in the Worker once a proxy origin is configured.

## Phase 2 checklist

- [x] Worker reverse-proxy path (`idpProxyOrUpgrade`)
- [x] Pulumi `clawql:idpProxyOrigin` → `plain_text` binding
- [x] Per-tenant `feature_flags.idp_proxy_origin`
- [x] Hop headers for upstream ATR / audit
- [ ] Live `gateway.clawql.app` → first customer K3s ingress (operator)
- [ ] Teams→Shared upgrade path with R2 vault continuity (GTM Phase 2 exit)
- [ ] Helm `managedGateway` production hardening (probes, NetworkPolicy, JWT ATR)

## Related configs

| Config                       | Layer                                                          |
| ---------------------------- | -------------------------------------------------------------- |
| `clawql:deployWorkerStub`    | Pulumi edge — deploy gateway Worker module                     |
| `clawql:idpProxyOrigin`      | Pulumi edge — default IDP proxy origin                         |
| `clawql:startManagedGateway` | Pulumi dedicated/enterprise — boot Managed Edge on golden host |
| `managedGateway.enabled`     | Helm `clawql-mcp` — in-cluster nginx edge                      |
