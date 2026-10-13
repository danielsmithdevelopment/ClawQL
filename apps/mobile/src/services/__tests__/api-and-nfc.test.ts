import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SESSION, REVIEWER_DEMO_SESSION } from "../../domain/fixtures";
import {
  addAttachmentEffect,
  decideReviewEffect,
  deleteAccountEffect,
  endOtherDeviceSessionsEffect,
  getMorningDigestEffect,
  getPolicyDetailEffect,
  getReviewByIdEffect,
  listActivityEffect,
  listAgentsEffect,
  listAttachmentsEffect,
  listDeviceSessionsEffect,
  listInboxEffect,
  listPoliciesEffect,
  listPushDevicesEffect,
  listReviewEffect,
  listTeammatesEffect,
  getNotificationPrefsEffect,
  markAllInboxReadEffect,
  markInboxReadByReviewEffect,
  markInboxReadEffect,
  pendingReviewCountEffect,
  prependInboxItemEffect,
  resetFixtureStateEffect,
  revokeConnectedAppEffect,
  setNotificationPrefsEffect,
} from "../api";
import {
  clearOfflineSnapshotEffect,
  listReviewFromCacheEffect,
  loadOfflineSnapshotEffect,
} from "../offline-cache";
import {
  ensureFreshSessionEffect,
  isSessionExpiredEffect,
  refreshSessionEffect,
} from "../auth";
import {
  loadDevicePrefsEffect,
  saveDevicePrefsEffect,
  unlockAppEffect,
} from "../device-ux";
import { captureDocumentEffect } from "../documents";
import { approveWithSecurityKeyEffect } from "../nfc-security-key";
import {
  parseApprovalDeepLinkEffect,
  parseApprovalNotificationDataEffect,
  registerForPushEffect,
  scheduleLocalApprovalNotificationEffect,
} from "../push";
import { loadSessionEffect } from "../session-store";
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

  it("asks a named teammate and records activity", async () => {
    await Effect.runPromise(
      decideReviewEffect({
        session: FIXTURE_SESSION,
        id: "rev_decision",
        kind: "decision",
        decision: "ask_teammate",
        answer: "Marcus Lee",
      })
    );
    const list = await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    expect(list.items.find((i) => i.id === "rev_decision")).toBeUndefined();
    const activity = await Effect.runPromise(listActivityEffect(FIXTURE_SESSION));
    expect(activity.events[0]?.decision).toBe("ask_teammate");
    expect(activity.events[0]?.detail).toBe("Marcus Lee");
    expect(activity.events[0]?.title).toContain("Marcus Lee");
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

  it("seeds decided archive so Activity drill-in works offline", async () => {
    const prior = await Effect.runPromise(
      getReviewByIdEffect(FIXTURE_SESSION, "rev_source_prior")
    );
    expect(prior?.decidedStatus).toBe("approve");
    expect(prior?.kind).toBe("source");
  });

  it("lists approval policies and detail", async () => {
    const policies = await Effect.runPromise(listPoliciesEffect(FIXTURE_SESSION));
    expect(policies.length).toBeGreaterThan(3);
    expect(policies.some((p) => p.blocked)).toBe(true);
    const detail = await Effect.runPromise(
      getPolicyDetailEffect(FIXTURE_SESSION, "pol_contracts")
    );
    expect(detail?.requireSecurityKey).toBe(true);
    expect(detail?.title).toMatch(/contracts/i);
  });

  it("lists agents and morning digest fixtures", async () => {
    const agents = await Effect.runPromise(listAgentsEffect(FIXTURE_SESSION));
    expect(agents.some((a) => a.status === "needs_you")).toBe(true);
    expect(agents.length).toBeGreaterThanOrEqual(3);
    const digest = await Effect.runPromise(getMorningDigestEffect(FIXTURE_SESSION));
    expect(digest.awaitingYou).toBeGreaterThan(0);
    expect(digest.items.length).toBeGreaterThan(2);
  });

  it("lists teammates and notification inbox", async () => {
    const team = await Effect.runPromise(listTeammatesEffect(FIXTURE_SESSION));
    expect(team.some((t) => t.canApprove && t.keysReady)).toBe(true);
    expect(team.some((t) => !t.canApprove)).toBe(true);
    const inbox = await Effect.runPromise(listInboxEffect(FIXTURE_SESSION));
    expect(inbox.some((i) => i.unread && i.kind === "approval")).toBe(true);
    expect(inbox.some((i) => i.kind === "digest")).toBe(true);
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

  it("registers a fixture push device token", async () => {
    const res = await Effect.runPromise(registerForPushEffect(FIXTURE_SESSION));
    expect(res.fixture).toBe(true);
    expect(res.token).toMatch(/^ExponentPushToken\[fixture-/);
    const devices = await Effect.runPromise(listPushDevicesEffect(FIXTURE_SESSION));
    expect(devices.length).toBe(1);
    expect(devices[0]?.fixture).toBe(true);
  });

  it("prepends simulated push into the notification inbox", async () => {
    const before = await Effect.runPromise(listInboxEffect(FIXTURE_SESSION));
    await Effect.runPromise(
      prependInboxItemEffect({
        id: "inbox_sim_test",
        title: "Change a contract's value",
        body: "Local push simulation",
        atMs: Date.now(),
        kind: "approval",
        reviewId: "rev_change",
        unread: true,
      })
    );
    const after = await Effect.runPromise(listInboxEffect(FIXTURE_SESSION));
    expect(after[0]?.id).toBe("inbox_sim_test");
    expect(after.length).toBe(before.length + 1);
  });

  it("captures a fixture document and attaches it to a review", async () => {
    const doc = await Effect.runPromise(
      captureDocumentEffect({ reviewId: "rev_change", source: "camera" })
    );
    expect(doc.uri).toMatch(/^fixture:\/\/document\//);
    expect(doc.source).toBe("camera");
    expect(doc.mimeType).toBe("image/jpeg");
    await Effect.runPromise(
      addAttachmentEffect({ session: FIXTURE_SESSION, attachment: doc })
    );
    const listed = await Effect.runPromise(
      listAttachmentsEffect(FIXTURE_SESSION, "rev_change")
    );
    expect(listed.some((a) => a.id === doc.id)).toBe(true);
  });

  it("refreshes a fixture session and gates expiry", async () => {
    const expired = {
      ...FIXTURE_SESSION,
      expiresAtMs: Date.now() - 1_000,
    };
    expect(await Effect.runPromise(isSessionExpiredEffect(expired))).toBe(true);
    const refreshed = await Effect.runPromise(refreshSessionEffect(expired));
    expect(refreshed.expiresAtMs).toBeGreaterThan(Date.now());
    expect(refreshed.accessToken).toMatch(/^fixture-access-token-/);
    const stored = await Effect.runPromise(loadSessionEffect());
    expect(stored?.accessToken).toBe(refreshed.accessToken);

    const fresh = await Effect.runPromise(ensureFreshSessionEffect(refreshed, 0));
    expect(fresh?.accessToken).toBe(refreshed.accessToken);

    const nearExpiry = {
      ...refreshed,
      expiresAtMs: Date.now() + 10_000,
    };
    const early = await Effect.runPromise(ensureFreshSessionEffect(nearExpiry, 60_000));
    expect(early?.expiresAtMs).toBeGreaterThan(nearExpiry.expiresAtMs);
  });

  it("writes offline snapshot and serves cache source", async () => {
    await Effect.runPromise(clearOfflineSnapshotEffect()).catch(() => undefined);
    await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    const snap = await Effect.runPromise(loadOfflineSnapshotEffect());
    expect(snap?.reviewItems.length).toBeGreaterThan(0);
    const cached = await Effect.runPromise(listReviewFromCacheEffect());
    expect(cached?.source).toBe("cache");
    expect(cached?.items.length).toBe(snap?.reviewItems.length);
  });

  it("persists notification prefs to disk", async () => {
    await Effect.runPromise(
      setNotificationPrefsEffect({
        session: FIXTURE_SESSION,
        prefs: { push: false, slack: true, email: true, morningDigest: false },
      })
    );
    const prefs = await Effect.runPromise(getNotificationPrefsEffect(FIXTURE_SESSION));
    expect(prefs.push).toBe(false);
    expect(prefs.email).toBe(true);
  });

  it("marks all inbox items read", async () => {
    const n = await Effect.runPromise(markAllInboxReadEffect(FIXTURE_SESSION));
    expect(n).toBeGreaterThan(0);
    const inbox = await Effect.runPromise(listInboxEffect(FIXTURE_SESSION));
    expect(inbox.every((i) => !i.unread)).toBe(true);
  });

  it("persists device prefs and fixture-unlocks app lock", async () => {
    const saved = await Effect.runPromise(
      saveDevicePrefsEffect({ appLock: true, haptics: false, iconBadge: true })
    );
    expect(saved.appLock).toBe(true);
    const loaded = await Effect.runPromise(loadDevicePrefsEffect());
    expect(loaded.haptics).toBe(false);
    expect(loaded.iconBadge).toBe(true);
    const unlocked = await Effect.runPromise(unlockAppEffect());
    expect(unlocked).toBe(true);
  });

  it("marks inbox items read by id and by review", async () => {
    await Effect.runPromise(markInboxReadEffect(FIXTURE_SESSION, "inbox_1"));
    let inbox = await Effect.runPromise(listInboxEffect(FIXTURE_SESSION));
    expect(inbox.find((i) => i.id === "inbox_1")?.unread).toBe(false);

    await Effect.runPromise(
      prependInboxItemEffect({
        id: "inbox_sim_read",
        title: "Sim",
        body: "body",
        atMs: Date.now(),
        kind: "approval",
        reviewId: "rev_skill",
        unread: true,
      })
    );
    const marked = await Effect.runPromise(
      markInboxReadByReviewEffect(FIXTURE_SESSION, "rev_skill")
    );
    expect(marked).toBeGreaterThan(0);
    inbox = await Effect.runPromise(listInboxEffect(FIXTURE_SESSION));
    expect(inbox.find((i) => i.id === "inbox_sim_read")?.unread).toBe(false);
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
