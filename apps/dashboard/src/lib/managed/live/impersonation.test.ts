import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { MOCK_MANAGED_SESSION } from "@/lib/managed/session";
import {
  canImpersonate,
  getActiveImpersonationEffect,
  listSupportAuditRuntimeEffect,
  resetImpersonationForTestsEffect,
  startImpersonationEffect,
  stopImpersonationEffect,
} from "./impersonation";

describe("support impersonation", () => {
  afterEach(async () => {
    await Effect.runPromise(resetImpersonationForTestsEffect());
  });

  it("allows owner/admin roles only", () => {
    expect(canImpersonate("Org admin")).toBe(true);
    expect(canImpersonate("Admin")).toBe(true);
    expect(canImpersonate("Owner")).toBe(true);
    expect(canImpersonate("Member")).toBe(false);
    expect(canImpersonate("Auditor")).toBe(false);
    expect(canImpersonate("Billing admin")).toBe(false);
  });

  it("starts and stops with audit entries", async () => {
    const started = await Effect.runPromise(
      startImpersonationEffect({
        actor: MOCK_MANAGED_SESSION,
        targetUserId: "priya",
        targetEmail: "priya@acme.example",
        targetDisplayName: "Priya Shah",
        reason: "Support ticket ST-1001 — cannot see review queue",
      })
    );
    expect(started.targetEmail).toBe("priya@acme.example");

    const active = await Effect.runPromise(
      getActiveImpersonationEffect(MOCK_MANAGED_SESSION.userId)
    );
    expect(active?.id).toBe(started.id);

    const audit = await Effect.runPromise(listSupportAuditRuntimeEffect());
    expect(audit[0]?.action).toContain("support.impersonation.start");

    const ended = await Effect.runPromise(
      stopImpersonationEffect({
        actorUserId: MOCK_MANAGED_SESSION.userId,
        actorEmail: MOCK_MANAGED_SESSION.email,
      })
    );
    expect(ended?.endedAt).toBeTruthy();
    const after = await Effect.runPromise(
      getActiveImpersonationEffect(MOCK_MANAGED_SESSION.userId)
    );
    expect(after).toBeNull();
  });

  it("rejects short reasons and self-impersonation", async () => {
    const short = await Effect.runPromise(
      startImpersonationEffect({
        actor: MOCK_MANAGED_SESSION,
        targetUserId: "priya",
        targetEmail: "priya@acme.example",
        targetDisplayName: "Priya",
        reason: "short",
      }).pipe(Effect.flip)
    );
    expect(short._tag).toBe("BadRequest");

    const self = await Effect.runPromise(
      startImpersonationEffect({
        actor: MOCK_MANAGED_SESSION,
        targetUserId: MOCK_MANAGED_SESSION.userId,
        targetEmail: MOCK_MANAGED_SESSION.email,
        targetDisplayName: MOCK_MANAGED_SESSION.displayName,
        reason: "Long enough reason text here",
      }).pipe(Effect.flip)
    );
    expect(self._tag).toBe("BadRequest");
  });
});
