/**
 * Optional host verifier backed by `@simplewebauthn/server`.
 * Peer dependency — fails closed with a clear error when the package is not installed.
 */

import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Effect } from "effect";

import type { WebAuthnAssertionInput, WebAuthnStepUpVerifier } from "./webauthn.js";

export type SimpleWebAuthnVerifierOptions = {
  rpId: string;
  origin: string | string[];
};

function decodePublicKey(base64url: string): Uint8Array {
  return Buffer.from(base64url, "base64url");
}

/**
 * Build a {@link WebAuthnStepUpVerifier} using SimpleWebAuthn's
 * `verifyAuthenticationResponse`. Requires credential public key on the input.
 */
export function createSimpleWebAuthnVerifier(
  options: SimpleWebAuthnVerifierOptions
): WebAuthnStepUpVerifier {
  return {
    async verifyAssertion(input: WebAuthnAssertionInput) {
      const sw = await import("@simplewebauthn/server");
      if (!input.credential?.publicKey?.length) {
        throw new Error("webauthn_credential_public_key_required");
      }
      const expectedOrigins = Array.isArray(options.origin) ? options.origin : [options.origin];
      const result = await sw.verifyAuthenticationResponse({
        response: input.assertion as AuthenticationResponseJSON,
        expectedChallenge: input.expectedChallenge,
        expectedOrigin: expectedOrigins,
        expectedRPID: input.rpId ?? options.rpId,
        credential: {
          id: input.credential.id,
          publicKey: new Uint8Array(input.credential.publicKey),
          counter: input.credential.counter,
          transports: input.credential.transports as AuthenticatorTransportFuture[] | undefined,
        },
      });
      if (!result.verified) {
        throw new Error("webauthn_assertion_not_verified");
      }
      return {
        ok: true as const,
        userHandle: result.authenticationInfo?.userVerified ? input.credential.id : undefined,
        newCounter: result.authenticationInfo?.newCounter,
      };
    },
  };
}

export type VerifyPasskeyRegistrationInput = {
  response: unknown;
  expectedChallenge: string;
  rpId?: string;
  origin?: string | string[];
};

export type VerifiedPasskeyRegistration = {
  credentialId: string;
  publicKeyBase64Url: string;
  counter: number;
  transports?: string[];
};

/** Effect wrapper around SimpleWebAuthn `verifyRegistrationResponse`. */
export function verifyPasskeyRegistrationEffect(
  options: SimpleWebAuthnVerifierOptions,
  input: VerifyPasskeyRegistrationInput
): Effect.Effect<VerifiedPasskeyRegistration, Error> {
  return Effect.tryPromise({
    try: async () => {
      const sw = await import("@simplewebauthn/server");
      const expectedOrigins = Array.isArray(input.origin ?? options.origin)
        ? ((input.origin ?? options.origin) as string[])
        : [String(input.origin ?? options.origin)];
      const result = await sw.verifyRegistrationResponse({
        response: input.response as RegistrationResponseJSON,
        expectedChallenge: input.expectedChallenge,
        expectedOrigin: expectedOrigins,
        expectedRPID: input.rpId ?? options.rpId,
      });
      if (!result.verified || !result.registrationInfo) {
        throw new Error("webauthn_registration_not_verified");
      }
      const { credential, credentialDeviceType: _dt } = result.registrationInfo;
      return {
        credentialId: credential.id,
        publicKeyBase64Url: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports?.map(String),
      };
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export function publicKeyFromPasskeyRecord(publicKeyBase64Url: string): Uint8Array {
  return decodePublicKey(publicKeyBase64Url);
}
