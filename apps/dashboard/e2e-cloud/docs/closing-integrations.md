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
SI-07/08: `POST /sync/directory` arrange → `/decision` or CDP + `/audit`.  
SU-01..03: `POST /billing/checkout` + `/audit`.  
ADM-11/12: `POST /billing/credits|card` + `GET /billing/usage` + `/audit`.  
RES-01/06: `POST /gateway/restart` + `/audit` (Compose replica kill next).  

## Stripe (remaining)

Pass-when already hits `/billing/checkout` + `/billing/*`. Still needed:

1. Stripe **test mode** keys in CI secrets  
2. `stripe listen --forward-to …/events/inbound/stripe`  
3. Real Checkout Session + customer portal inside `/billing/checkout`  

## Okta / OIDC (remaining)

- Keycloak Compose skeleton: `e2e-cloud/compose/keycloak/`  
- Next: realm import + map groups to `/sync/directory` (or SCIM); drop Okta-shaped payload  

## Multi-instance / outages (RES-*)

`POST /gateway/restart` is the in-process stand-in. Compose next:

- 2× gateway replicas  
- NATS (or existing event bus)  
- Kill one replica / partition network; assert fail-closed and resume from `/events` cursor  

## NFC

Keep Manual `test.skip`. No browser path.
