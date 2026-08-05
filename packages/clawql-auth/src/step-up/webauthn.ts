/**
 * WebAuthn / passkey step-up — pluggable verifier interface.
 *
 * ClawQL is not an IdP. Prefer enterprise IdP WebAuthn (passkeys) for human SSO.
 * This package exposes a hook so high-impact tools (payments, etc.) can require a
 * second factor when the host wires a verifier (e.g. @simplewebauthn/server).
 */

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

export async function requireWebAuthnStepUp(
  verifier: WebAuthnStepUpVerifier,
  input: WebAuthnAssertionInput
): Promise<void> {
  const result = await verifier.verifyAssertion(input);
  if (!result.ok) {
    throw new Error("WebAuthn step-up failed");
  }
}
