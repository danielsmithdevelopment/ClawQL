/**
 * Phase 5 — passkey (WebAuthn) as primary inbound login → ATR claims.
 * Host injects {@link WebAuthnStepUpVerifier} and {@link PasskeyCredentialStore}.
 */

import { randomBytes } from "node:crypto";
import { Data, Effect } from "effect";

import type { AtrClaims } from "../gateway.js";
import type { SecretStore } from "../stores/types.js";
import { SecretStoreError } from "../stores/types.js";
import type { WebAuthnStepUpVerifier } from "../step-up/webauthn.js";
import { requireWebAuthnStepUpEffect } from "../step-up/webauthn.js";

export class PrimaryPasskeyError extends Data.TaggedError("PrimaryPasskeyError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type PasskeyCredentialRecord = {
  subjectId: string;
  credentialId: string;
  label?: string;
  enrolledAt: string;
};

export type PasskeyCredentialStore = {
  getByCredentialId: (
    credentialId: string
  ) => Effect.Effect<PasskeyCredentialRecord | null, PrimaryPasskeyError>;
  listBySubject: (
    subjectId: string
  ) => Effect.Effect<PasskeyCredentialRecord[], PrimaryPasskeyError>;
};

export type PasskeyLoginChallenge = {
  challenge: string;
  expiresAtMs: number;
  rpId?: string;
  origin?: string;
};

export type PrimaryPasskeyLoginInput = {
  credentialId: string;
  assertion: unknown;
  role?: string;
  scope?: string[];
  rpId?: string;
  origin?: string;
};

const NONCE_PURPOSE = "passkey-login";
const DEFAULT_TTL_SECONDS = 300;

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function createMemoryPasskeyCredentialStore(
  initial: PasskeyCredentialRecord[] = []
): PasskeyCredentialStore {
  const byCred = new Map(initial.map((r) => [r.credentialId, r]));
  const bySubject = new Map<string, PasskeyCredentialRecord[]>();
  for (const row of initial) {
    const list = bySubject.get(row.subjectId) ?? [];
    list.push(row);
    bySubject.set(row.subjectId, list);
  }
  return {
    getByCredentialId: (credentialId) => Effect.sync(() => byCred.get(credentialId) ?? null),
    listBySubject: (subjectId) => Effect.sync(() => bySubject.get(subjectId) ?? []),
  };
}

/**
 * Issue a one-time WebAuthn challenge stored in {@link SecretStore}.
 */
export function issuePasskeyLoginChallengeEffect(input: {
  store: SecretStore;
  subjectId: string;
  rpId?: string;
  origin?: string;
  ttlSeconds?: number;
  now?: () => number;
}): Effect.Effect<PasskeyLoginChallenge, PrimaryPasskeyError | SecretStoreError> {
  return Effect.gen(function* () {
    const now = input.now?.() ?? Date.now();
    const ttl = (input.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;
    const challenge = toBase64Url(randomBytes(32));
    const expiresAtMs = now + ttl;

    yield* input.store.storeNonce(challenge, {
      nonce: challenge,
      purpose: NONCE_PURPOSE,
      createdAtMs: now,
      expiresAtMs,
      meta: {
        subjectId: input.subjectId,
        ...(input.rpId ? { rpId: input.rpId } : {}),
        ...(input.origin ? { origin: input.origin } : {}),
      },
    });

    return { challenge, expiresAtMs, rpId: input.rpId, origin: input.origin };
  });
}

/**
 * Verify a passkey assertion against a stored challenge and return ATR claims.
 */
export function primaryPasskeyLoginEffect(input: {
  verifier: WebAuthnStepUpVerifier;
  credentials: PasskeyCredentialStore;
  store: SecretStore;
  login: PrimaryPasskeyLoginInput;
  challenge: string;
  now?: () => number;
}): Effect.Effect<AtrClaims, PrimaryPasskeyError | SecretStoreError> {
  return Effect.gen(function* () {
    const cred = yield* input.credentials.getByCredentialId(input.login.credentialId);
    if (!cred) {
      return yield* Effect.fail(new PrimaryPasskeyError({ reason: "unknown_credential" }));
    }

    const stored = yield* input.store.getNonce(input.challenge);
    if (!stored || stored.purpose !== NONCE_PURPOSE) {
      return yield* Effect.fail(
        new PrimaryPasskeyError({ reason: "challenge_expired_or_missing" })
      );
    }
    const now = input.now?.() ?? Date.now();
    if (stored.consumedAtMs != null) {
      return yield* Effect.fail(new PrimaryPasskeyError({ reason: "challenge_consumed" }));
    }
    if (stored.expiresAtMs <= now) {
      return yield* Effect.fail(new PrimaryPasskeyError({ reason: "challenge_expired" }));
    }
    const meta = stored.meta ?? {};
    if (meta.subjectId && meta.subjectId !== cred.subjectId) {
      return yield* Effect.fail(new PrimaryPasskeyError({ reason: "subject_mismatch" }));
    }

    const rpId = input.login.rpId ?? meta.rpId;
    const origin = input.login.origin ?? meta.origin;

    yield* requireWebAuthnStepUpEffect(input.verifier, {
      assertion: input.login.assertion,
      expectedChallenge: input.challenge,
      rpId,
      origin,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new PrimaryPasskeyError({
            reason: "webauthn_verify_failed",
            cause,
          })
      )
    );

    yield* input.store.markNonceConsumed(input.challenge);

    return {
      sub: cred.subjectId,
      role: input.login.role ?? "operator",
      scope: input.login.scope ?? ["execute", "search", "memory"],
      mfa: true,
      amr: ["webauthn"],
    } satisfies AtrClaims;
  });
}
