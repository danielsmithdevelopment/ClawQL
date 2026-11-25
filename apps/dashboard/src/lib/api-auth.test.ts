import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertApiHostAllowed,
  maskSecretValue,
  mintApprovalProof,
  sessionCanApprove,
  verifyApprovalProof,
} from "./api-auth";
import type { ManagedSession } from "./managed/session";
import { MOCK_MANAGED_SESSION } from "./managed/session";

describe("api-auth", () => {
  const prevHost = process.env.CLAWQL_DASHBOARD_ALLOWED_HOSTS;
  const prevSecret = process.env.CLAWQL_DASHBOARD_APPROVE_HMAC_SECRET;

  afterEach(() => {
    if (prevHost === undefined) delete process.env.CLAWQL_DASHBOARD_ALLOWED_HOSTS;
    else process.env.CLAWQL_DASHBOARD_ALLOWED_HOSTS = prevHost;
    if (prevSecret === undefined) delete process.env.CLAWQL_DASHBOARD_APPROVE_HMAC_SECRET;
    else process.env.CLAWQL_DASHBOARD_APPROVE_HMAC_SECRET = prevSecret;
  });

  it("rejects non-allowlisted Host headers", () => {
    process.env.CLAWQL_DASHBOARD_ALLOWED_HOSTS = "127.0.0.1,localhost";
    const req = new Request("http://evil.example/api/local/providers", {
      headers: { host: "evil.example" },
    });
    const denied = assertApiHostAllowed(req);
    expect(denied?.status).toBe(403);
  });

  it("allows loopback Host", () => {
    process.env.CLAWQL_DASHBOARD_ALLOWED_HOSTS = "127.0.0.1,localhost";
    const req = new Request("http://127.0.0.1:3040/api/local/providers", {
      headers: { host: "127.0.0.1:3040" },
    });
    expect(assertApiHostAllowed(req)).toBeNull();
  });

  it("masks provider secret values", () => {
    expect(maskSecretValue("sk-abcdefghijklmnop")).toMatch(/•+mnop$/);
    expect(maskSecretValue("ab")).toBe("••••");
  });

  it("verifies session HMAC approval proofs", () => {
    process.env.CLAWQL_DASHBOARD_APPROVE_HMAC_SECRET = "test-secret";
    const session: ManagedSession = {
      ...MOCK_MANAGED_SESSION,
      accessToken: "unused",
    };
    const proof = mintApprovalProof({
      session,
      id: "pex_1",
      kind: "change",
      decision: "approve",
    });
    expect(proof).toBeTruthy();
    expect(
      verifyApprovalProof({
        session,
        id: "pex_1",
        kind: "change",
        decision: "approve",
        approvalProof: proof,
      }),
    ).toBe(true);
    expect(
      verifyApprovalProof({
        session,
        id: "pex_1",
        kind: "change",
        decision: "approve",
        approvalProof: { method: "session_hmac", attestation: proof! },
      }),
    ).toBe(true);
    expect(
      verifyApprovalProof({
        session,
        id: "pex_1",
        kind: "change",
        decision: "approve",
        approvalProof: null,
      }),
    ).toBe(false);
  });

  it("accepts mobile NFC attestation objects", () => {
    expect(
      verifyApprovalProof({
        session: MOCK_MANAGED_SESSION,
        id: "pex_1",
        kind: "change",
        decision: "approve",
        approvalProof: {
          method: "nfc_security_key",
          attestation: "fixture-nfc:deadbeef",
        },
      }),
    ).toBe(true);
  });

  it("recognizes approver roles", () => {
    expect(sessionCanApprove(MOCK_MANAGED_SESSION)).toBe(true);
    expect(sessionCanApprove({ ...MOCK_MANAGED_SESSION, role: "Member" })).toBe(false);
  });

  it("HMAC payload binds id, kind, decision, and user", () => {
    process.env.CLAWQL_DASHBOARD_APPROVE_HMAC_SECRET = "test-secret";
    const expected = createHmac("sha256", "test-secret")
      .update(`pex_1:change:approve:${MOCK_MANAGED_SESSION.userId}`)
      .digest("base64url");
    expect(
      mintApprovalProof({
        session: MOCK_MANAGED_SESSION,
        id: "pex_1",
        kind: "change",
        decision: "approve",
      }),
    ).toBe(expected);
  });
});
