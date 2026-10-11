# clawql-auth: OIDC consumer + shared step-up

**Status:** shipped in `clawql-auth` (gateway `oidc` mode, policy hooks, TOTP/WebAuthn interfaces).  
**Non-goal:** ClawQL does **not** become a full IdP (no login UI, user directory, or token issuance).

## Layering

```
Customer IdP (Okta / Entra / Auth0 / …)
        │  issues JWT (optional acr/amr for MFA)
        ▼
Istio / Panguard / mcp-proxy JWT ATR   ← optional mesh chokepoint
        │
        ▼
clawql-mcp-http  CLAWQL_AUTH_MODE=oidc  ← clawql-auth verifies JWT → ATR
        │
        ▼
High-impact tools (payments, …)
  • assertToolPolicy(claims, tool)     ← MFA gate for financial tools
  • createFileStepUpStore + TOTP       ← transaction step-up (not SSO)
```

Login MFA and phishing-resistant passkeys remain **IdP** concerns. Payments still use **stage → confirm** plus optional TOTP for “move money now.”

## Gateway OIDC

Set:

```bash
export CLAWQL_AUTH_MODE=oidc
export CLAWQL_AUTH_OIDC_JWKS_URL=https://idp.example.com/.well-known/jwks.json
export CLAWQL_AUTH_OIDC_ISSUER=https://idp.example.com
export CLAWQL_AUTH_OIDC_AUDIENCE=clawql-mcp
# optional claim mapping
export CLAWQL_AUTH_OIDC_ATR_CLAIM=atr
```

Bearer JWT on MCP HTTP routes is verified via Effect. Domain code uses `resolveAtrClaimsFromHeadersEffect` / the `GatewayAuthService` and `OidcAuthService` (`Context.Service` + `Layer`, composed by `AuthLive`); JWT verify and JWKS/PEM IO run on the typed `OidcAuthError` / `GatewayAuthError` channels. Forced edges (Express / MCP hosts) use the thin Promise façade `resolveAtrClaimsFromHeadersAsync`, which is `Effect.runPromise` over the Effect. Prefer an embedded `atr` object; otherwise flat `sub` / `role` / `scope` / `tenant_id` plus OIDC `acr` / `amr` are mapped into `AtrClaims`.

Dev-only: `CLAWQL_AUTH_OIDC_HS256_SECRET` (never production).

This complements — and does not replace — [`mcp-proxy-jwt-atr.md`](./mcp-proxy-jwt-atr.md) when Panguard/Istio already validate every request.

## Policy: MFA for financial tools

```bash
export CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL=1
# optional override list:
# export CLAWQL_AUTH_FINANCIAL_TOOLS=payments_credits_transfer_confirm,payments_payout_create
```

```ts
import { Effect } from "effect";
import { assertToolPolicyEffect, claimsHaveMfa } from "clawql-auth";

await Effect.runPromise(assertToolPolicyEffect(claims, "payments_credits_transfer_confirm"));
```

`claimsHaveMfa` treats common `acr` / `amr` hints (`mfa`, `otp`, `totp`, ACR level ≥ 2, etc.).

Hosts should run `assertToolPolicyEffect` (via `Effect.runSync` / `Effect.runPromise`, or the `AuthPolicyService` layer) when dispatching MCP tools once request ATR claims are available. Full claim threading into every tool handler is a follow-up.

## Hosted `/credits/*` gate

When the MCP HTTP gateway runs with `CLAWQL_AUTH_MODE=apiKey|oidc`, non-public credits HATEOAS routes require the same ATR claims as MCP. Shareable pay / QR / invite landings stay public; **stage**, **accept**, **approve**, and **confirm** require auth. With `CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL=1`, stage/accept/confirm also need MFA-class `acr`/`amr`.

See [`credits-deeplinks.md`](../payments/credits-deeplinks.md).

## Shared step-up

| Primitive             | Module                         | Notes                             |
| --------------------- | ------------------------------ | --------------------------------- |
| TOTP (RFC 6238)       | `clawql-auth` `step-up/totp`   | `*Effect` API; used by payments   |
| File enrollment store | `createStepUpStoreLayer(path)` | `StepUpStoreService`; mode `0600` |
| WebAuthn              | `WebAuthnStepUpVerifier`       | Pluggable; default fails closed   |

Payments path: `$CLAWQL_HOME/Payments/step-up-totp.json` via `clawql payments credits step-up enroll`. Secrets never go in payment WORM.

### Passkeys / FIDO2 (not “YubiKey support”)

Enterprise often asks for YubiKeys because they already use them for commit signing and MFA. **Build for the standards they speak** — FIDO2 / WebAuthn — and you also cover Touch ID, Windows Hello, phone passkeys, and Titan keys. Do not ship a YubiKey-only integration.

| Category                     | Examples                                            | WebAuthn `authenticatorAttachment` |
| ---------------------------- | --------------------------------------------------- | ---------------------------------- |
| **Platform** (built-in)      | Face ID, Touch ID, Windows Hello, Android biometric | `platform`                         |
| **Roaming** (external FIDO2) | YubiKey 5 / Bio, Google Titan, Feitian              | `cross-platform`                   |

`residentKey: 'required'` + `userVerification: 'required'` is what triggers the OS biometric / PIN prompt for platform authenticators. The browser or OS owns that prompt — ClawQL never receives biometric raw data; private keys stay in Secure Enclave, TPM, or the hardware token.

Omit `authenticatorAttachment` (recommended default) so the browser offers both biometrics and hardware keys. Map product policy via `buildPasskeyAuthenticatorSelection`:

