/**
 * WebAuthn / passkey step-up — pluggable verifier interface.
 *
 * ClawQL is not an IdP. Prefer enterprise IdP WebAuthn (passkeys) for human SSO.
 * This package exposes a hook so high-impact tools (payments, etc.) can require a
 * second factor when the host wires a verifier (e.g. @simplewebauthn/server).
 *
 * Effect is the primary surface: {@link requireWebAuthnStepUpEffect} fails on the typed
 * {@link WebAuthnStepUpError} channel. The Promise `requireWebAuthnStepUp` is a forced-edge façade.
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

/**
 * Require a successful WebAuthn assertion.
 * Forced-edge Promise façade — prefer {@link requireWebAuthnStepUpEffect}.
 */
export async function requireWebAuthnStepUp(
  verifier: WebAuthnStepUpVerifier,
  input: WebAuthnAssertionInput
): Promise<void> {
  const result = await verifier.verifyAssertion(input);
  if (!result.ok) {
    throw new Error("WebAuthn step-up failed");
  }
}
