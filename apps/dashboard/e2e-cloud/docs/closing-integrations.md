# Closing Cloud E2E “honest limits”

Only **phone NFC** (REV-13, UX-09) is truly impossible in CI. Everything else below is achievable.

## WebAuthn (KEY-*, SI-*)

Use Chrome’s CDP virtual authenticator via `helpers/webauthn-cdp.ts` + `helpers/webauthn-ceremony.ts`:

- UV on/off for PIN/fingerprint refusals (`issueApiKeyViaCdpStepUp`)
- Synced vs device-bound registration (`registerSecurityKeyViaCdp`)
- Preload credentials with a chosen `signCount` for cloned-key (KEY-11)

**Migrated Pass-when (CDP + production routes + `/audit` + UI):** KEY-01..12, SI-02..08, SU-01..03, ADM-11/12 (billing path), RES-01/06 restart path.  
KEY-09: `ageSession` → POST `/org/delete` + Settings UI + `/audit`.  
SI-04/05/06: `/session/*` + Profile.  
SI-07/08: SCIM PatchOp `POST /sync/scim` (Keycloak realm groups/users) → `/decision` or CDP + `/audit`.  
SU-01..03: `POST /billing/checkout` Session → `POST /events/inbound/stripe` (`checkout.session.completed`) + `/audit`.  
ADM-11/12: `POST /billing/credits|card` + `GET /billing/usage` + `/audit`.  
RES-01/06: Compose kill (`multi-gateway/kill-replica.sh`) + `POST /gateway/restart` + `/audit`.  

## Stripe

1. `POST /billing/checkout` creates a Checkout Session (arrange)  
2. `stripe listen --forward-to …/events/inbound/stripe` (or harness helper signed POST)  
3. `checkout.session.completed` provisions idempotently (SU-02 replay)  

CI can use Stripe **test mode** keys when secrets are present; harness signs with `whsec_test_acme` by default (`STRIPE_WEBHOOK_SECRET` override).

## Okta / OIDC

- Keycloak Compose + realm import: `e2e-cloud/compose/keycloak/` (`clawql-e2e`, Support/Legal, Jordan/Priya/Dana)  
- SCIM-shaped sync: `POST /sync/scim` (also `POST /sync/directory` with `provider: "scim"`)  
- Catalog titles still say “Okta”; Keycloak is the local IdP stand-in  

## Multi-instance / outages (RES-*)

- Compose: `e2e-cloud/compose/multi-gateway/` — NATS JetStream + `gateway-a` / `gateway-b` stubs  
- Kill: `./kill-replica.sh gateway-a`  
- Pass-when: `POST /gateway/restart` `{ replica, compose: true }` + session continuity / review survive + `/audit`  

## NFC

Keep Manual `test.skip`. No browser path.
