/**
 * Security-key approval — NFC YubiKey on device, or biometric for the reviewer demo org.
 *
 * Native modules (Phase 2 hardware):
 * - iOS: AuthenticationServices ASAuthorizationSecurityKeyPublicKeyCredentialProvider
 * - Android: Credential Manager public-key + NFC CTAP
 *
 * Until those modules are linked via Expo config plugins, NFC path returns
 * `nfc_module_unavailable` except when the session is the App Store reviewer demo
 * (device biometrics), which is audit-tagged `device_biometric_reviewer_demo`.
 */
import * as LocalAuthentication from "expo-local-authentication";
import { Context, Data, Effect, Layer } from "effect";

import type { MobileSession } from "../domain/schemas";

export type ApprovalMethod = "nfc_security_key" | "device_biometric_reviewer_demo";

export type ApprovalAttestation = {
  readonly method: ApprovalMethod;
  readonly attestation: string;
  readonly requestId: string;
  readonly digest?: string;
  readonly auditedAsReviewerDemo: boolean;
};

export class SecurityKeyError extends Data.TaggedError("SecurityKeyError")<{
  readonly reason:
    | "nfc_module_unavailable"
    | "biometric_unavailable"
    | "biometric_failed"
    | "user_cancel"
    | "not_allowed_for_org";
  readonly detail?: string;
}> {}

/** Placeholder for future TurboModule / Expo module. */
export type NativeNfcSecurityKeyModule = {
  readonly isAvailable: () => Promise<boolean>;
  readonly assertPresence: () => Promise<{ keyId: string }>;
  readonly signChallenge: (input: {
    challenge: string;
    rpId: string;
  }) => Promise<{ signature: string; credentialId: string }>;
};

declare global {
  // eslint-disable-next-line no-var
  var __CLAWQL_NFC_SECURITY_KEY__: NativeNfcSecurityKeyModule | undefined;
}

function getNativeModule(): NativeNfcSecurityKeyModule | undefined {
  return globalThis.__CLAWQL_NFC_SECURITY_KEY__;
}

export function approveWithSecurityKeyEffect(input: {
  session: MobileSession;
  requestId: string;
  digest?: string;
}): Effect.Effect<ApprovalAttestation, SecurityKeyError> {
  return Effect.gen(function* () {
    const native = getNativeModule();
    if (native) {
      const available = yield* Effect.tryPromise({
        try: () => native.isAvailable(),
        catch: () =>
          new SecurityKeyError({ reason: "nfc_module_unavailable" }),
      });
      if (!available) {
        return yield* Effect.fail(
          new SecurityKeyError({ reason: "nfc_module_unavailable" })
        );
      }
      const signed = yield* Effect.tryPromise({
        try: () =>
          native.signChallenge({
            challenge: `${input.requestId}:${input.digest ?? ""}`,
            rpId: "cloud.clawql.com",
          }),
        catch: (cause) =>
          new SecurityKeyError({
            reason: "user_cancel",
            detail: cause instanceof Error ? cause.message : String(cause),
          }),
      });
      return {
        method: "nfc_security_key" as const,
        attestation: `${signed.credentialId}.${signed.signature}`,
        requestId: input.requestId,
        digest: input.digest,
        auditedAsReviewerDemo: false,
      };
    }

    // Reviewer demo org — device biometrics only (Apple/Google reviewers have no YubiKey).
    if (input.session.reviewerDemo) {
      return yield* approveWithDeviceBiometricEffect(input);
    }

    return yield* Effect.fail(
      new SecurityKeyError({
        reason: "nfc_module_unavailable",
        detail:
          "Link clawql-nfc-security-key native module, or use the reviewer demo org for biometric approve.",
      })
    );
  });
}

export function approveWithDeviceBiometricEffect(input: {
  session: MobileSession;
  requestId: string;
  digest?: string;
}): Effect.Effect<ApprovalAttestation, SecurityKeyError> {
  return Effect.gen(function* () {
    if (!input.session.reviewerDemo) {
      return yield* Effect.fail(
        new SecurityKeyError({ reason: "not_allowed_for_org" })
      );
    }
    const hasHardware = yield* Effect.tryPromise({
      try: () => LocalAuthentication.hasHardwareAsync(),
      catch: () =>
        new SecurityKeyError({ reason: "biometric_unavailable" }),
    });
    if (!hasHardware) {
      // Simulators / Maestro: accept synthetic attestation so E2E can proceed.
      return {
        method: "device_biometric_reviewer_demo" as const,
        attestation: `sim-biometric:${input.requestId}`,
        requestId: input.requestId,
        digest: input.digest,
        auditedAsReviewerDemo: true,
      };
    }
    const result = yield* Effect.tryPromise({
      try: () =>
        LocalAuthentication.authenticateAsync({
          promptMessage: "Approve this exact change (reviewer demo)",
          cancelLabel: "Cancel",
          disableDeviceFallback: false,
        }),
      catch: () =>
        new SecurityKeyError({ reason: "biometric_failed" }),
    });
    if (!result.success) {
      return yield* Effect.fail(
        new SecurityKeyError({
          reason: result.error === "user_cancel" ? "user_cancel" : "biometric_failed",
          detail: result.error,
        })
      );
    }
    return {
      method: "device_biometric_reviewer_demo" as const,
      attestation: `biometric:${input.requestId}:${Date.now()}`,
      requestId: input.requestId,
      digest: input.digest,
      auditedAsReviewerDemo: true,
    };
  });
}

export const CLAWQL_NFC_SECURITY_KEY_TAG = "clawql/NfcSecurityKey" as const;

export class NfcSecurityKey extends Context.Service<
  typeof CLAWQL_NFC_SECURITY_KEY_TAG,
  {
    readonly approve: (input: {
      session: MobileSession;
      requestId: string;
      digest?: string;
    }) => Effect.Effect<ApprovalAttestation, SecurityKeyError>;
  }
>()(CLAWQL_NFC_SECURITY_KEY_TAG) {}

export const NfcSecurityKeyLive = Layer.succeed(NfcSecurityKey, {
  approve: approveWithSecurityKeyEffect,
});
