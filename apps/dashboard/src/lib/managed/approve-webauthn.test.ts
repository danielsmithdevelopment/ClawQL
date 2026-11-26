import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  enrollApproveCredentialEffect,
  issueApproveChallengeEffect,
  issueEnrollChallengeEffect,
  listApproveCredentialsEffect,
  recentAuthSatisfied,
} from "./approve-webauthn";

describe("approve-webauthn store", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-approve-wa-"));
    env = { ...process.env, CLAWQL_HOME: home };
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("refuses a challenge when the user has no passkey", async () => {
    const exit = await Effect.runPromiseExit(
      issueApproveChallengeEffect({
        userId: "user_1",
        reviewId: "pex_1",
        kind: "change",
        decision: "approve",
        changeHash: "hash_abc",
        rpId: "localhost",
        env,
      }),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("issues a challenge after enroll and lists the credential", async () => {
    await Effect.runPromise(
      enrollApproveCredentialEffect(
        {
          subjectId: "user_1",
          credentialId: "cred_abc",
          publicKeyBase64Url: Buffer.from("not-a-real-key").toString("base64url"),
          counter: 0,
          label: "YubiKey",
          canApprove: true,
        },
        env,
      ),
    );
    const listed = await Effect.runPromise(listApproveCredentialsEffect("user_1", env));
    expect(listed).toHaveLength(1);
    expect(listed[0]?.credentialId).toBe("cred_abc");

    const challenge = await Effect.runPromise(
      issueApproveChallengeEffect({
        userId: "user_1",
        reviewId: "pex_1",
        kind: "change",
        decision: "approve",
        changeHash: "hash_abc",
        rpId: "localhost",
        env,
      }),
    );
    expect(challenge.challenge.length).toBeGreaterThan(8);
    expect(challenge.options).toBeTruthy();
  });

  it("refuses first passkey enroll without recent sign-in (BB2)", async () => {
    const exit = await Effect.runPromiseExit(
      issueEnrollChallengeEffect({
        userId: "user_new",
        userName: "new@example.com",
        displayName: "New",
        rpId: "localhost",
        authTimeSec: Math.floor(Date.now() / 1000) - 3600,
        env,
      }),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("refuses additional enroll without an existing-passkey gate (BB2)", async () => {
    await Effect.runPromise(
      enrollApproveCredentialEffect(
        {
          subjectId: "user_1",
          credentialId: "cred_existing",
          publicKeyBase64Url: Buffer.from("not-a-real-key").toString("base64url"),
          counter: 0,
          canApprove: true,
        },
        env,
      ),
    );
    const exit = await Effect.runPromiseExit(
      issueEnrollChallengeEffect({
        userId: "user_1",
        userName: "a@example.com",
        displayName: "A",
        rpId: "localhost",
        env,
      }),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("accepts recent auth_time for first-key gating", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(recentAuthSatisfied(now - 30, 300, now)).toBe(true);
    expect(recentAuthSatisfied(now - 400, 300, now)).toBe(false);
    expect(recentAuthSatisfied(undefined, 300, now)).toBe(false);
  });
});
