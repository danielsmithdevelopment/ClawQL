# Closing Cloud E2E “honest limits”

Only **phone NFC** (REV-13, UX-09) is truly impossible in CI. Everything else below is achievable.

## WebAuthn (KEY-*, SI-*)

Use Chrome’s CDP virtual authenticator via `helpers/webauthn-cdp.ts` + `helpers/webauthn-ceremony.ts`:

- UV on/off for PIN/fingerprint refusals (`issueApiKeyViaCdpStepUp`)
- Synced vs device-bound registration (`registerSecurityKeyViaCdp`)
- Preload credentials with a chosen `signCount` for cloned-key (KEY-11)

**Migrated Pass-when (CDP + `/audit` + Profile/Settings UI):** KEY-01..12, SI-02..06.  
KEY-09: `ageSession` arrange → POST `/org/delete` + Settings UI + `/audit` (fresh sign-in gate).  
SI-04/05: `ageLastActive` / `ageSession` arrange → POST `/session/enforce` on Profile load + `/audit`.  
SI-06: `secondBrowserSession` arrange → Profile **Sign out everywhere else** → POST `/session/end-others` + `/audit`.  
KEY-11: `inflateSignatureCounter` arrange. KEY-10: `setAaguid` arrange. KEY-12: replay prior assertion signature.  
Remaining: SI-07/08 (real Okta/OIDC sync), Stripe, Compose.

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
