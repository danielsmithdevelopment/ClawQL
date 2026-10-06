# Closing Cloud E2E “honest limits”

Only **phone NFC** (REV-13, UX-09) is truly impossible in CI. Everything else below is achievable.

## WebAuthn (KEY-*, SI-*)

Use Chrome’s CDP virtual authenticator via `helpers/webauthn-cdp.ts`:

- UV on/off for PIN/fingerprint refusals
- Synced vs device-bound (resident key / transport)
- Preload credentials with a chosen `signCount` for cloned-key (KEY-11)

Migrate KEY/SI tests off `pinVerified` / `keyKind` flags as each Pass-when is rewritten.

## Stripe (SU-*, ADM-11/12)

1. Stripe **test mode** keys in CI secrets  
2. `stripe listen --forward-to localhost:…/events/inbound/stripe` (or Cloud webhook URL)  
3. Real Checkout Session + customer portal; drop `/api/e2e/stripe/checkout` as Pass-when  

## Okta / OIDC (SI-*, ADM-01/05)

- Free Okta developer org, **or**
- Keycloak (or Dex) in Docker Compose for CI  

Assert real protocol redirects and token claims — not `control({ syncOkta })`.

## Multi-instance / outages (RES-*)

Compose stack:

- 2× gateway replicas  
- NATS (or existing event bus)  
- Kill one replica / partition network; assert fail-closed and resume from `/events` cursor  

## NFC

Keep Manual `test.skip`. No browser path.
