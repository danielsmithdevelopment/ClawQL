# Closing Cloud E2E “honest limits”

Only **phone NFC** (REV-13, UX-09) is truly impossible in CI. Everything else below is achievable.

## WebAuthn (KEY-*, SI-*)

Use Chrome’s CDP virtual authenticator via `helpers/webauthn-cdp.ts` + `helpers/webauthn-ceremony.ts`:

- UV on/off for PIN/fingerprint refusals (`issueApiKeyViaCdpStepUp`)
- Synced vs device-bound registration (`registerSecurityKeyViaCdp`)
- Preload credentials with a chosen `signCount` for cloned-key (KEY-11)

**Migrated Pass-when (CDP + `/audit` + Profile UI):** KEY-01..08, KEY-10..12, SI-02, SI-03.  
KEY-11: `inflateSignatureCounter` arrange (server ahead of authenticator). KEY-10: `setAaguid` arrange. KEY-12: replay prior assertion signature.  
KEY-03/04/SI-03: arrange via keysApi, Pass-when `/audit` (+ Profile for SI-03).  
Remaining: KEY-09, SI-04+ (idle/OIDC), Stripe, Compose.

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
