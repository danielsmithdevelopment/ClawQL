# ClawQL Cloud E2E catalog

197 catalog IDs (`catalog/scenarios.ts`) exercised by Playwright under `specs/`.

## Pass-when rule (portable suite)

| Surface | Allowed for |
|---|---|
| `/api/e2e/reset`, `/api/e2e/control`, other `/api/e2e/*` arrange helpers | **Arrange state and inject faults only** |
| Production-shaped paths: `/v1`, `/mcp`, `/events`, `/audit` | **Assert results** |
| Managed console UI (Playwright) | Assert person-visible Pass-when |
| Webhook receiver `:4091` | Assert delivery / signatures |

Never use `POST /api/e2e/scenario` or `getWitness()` as Pass-when.  
Never treat Manual NFC skips as passes.

`CLAWQL_E2E_HARNESS=1` is required for harness handlers. Managed console alone must **not** enable god-mode.

## Coverage

```bash
npm run test:e2e:cloud:catalog
```

Fails if any catalog ID is missing from its tier’s specs, appears in the wrong tier, or is double-counted across files. That is how `37 + 158 + 2 = 197` stays honest (not “161 Nightly titles”).

## Production builds

The dashboard Dockerfile **deletes** `src/app/api/e2e` before `next build`. CI runs the production image and expects `404` for `/api/e2e/*`.

## Closing remaining integrations

| Area | Approach |
|---|---|
| WebAuthn | Playwright + Chrome DevTools Protocol virtual authenticator (`helpers/webauthn-cdp.ts`) |
| Stripe | Test-mode keys + Stripe CLI webhook forward (drop checkout façade) |
| Okta | Free Okta developer org or Keycloak in Compose |
| Multi-instance | Two gateway replicas + NATS in Docker Compose; kill real processes |
| NFC (REV-13, UX-09) | Physical phone — stay Manual `test.skip` |

## Run

```bash
# Console with CLAWQL_E2E_HARNESS=1 + webhook :4091
CLAWQL_CLOUD_E2E_REPEAT=3 npm run test:e2e:cloud
CLAWQL_CLOUD_E2E_REPEAT=3 npm run test:e2e:cloud:nightly
```
