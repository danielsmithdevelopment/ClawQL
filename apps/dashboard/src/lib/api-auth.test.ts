import { afterEach, describe, expect, it } from "vitest";

import {
  assertApiHostAllowed,
  isE2eApprovalProof,
  isWebAuthnApprovalProof,
  maskSecretValue,
  sessionCanApprove,
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
});
