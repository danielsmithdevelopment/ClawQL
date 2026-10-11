# Cloud E2E Compose stacks

Closing remaining honest limits from `docs/closing-integrations.md`.

| Stack | Path | Status |
|---|---|---|
| Keycloak (OIDC + realm) | `keycloak/docker-compose.yml` | Realm `clawql-e2e`; live Admin API arrange → `/sync/scim` |
| Multi-gateway + NATS | `multi-gateway/docker-compose.yml` | 2× gateway stubs + JetStream; `kill-replica.sh` for RES-* |

## CI smoke

```bash
bash apps/dashboard/e2e-cloud/compose/smoke-compose.sh
```

GitHub Actions: `.github/workflows/cloud-e2e-compose.yml` (path-filtered on compose/helpers).

## Keycloak

```bash
docker compose -f apps/dashboard/e2e-cloud/compose/keycloak/docker-compose.yml up -d
curl -fsS http://127.0.0.1:18089/ >/dev/null && echo keycloak-up
# Admin: http://127.0.0.1:18089/ (admin / admin) — realm clawql-e2e
```

SI-07/08 use `helpers/keycloak.ts`:

1. When Keycloak is up — Admin API mutate (remove Support / deactivate), then `POST /sync/scim`
2. When unreachable — SCIM-local arrange (same Pass-when)

Env: `CLAWQL_E2E_KEYCLOAK_URL` (default `http://127.0.0.1:18089`).

## Multi-gateway + NATS

```bash
docker compose -f apps/dashboard/e2e-cloud/compose/multi-gateway/docker-compose.yml up -d
./apps/dashboard/e2e-cloud/compose/multi-gateway/kill-replica.sh gateway-a
curl -fsS http://127.0.0.1:18081/healthz && echo gateway-b-up
curl -fsS http://127.0.0.1:18222/healthz && echo nats-up
```

RES-01/06 use `helpers/compose.ts` → Compose kill when Docker is available, then `POST /gateway/restart` Pass-when.

## Stripe listen (CI / local)

```bash
stripe listen --forward-to http://localhost:3000/events/inbound/stripe
# E2E helper stripeCheckout() creates a Session then POSTs checkout.session.completed
```
