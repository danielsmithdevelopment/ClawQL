/**
 * WebAuthn / passkey step-up — pluggable verifier interface.
 *
 * ClawQL is not an IdP. Prefer enterprise IdP WebAuthn (passkeys) for human SSO.
 * This package exposes a hook so high-impact tools (payments, etc.) can require a
 * second factor when the host wires a verifier (e.g. @simplewebauthn/server).
 *
 * **Face ID / Touch ID / Windows Hello** are WebAuthn *platform* authenticators.
 * **YubiKey / Titan / other FIDO2 keys** are *roaming* (cross-platform) authenticators.
 * Both use the same ceremony — see {@link buildPasskeyAuthenticatorSelection}.
 * ClawQL never receives biometric raw data; keys stay in Secure Enclave / TPM / hardware.
 *
 * Effect is the only public surface: {@link requireWebAuthnStepUpEffect} fails on the typed
 * {@link WebAuthnStepUpError} channel. The injected {@link WebAuthnStepUpVerifier} is a host
 * boundary (external authenticators are inherently Promise-based).
 */

import { Data, Effect } from "effect";

export type WebAuthnAssertionInput = {
  /** Credential / assertion JSON from the authenticator. */
  assertion: unknown;
  /** Expected challenge (base64url) issued for this step-up. */
  expectedChallenge: string;
  /** Relying party ID (e.g. clawql.example.com). */
  rpId?: string;
  /** Origin (e.g. https://clawql.example.com). */
  origin?: string;
};

export type WebAuthnStepUpVerifier = {
  verifyAssertion(input: WebAuthnAssertionInput): Promise<{ ok: true; userHandle?: string }>;
};

/**
 * Placeholder verifier — fails closed until the host injects a real WebAuthn stack.
 * Phishing-resistant MFA for human login remains an IdP concern.
 */
export function createUnimplementedWebAuthnVerifier(): WebAuthnStepUpVerifier {
  return {
    async verifyAssertion() {
      throw new Error(
        "WebAuthn step-up is not configured — inject a WebAuthnStepUpVerifier or use IdP MFA + CLAWQL_AUTH_MODE=oidc"
      );
    },
  };
}

/** Typed failure for WebAuthn step-up (Effect failure channel). */
export class WebAuthnStepUpError extends Data.TaggedError("WebAuthnStepUpError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * Effect: require a successful WebAuthn assertion via the injected verifier.
 * Fails with {@link WebAuthnStepUpError} when the verifier throws or the assertion is rejected.
 */
export function requireWebAuthnStepUpEffect(
  verifier: WebAuthnStepUpVerifier,
  input: WebAuthnAssertionInput
): Effect.Effect<void, WebAuthnStepUpError> {
  return Effect.tryPromise({
    try: () => verifier.verifyAssertion(input),
    catch: (cause) =>
      new WebAuthnStepUpError({
        reason: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  }).pipe(
    Effect.flatMap((result) =>
      result.ok
        ? Effect.void
        : Effect.fail(new WebAuthnStepUpError({ reason: "WebAuthn step-up failed" }))
    )
  );
}
