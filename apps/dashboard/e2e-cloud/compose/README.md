# Cloud E2E Compose stacks

Closing remaining honest limits from `docs/closing-integrations.md`.

| Stack | Path | Status |
|---|---|---|
| Keycloak (OIDC) | `keycloak/docker-compose.yml` | Dev IdP up on `:18089` — realm/SCIM wiring next |
| Multi-gateway | _(planned)_ | 2× gateway + NATS; kill replica for RES-* |

## Keycloak

```bash
docker compose -f apps/dashboard/e2e-cloud/compose/keycloak/docker-compose.yml up -d
curl -fsS http://127.0.0.1:18089/ >/dev/null && echo keycloak-up
```

Until realm import lands, SI-07/08 arrange via production-shaped `POST /sync/directory` (Okta-shaped payload) and Pass-when via `/decision` or CDP + `/audit`.
