import { afterEach, describe, expect, it } from "vitest";

import {
  assertApiHostAllowed,
  isE2eApprovalProof,
  isWebAuthnApprovalProof,
  maskSecretValue,
  sessionCanApprove,
  sessionHasOrg,
  sessionIsAdmin,
  sessionMatchesDeployOrg,
} from "./api-auth";
import { MOCK_MANAGED_SESSION } from "./managed/session";

describe("api-auth", () => {
  const prevHost = process.env.CLAWQL_DASHBOARD_ALLOWED_HOSTS;
  const prevE2e = process.env.CLAWQL_E2E_HARNESS;

  afterEach(() => {
    if (prevHost === undefined) delete process.env.CLAWQL_DASHBOARD_ALLOWED_HOSTS;
    else process.env.CLAWQL_DASHBOARD_ALLOWED_HOSTS = prevHost;
    if (prevE2e === undefined) delete process.env.CLAWQL_E2E_HARNESS;
    else process.env.CLAWQL_E2E_HARNESS = prevE2e;
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

  it("accepts only structured WebAuthn proofs (AA2)", () => {
    expect(
      isWebAuthnApprovalProof({
        method: "webauthn",
        response: { id: "cred", response: {} },
      }),
    ).toBe(true);
    expect(
      isWebAuthnApprovalProof({
        method: "nfc_security_key",
        attestation: "fixture-nfc:deadbeef",
      }),
    ).toBe(false);
    expect(
      isWebAuthnApprovalProof({
        method: "webauthn",
        signature: "deadbeef",
        credentialId: "cred",
      }),
    ).toBe(false);
    expect(isWebAuthnApprovalProof("session_hmac_blob")).toBe(false);
  });

  it("rejects e2e proofs outside the harness", () => {
    delete process.env.CLAWQL_E2E_HARNESS;
    expect(isE2eApprovalProof("e2e-passkey")).toBe(false);
    process.env.CLAWQL_E2E_HARNESS = "1";
    expect(isE2eApprovalProof("e2e-passkey")).toBe(true);
  });

  it("recognizes approver roles", () => {
    expect(sessionCanApprove(MOCK_MANAGED_SESSION)).toBe(true);
    expect(sessionCanApprove({ ...MOCK_MANAGED_SESSION, role: "Member" })).toBe(false);
  });

  it("requires org membership and admin for privileged surfaces (BB1)", () => {
    expect(sessionHasOrg(MOCK_MANAGED_SESSION)).toBe(true);
    expect(sessionHasOrg({ ...MOCK_MANAGED_SESSION, orgId: "" })).toBe(false);
    expect(sessionIsAdmin(MOCK_MANAGED_SESSION)).toBe(true);
    expect(sessionIsAdmin({ ...MOCK_MANAGED_SESSION, role: "Member" })).toBe(false);
    expect(sessionCanApprove({ ...MOCK_MANAGED_SESSION, orgId: "" })).toBe(false);
  });

  it("requires session org to match CLAWQL_MANAGED_ORG_ID when set (CC1)", () => {
    expect(
      sessionMatchesDeployOrg(MOCK_MANAGED_SESSION, { CLAWQL_MANAGED_ORG_ID: "" }),
    ).toBe(true);
    expect(
      sessionMatchesDeployOrg(MOCK_MANAGED_SESSION, {
        CLAWQL_MANAGED_ORG_ID: MOCK_MANAGED_SESSION.orgId,
      }),
    ).toBe(true);
    expect(
      sessionMatchesDeployOrg(MOCK_MANAGED_SESSION, {
        CLAWQL_MANAGED_ORG_ID: "org_other",
      }),
    ).toBe(false);
  });
});

describe("accessTokenAuthTimeSec (CC2)", () => {
  it("prefers auth_time then amr timestamp and never iat", async () => {
    const { accessTokenAuthTimeSec } = await import("./managed/approve-webauthn");
    const enc = (obj: object) =>
      `hdr.${Buffer.from(JSON.stringify(obj)).toString("base64url")}.sig`;
    expect(accessTokenAuthTimeSec(enc({ auth_time: 100, iat: 999, amr: [] }))).toBe(100);
    expect(
      accessTokenAuthTimeSec(
        enc({
          iat: 999,
          amr: [
            { method: "password", timestamp: 200 },
            { method: "otp", timestamp: 250 },
          ],
        }),
      ),
    ).toBe(250);
    expect(accessTokenAuthTimeSec(enc({ iat: 999 }))).toBeUndefined();
  });
});
