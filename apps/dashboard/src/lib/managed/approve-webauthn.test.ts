import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  enrollApproveCredentialEffect,
  issueApproveChallengeEffect,
  listApproveCredentialsEffect,
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

  it("refuses a challenge when the user has no device-bound key", async () => {
    const exit = await Effect.runPromiseExit(
      issueApproveChallengeEffect({
        userId: "user_1",
        reviewId: "pex_1",
        kind: "change",
        decision: "approve",
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
        rpId: "localhost",
        env,
      }),
    );
    expect(challenge.challenge.length).toBeGreaterThan(8);
    expect(challenge.options).toBeTruthy();
  });
});