```ts
import { buildPasskeyAuthenticatorSelection } from "clawql-auth";

// User chooses (Face ID *or* YubiKey)
buildPasskeyAuthenticatorSelection();

// Enterprise: hardware token only
buildPasskeyAuthenticatorSelection({ requirement: "hardware-only" });
// → authenticatorAttachment: "cross-platform"

// Device biometric only
buildPasskeyAuthenticatorSelection({ requirement: "biometric-only" });
// → authenticatorAttachment: "platform"
```

#### Where to invest

1. **Sign-in — mostly configuration.** Prefer the customer IdP (Okta / Entra) for human SSO; those already enforce hardware keys when the org requires them. Managed Supabase Auth passkeys (beta) and supabase-js WebAuthn MFA (experimental) can cover self-hosted console login — **pin versions** while those APIs stabilize. Prefer IdP passkeys when available; use ClawQL helpers when a host wires `@simplewebauthn/server` for primary passkey / operator pairing.

2. **Step-up for high-risk actions — the strongest product use.** Require a fresh authenticator ceremony to approve a mandate, approve a proposed source, delete an account, or issue an API key. Unlike phone push, a physical key touch resists phishing and approval fatigue. **Bind the WebAuthn challenge to the hash of the exact change** (same argument-binding idea as mandates). The authenticator signs _that_ approval; the WORM trail keeps a hardware-attested record of who approved what. TOTP must not satisfy these gates (phishable under real-time relay). Binding rules: [below](#challenge-bound-step-up-binding-build).

3. **Signing (supply chain / git).** Cosign can use keys on hardware tokens for release manifests. Humans sign git commits/tags with FIDO2 SSH or GPG-on-token; agents sign with KMS service keys — so authorship stays distinguishable. Umbrella Helm / release policy remains “hardware-backed human signature required” where already documented.

4. **Mobile.** Native apps use passkeys, or NFC read of a FIDO2 key (e.g. Yubico mobile SDK). Phone approval then becomes tap-to-approve, not push-to-fatigue.

#### TOTP and Yubico Authenticator

Yubico Authenticator is TOTP with secrets stored on the key. Any standard TOTP path works with it automatically — keep TOTP as a **fallback** for lower-risk step-up (e.g. confirm a payment stage). **Do not accept TOTP for high-risk approvals** listed above.

#### Enrollment cautions

- Require **at least two** registered authenticators **plus recovery codes** so losing a single key does not lock the operator out.
- Supabase passkeys / WebAuthn MFA: treat as beta/experimental until stable; pin client and server versions.

### Challenge-bound step-up (binding build)

These rules decide whether the ceremony actually holds. Implement them before calling high-risk gates “hardware-backed.”

1. **Bind the challenge to the exact change, server-side.** Generate a random, single-use challenge that expires within minutes. Persist it with: action id, **canonical argument hash** (reuse the same canonicalization mandates already hash — parsing differences must not split them), principal, and session. At execution, accept the approval only if `hash(about-to-run) === stored hash`. Never trust a client-supplied action hash as the binding target.

2. **The key signs blind — the screen must be trustworthy.** A security key never displays the change; it only proves the user approved the **server’s** record. Render the approval UI from that same server-side canonical record (never from client-posted display fields). Show a short digest of the action hash so the operator can spot a mismatch. Otherwise a compromised page can display A while requesting approval for B.

3. **Require user verification, not just presence.** Set `userVerification: "required"` and **check the UV flag** in authenticator data. A PIN or biometric must succeed; a bare touch (presence only) is insufficient for high-risk gates.

4. **Decide whether synced passkeys count.** Synced passkeys resist phishing but are not tied to one device. When enterprise policy requires hardware-only approvals: request attestation, allowlist authenticator models by **AAGUID** (FIDO Metadata Service), and reject platform/synced authenticators for those gates. Default product path may allow synced passkeys for lower friction; high-assurance tenants opt into hardware-only.

5. **Check signature counters where they exist.** A counter that goes **backward** suggests a cloned authenticator — reject. Synced passkeys often report `0`; treat `0` as “no counter” (skip clone check), not as failure.

6. **Mint the gdp-ts proof only after verification succeeds.** Trusted module returns something like `StepUpVerified<Principal, ActionHash>` only after the ceremony + hash match + UV (and attestation policy if required). The four high-risk sensitive functions demand that proof about the named principal and action hash ([ADR 0013](../adr/0013-gdp-ts-compile-time-auth-proofs.md) mint-at-check / never-store). Pair with the existing two-party rule: approver ≠ requester for source approve / mandate where applicable. Never accept a proof object from the client.

7. **Log evidence, not personal data, to WORM:** hashed credential id, authenticator AAGUID, UV flag, challenge hash, and action hash. No biometric material, no raw credential id in the clear, no display PII beyond what the action already requires.

## `createClawQLAuth`

```ts
import { Effect } from "effect";
import { createClawQLAuth } from "clawql-auth";

const auth = createClawQLAuth({
  mode: "oidc",
  stepUpStorePath: process.env.CLAWQL_STEP_UP_PATH,
});
// `resolveClaimsAsync` is a thin runPromise wrapper kept for Express / MCP hosts.
const result = await auth.resolveClaimsAsync(req.headers);
if (result.ok) {
  await Effect.runPromise(
    auth.assertToolAccessEffect(result.claims, "payments_credits_transfer_confirm")
  );
}
```

## Explicitly out of scope

- SAML / LDAP protocol servers (roadmap may add **client** modes later)
- User registration, password reset, email OTP delivery
- Replacing Okta / Entra / Auth0

See also: [`clawql-defense-in-depth-security-guide.md`](./clawql-defense-in-depth-security-guide.md), package README [`packages/clawql-auth/README.md`](../../packages/clawql-auth/README.md), OAuth / MCP OAuth 2.1 package roadmap [`clawql-auth-package-spec.md`](./clawql-auth-package-spec.md).
