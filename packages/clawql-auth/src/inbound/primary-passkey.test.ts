import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createMemorySecretStore } from "../stores/memory.js";
import {
  PrimaryPasskeyError,
  createMemoryPasskeyCredentialStore,
  issuePasskeyLoginChallengeEffect,
  primaryPasskeyLoginEffect,
} from "./primary-passkey.js";
import type { WebAuthnStepUpVerifier } from "../step-up/webauthn.js";

describe("primaryPasskeyLoginEffect", () => {
  it("issues challenge and verifies assertion via injected verifier", async () => {
    const store = createMemorySecretStore();
    const credentials = createMemoryPasskeyCredentialStore([
      {
        subjectId: "user-1",
        credentialId: "cred-abc",
        enrolledAt: new Date().toISOString(),
      },
    ]);
    const challenge = await Effect.runPromise(
      issuePasskeyLoginChallengeEffect({
        store,
        subjectId: "user-1",
        rpId: "clawql.test",
        origin: "https://clawql.test",
        now: () => 1_000_000,
      })
    );

    const verifier: WebAuthnStepUpVerifier = {
      async verifyAssertion(input) {
        expect(input.expectedChallenge).toBe(challenge.challenge);
        return { ok: true, userHandle: "user-1" };
      },
    };

    const claims = await Effect.runPromise(
      primaryPasskeyLoginEffect({
        verifier,
        credentials,
        store,
        challenge: challenge.challenge,
        login: {
          credentialId: "cred-abc",
          assertion: { id: "cred-abc", response: {} },
        },
        now: () => 1_000_500,
      })
    );

    expect(claims.sub).toBe("user-1");
    expect(claims.amr).toEqual(["webauthn"]);
    expect(claims.mfa).toBe(true);
  });

  it("rejects unknown credentials and replayed challenges", async () => {
    const store = createMemorySecretStore();
    const credentials = createMemoryPasskeyCredentialStore([]);
    const verifier: WebAuthnStepUpVerifier = {
      async verifyAssertion() {
        return { ok: true };
      },
    };

    const challenge = await Effect.runPromise(
      issuePasskeyLoginChallengeEffect({
        store,
        subjectId: "user-1",
        now: () => 1_000_000,
      })
    );

    const missing = await Effect.runPromiseExit(
      primaryPasskeyLoginEffect({
        verifier,
        credentials,
        store,
        challenge: challenge.challenge,
        login: { credentialId: "missing", assertion: {} },
      })
    );
    expect(missing._tag).toBe("Failure");
    if (missing._tag === "Failure" && missing.cause._tag === "Fail") {
      expect((missing.cause.error as PrimaryPasskeyError).reason).toBe("unknown_credential");
    }

    await Effect.runPromise(
      primaryPasskeyLoginEffect({
        verifier,
        credentials: createMemoryPasskeyCredentialStore([
          {
            subjectId: "user-1",
            credentialId: "cred-abc",
            enrolledAt: new Date().toISOString(),
          },
        ]),
        store,
        challenge: challenge.challenge,
        login: { credentialId: "cred-abc", assertion: {} },
        now: () => 1_000_500,
      })
    );

    const replay = await Effect.runPromiseExit(
      primaryPasskeyLoginEffect({
        verifier,
        credentials: createMemoryPasskeyCredentialStore([
          {
            subjectId: "user-1",
            credentialId: "cred-abc",
            enrolledAt: new Date().toISOString(),
          },
        ]),
        store,
        challenge: challenge.challenge,
        login: { credentialId: "cred-abc", assertion: {} },
        now: () => 1_000_600,
      })
    );
    expect(replay._tag).toBe("Failure");
    if (replay._tag === "Failure" && replay.cause._tag === "Fail") {
      expect((replay.cause.error as PrimaryPasskeyError).reason).toBe("challenge_consumed");
    }
  });
});
