# ClawQL Cloud E2E catalog

197 catalog IDs (`catalog/scenarios.ts`) exercised by Playwright under `specs/`.

## Pass-when rule (portable suite)

| Surface | Allowed for |
|---|---|
| `/api/e2e/reset`, `/api/e2e/control`, other `/api/e2e/*` arrange helpers | **Arrange state and inject faults only** |
| Production-shaped paths: `/v1`, `/mcp`, `/events`, `/events/inbound/stripe`, `/audit`, `/decision`, `/billing/*`, `/session/*`, `/org/*`, `/sync/*`, `/gateway/*` | **Assert results** (and prefer for arrange when a product path exists) |
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
| WebAuthn | CDP virtual authenticator (`helpers/webauthn-cdp.ts` + `webauthn-ceremony.ts`). Use `localhost` rpId. KEY/SI ceremonies migrated. |
| Stripe | `/billing/checkout` Session + `/events/inbound/stripe` (`stripe listen` / signed helper) |
| Okta | Live Keycloak Admin API → `/sync/scim` (`helpers/keycloak.ts`); Compose CI smoke |
| Multi-instance | Compose kill (`helpers/compose.ts`) → `/gateway/restart`; CI `smoke-compose.sh` |
| NFC (REV-13, UX-09) | Physical phone — Manual `test.skip` (only true CI impossibility) |

## Run

```bash
# Console with CLAWQL_E2E_HARNESS=1 + webhook :4091
CLAWQL_CLOUD_E2E_REPEAT=3 npm run test:e2e:cloud
CLAWQL_CLOUD_E2E_REPEAT=3 npm run test:e2e:cloud:nightly
```
