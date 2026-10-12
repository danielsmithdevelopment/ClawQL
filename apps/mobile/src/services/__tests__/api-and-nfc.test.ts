import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SESSION, REVIEWER_DEMO_SESSION } from "../../domain/fixtures";
import {
  decideReviewEffect,
  deleteAccountEffect,
  endOtherDeviceSessionsEffect,
  getReviewByIdEffect,
  listActivityEffect,
  listDeviceSessionsEffect,
  listReviewEffect,
  pendingReviewCountEffect,
  resetFixtureStateEffect,
  revokeConnectedAppEffect,
} from "../api";
import { approveWithSecurityKeyEffect } from "../nfc-security-key";
import {
  parseApprovalDeepLinkEffect,
  parseApprovalNotificationDataEffect,
  scheduleLocalApprovalNotificationEffect,
} from "../push";
import {
  installMockNfcModuleEffect,
  clearMockNfcModuleEffect,
} from "../../../modules/clawql-nfc-security-key/src";

describe("mobile API fixture mode", () => {
  beforeEach(async () => {
    process.env.EXPO_PUBLIC_CLAWQL_FIXTURE = "1";
    await Effect.runPromise(resetFixtureStateEffect());
  });

  afterEach(async () => {
    await Effect.runPromise(clearMockNfcModuleEffect());
    process.env.EXPO_PUBLIC_CLAWQL_FIXTURE = "1";
  });

  it("lists review queue and declines a change", async () => {
    const list = await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    expect(list.items.length).toBeGreaterThan(0);
    const id = list.items.find((i) => i.kind === "change")!.id;
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

  it("filters review queue by kind", async () => {
    const skills = await Effect.runPromise(
      listReviewEffect(FIXTURE_SESSION, { kind: "skill" })
    );
    expect(skills.items.every((i) => i.kind === "skill")).toBe(true);
    expect(skills.items[0]?.id).toBe("rev_skill");
  });

  it("gets a review item by id", async () => {
    const item = await Effect.runPromise(
      getReviewByIdEffect(FIXTURE_SESSION, "rev_decision")
    );
    expect(item?.kind).toBe("decision");
    expect(item?.decisionChoices?.length).toBeGreaterThan(0);
  });

  it("answers a decision and records activity", async () => {
    await Effect.runPromise(
      decideReviewEffect({
        session: FIXTURE_SESSION,
        id: "rev_decision",
        kind: "decision",
        decision: "answer",
        answer: "Refund request",
      })
    );
    const list = await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    expect(list.items.find((i) => i.id === "rev_decision")).toBeUndefined();
    const activity = await Effect.runPromise(listActivityEffect(FIXTURE_SESSION));
    expect(activity.events[0]?.decision).toBe("answer");
    expect(activity.events[0]?.detail).toBe("Refund request");
  });

  it("archives decided items for Activity drill-in", async () => {
    await Effect.runPromise(
      decideReviewEffect({
        session: FIXTURE_SESSION,
        id: "rev_source",
        kind: "source",
        decision: "decline",
      })
    );
    const archived = await Effect.runPromise(
      getReviewByIdEffect(FIXTURE_SESSION, "rev_source")
    );
    expect(archived?.decidedStatus).toBe("decline");
    expect(archived?.decidedAtMs).toBeTypeOf("number");
  });

  it("ends other device sessions", async () => {
    const before = await Effect.runPromise(listDeviceSessionsEffect(FIXTURE_SESSION));
    expect(before.length).toBeGreaterThan(1);
    const res = await Effect.runPromise(endOtherDeviceSessionsEffect(FIXTURE_SESSION));
    expect(res.ended).toBeGreaterThan(0);
    const after = await Effect.runPromise(listDeviceSessionsEffect(FIXTURE_SESSION));
    expect(after.every((s) => s.current)).toBe(true);
  });

  it("reports pending review count", async () => {
    const n = await Effect.runPromise(pendingReviewCountEffect(FIXTURE_SESSION));
    expect(n).toBeGreaterThan(0);
  });

  it("parses notification payload and schedules local fixture push", async () => {
    const id = await Effect.runPromise(
      parseApprovalNotificationDataEffect({
        type: "approval_request",
        requestId: "rev_change",
      })
    );
    expect(id).toBe("rev_change");
    const scheduled = await Effect.runPromise(
      scheduleLocalApprovalNotificationEffect({ requestId: "rev_change", delaySeconds: 1 })
    );
    expect(scheduled.notificationId).toBeTruthy();
  });

  it("promotes a skill with simulated fixture NFC", async () => {
    const attestation = await Effect.runPromise(
      approveWithSecurityKeyEffect({
        session: FIXTURE_SESSION,
        requestId: "rev_skill",
      })
    );
    expect(attestation.method).toBe("nfc_security_key");
    expect(attestation.simulatedFixture).toBe(true);
    expect(attestation.attestation).toMatch(/^fixture-nfc:/);

    const res = await Effect.runPromise(
      decideReviewEffect({
        session: FIXTURE_SESSION,
        id: "rev_skill",
        kind: "skill",
        decision: "approve",
        approvalProof: {
          method: attestation.method,
          attestation: attestation.attestation,
        },
      })
    );
    expect(res.status).toBe("approve");
  });

  it("handles outcome_unknown mark_applied and retry_with_key", async () => {
    await Effect.runPromise(
      decideReviewEffect({
        session: FIXTURE_SESSION,
        id: "rev_change_unknown",
        kind: "change",
        decision: "retry_with_key",
      })
    );
    let list = await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    expect(list.items.find((i) => i.id === "rev_change_unknown")).toBeDefined();

    await Effect.runPromise(
      decideReviewEffect({
        session: FIXTURE_SESSION,
        id: "rev_change_unknown",
        kind: "change",
        decision: "mark_applied",
      })
    );
    list = await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    expect(list.items.find((i) => i.id === "rev_change_unknown")).toBeUndefined();
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

  it("production session fails NFC when module missing and fixture off", async () => {
    process.env.EXPO_PUBLIC_CLAWQL_FIXTURE = "0";
    const prodSession = {
      ...FIXTURE_SESSION,
      accessToken: "live-access-token",
      reviewerDemo: false,
    };
    const exit = await Effect.runPromiseExit(
      approveWithSecurityKeyEffect({
        session: prodSession,
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
    expect(attestation.simulatedFixture).toBe(false);
  });
});
