# Cloud E2E Compose stacks

Closing remaining honest limits from `docs/closing-integrations.md`.

| Stack | Path | Status |
|---|---|---|
| Keycloak (OIDC + realm) | `keycloak/docker-compose.yml` | Realm `clawql-e2e` with Support/Legal + users; SCIM → `/sync/scim` |
| Multi-gateway + NATS | `multi-gateway/docker-compose.yml` | 2× gateway stubs + JetStream; `kill-replica.sh` for RES-* |

## Keycloak

```bash
docker compose -f apps/dashboard/e2e-cloud/compose/keycloak/docker-compose.yml up -d
curl -fsS http://127.0.0.1:18089/ >/dev/null && echo keycloak-up
# Admin: http://127.0.0.1:18089/ (admin / admin) — realm clawql-e2e
```

SI-07/08 arrange via SCIM PatchOp on `POST /sync/scim` (mapped from Keycloak groups/users). Pass-when remains `/decision` or CDP + `/audit`.

## Multi-gateway + NATS

```bash
docker compose -f apps/dashboard/e2e-cloud/compose/multi-gateway/docker-compose.yml up -d
./apps/dashboard/e2e-cloud/compose/multi-gateway/kill-replica.sh gateway-a
curl -fsS http://127.0.0.1:18081/healthz && echo gateway-b-up
curl -fsS http://127.0.0.1:18222/healthz && echo nats-up
```

Playwright Pass-when still uses `POST /gateway/restart` with `{ replica, compose: true }` + session/`/audit` witnesses (Compose kill is the external arrange when Docker is available).

## Stripe listen (CI / local)

```bash
# With dashboard on :3000 and STRIPE_WEBHOOK_SECRET=whsec_test_acme (harness default)
stripe listen --forward-to http://localhost:3000/events/inbound/stripe
# E2E helper stripeCheckout() creates a Session then POSTs checkout.session.completed
```
