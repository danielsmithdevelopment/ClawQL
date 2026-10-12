/**
 * Stub Expo module surface for NFC security-key attestation.
 * Wire iOS ASAuthorizationSecurityKeyPublicKeyCredentialProvider and
 * Android Credential Manager in a follow-up native config plugin.
 *
 * Tests / Maestro can inject `globalThis.__CLAWQL_NFC_SECURITY_KEY__`.
 */
import { Effect } from "effect";

export type ClawqlNfcSecurityKeyModule = {
  readonly isAvailable: () => Promise<boolean>;
  readonly assertPresence: () => Promise<{ keyId: string }>;
  readonly signChallenge: (input: {
    challenge: string;
    rpId: string;
  }) => Promise<{ signature: string; credentialId: string }>;
};

export function installMockNfcModuleEffect(
  module: ClawqlNfcSecurityKeyModule
): Effect.Effect<void> {
  return Effect.sync(() => {
    globalThis.__CLAWQL_NFC_SECURITY_KEY__ = module;
  });
}

export function clearMockNfcModuleEffect(): Effect.Effect<void> {
  return Effect.sync(() => {
    delete globalThis.__CLAWQL_NFC_SECURITY_KEY__;
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __CLAWQL_NFC_SECURITY_KEY__: ClawqlNfcSecurityKeyModule | undefined;
}
