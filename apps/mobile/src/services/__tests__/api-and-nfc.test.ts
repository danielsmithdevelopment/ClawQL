import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SESSION, REVIEWER_DEMO_SESSION } from "../../domain/fixtures";
import {
  decideReviewEffect,
  deleteAccountEffect,
  listReviewEffect,
  resetFixtureStateEffect,
  revokeConnectedAppEffect,
} from "../api";
import { approveWithSecurityKeyEffect } from "../nfc-security-key";
import { parseApprovalDeepLinkEffect } from "../push";
import { installMockNfcModuleEffect, clearMockNfcModuleEffect } from "../../../modules/clawql-nfc-security-key/src";

describe("mobile API fixture mode", () => {
  beforeEach(async () => {
    process.env.EXPO_PUBLIC_CLAWQL_FIXTURE = "1";
    await Effect.runPromise(resetFixtureStateEffect());
  });

  afterEach(async () => {
    await Effect.runPromise(clearMockNfcModuleEffect());
  });

  it("lists review queue and declines a change", async () => {
    const list = await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    expect(list.items.length).toBeGreaterThan(0);
    const id = list.items[0]!.id;
    await Effect.runPromise(
      decideReviewEffect({
        session: FIXTURE_SESSION,
        id,
        kind: "change",
        decision: "decline",
      })
    );
    const after = await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    expect(after.items.find((i) => i.id === id)).toBeUndefined();
  });

  it("revokes a connected app and deletes the account", async () => {
    await Effect.runPromise(
      revokeConnectedAppEffect({ session: FIXTURE_SESSION, clientId: "cursor-ide" })
    );
    const del = await Effect.runPromise(deleteAccountEffect(FIXTURE_SESSION));
    expect(del.ok).toBe(true);
    expect(del.jobId).toMatch(/^adj_/);
  });

  it("parses approval deep links without localhost", async () => {
    const a = await Effect.runPromise(
      parseApprovalDeepLinkEffect("clawql://review/rev_change")
    );
    const b = await Effect.runPromise(
      parseApprovalDeepLinkEffect("https://cloud.clawql.com/app/review/rev_change")
    );
    expect(a).toBe("rev_change");
    expect(b).toBe("rev_change");
  });

  it("reviewer demo approves via biometric path", async () => {
    const attestation = await Effect.runPromise(
      approveWithSecurityKeyEffect({
        session: REVIEWER_DEMO_SESSION,
        requestId: "rev_change",
        digest: "4e7c…91ab",
      })
    );
    expect(attestation.method).toBe("device_biometric_reviewer_demo");
    expect(attestation.auditedAsReviewerDemo).toBe(true);

    const res = await Effect.runPromise(
      decideReviewEffect({
        session: REVIEWER_DEMO_SESSION,
        id: "rev_change",
        kind: "change",
        decision: "approve",
        approvalProof: {
          method: attestation.method,
          attestation: attestation.attestation,
        },
      })
    );
    expect(res.status).toBe("approve");
  });

  it("production session fails NFC when module missing", async () => {
    const exit = await Effect.runPromiseExit(
      approveWithSecurityKeyEffect({
        session: FIXTURE_SESSION,
        requestId: "rev_change",
      })
    );
    expect(exit._tag).toBe("Failure");
  });

  it("uses injected NFC module when present", async () => {
    await Effect.runPromise(
      installMockNfcModuleEffect({
        isAvailable: async () => true,
        assertPresence: async () => ({ keyId: "yk_test" }),
        signChallenge: async () => ({
          signature: "sig",
          credentialId: "cred",
        }),
      })
    );
    const attestation = await Effect.runPromise(
      approveWithSecurityKeyEffect({
        session: FIXTURE_SESSION,
        requestId: "rev_change",
      })
    );
    expect(attestation.method).toBe("nfc_security_key");
    expect(attestation.attestation).toContain("cred");
  });
});
