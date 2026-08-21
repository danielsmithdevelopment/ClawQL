/**
 * WebAuthn / passkey authenticator selection helpers.
 *
 * Face ID, Touch ID, and Windows Hello are **platform** authenticators.
 * YubiKey / Titan / other FIDO2 keys are **cross-platform (roaming)** authenticators.
 * Both are covered by the same WebAuthn ceremony — ClawQL never sees biometric raw data;
 * private keys stay in Secure Enclave / TPM / hardware token.
 *
 * Prefer IdP passkeys for human SSO. These helpers are for hosts that wire a real
 * WebAuthn stack (e.g. @simplewebauthn/server) for ClawQL step-up or operator pairing.
 */

/** Controls which authenticator category the browser offers during registration. */
export type PasskeyAuthenticatorRequirement =
  | "hardware-only"
  | "biometric-only"
  | undefined;

/**
 * WebAuthn `authenticatorAttachment`:
 * - `platform` → Face ID / Touch ID / Windows Hello / Android biometric
 * - `cross-platform` → YubiKey, Titan, Feitian, and other FIDO2 roaming keys
 * - omit → browser offers both; user chooses (recommended default)
 */
export type AuthenticatorAttachment = "platform" | "cross-platform";

export type PasskeyAuthenticatorSelection = {
  residentKey: "required";
  userVerification: "required";
  /**
   * When omitted, browsers typically offer both platform biometrics and
   * external FIDO2 keys. Set only when policy forces one category.
   */
  authenticatorAttachment?: AuthenticatorAttachment;
};

/**
 * Map product-level requirement → WebAuthn `authenticatorAttachment`.
 * Default (`undefined`) leaves attachment unset so the user can choose.
 */
export function resolveAuthenticatorAttachment(
  requirement?: PasskeyAuthenticatorRequirement
): AuthenticatorAttachment | undefined {
  if (requirement === "hardware-only") return "cross-platform";
  if (requirement === "biometric-only") return "platform";
  return undefined;
}

/**
 * Build `authenticatorSelection` for WebAuthn registration ceremonies.
 *
 * - `residentKey: 'required'` + `userVerification: 'required'` is what triggers
 *   Face ID / Touch ID / Windows Hello when a platform authenticator is used.
 * - YubiKey and other FIDO2 roaming authenticators use the same selection object;
 *   set `requirement: 'hardware-only'` only when enterprise policy forbids biometrics.
 */
export function buildPasskeyAuthenticatorSelection(options?: {
  requirement?: PasskeyAuthenticatorRequirement;
}): PasskeyAuthenticatorSelection {
  const authenticatorAttachment = resolveAuthenticatorAttachment(options?.requirement);
  return {
    residentKey: "required",
    userVerification: "required",
    ...(authenticatorAttachment ? { authenticatorAttachment } : {}),
  };
}

/** Human-readable catalog for docs / operator UX (not exhaustive). */
export const PASSKEY_AUTHENTICATOR_CATALOG = {
  platform: [
    "Face ID (iPhone / iPad — Secure Enclave)",
    "Touch ID (Mac / Magic Keyboard / iPhone — Secure Enclave)",
    "Windows Hello (face / fingerprint / PIN — TPM)",
    "Android platform biometric",
  ],
  roaming: [
    "YubiKey 5 series (USB-A / USB-C / NFC)",
    "YubiKey Bio",
    "Google Titan Key",
    "Feitian and other FIDO2-certified keys",
  ],
} as const;
