import { describe, expect, it } from "vitest";
import {
  clawqlEnvContainsPlaintextOperatorKey,
  generateOperatorApproveKey,
  hashOperatorApproveKey,
  verifyOperatorApproveKey,
} from "./operator-key.js";

describe("operator-key (audit Z2)", () => {
  it("generates a 32-byte random key whose hash verifies", () => {
    const a = generateOperatorApproveKey();
    const b = generateOperatorApproveKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(hashOperatorApproveKey(a.key));
    expect(Buffer.from(a.key, "base64url").length).toBe(32);
    expect(verifyOperatorApproveKey(a.key, { CLAWQL_OPERATOR_APPROVE_KEY_HASH: a.hash })).toEqual({
      ok: true,
    });
  });

  it("hashes deterministically", () => {
    expect(hashOperatorApproveKey("op-secret")).toBe(hashOperatorApproveKey("op-secret"));
    expect(hashOperatorApproveKey("op-secret")).not.toBe(hashOperatorApproveKey("other"));
  });

  it("verifies against CLAWQL_OPERATOR_APPROVE_KEY_HASH", () => {
    const hash = hashOperatorApproveKey("op-secret");
    expect(
      verifyOperatorApproveKey("op-secret", { CLAWQL_OPERATOR_APPROVE_KEY_HASH: hash })
    ).toEqual({ ok: true });
    expect(verifyOperatorApproveKey("wrong", { CLAWQL_OPERATOR_APPROVE_KEY_HASH: hash }).ok).toBe(
      false
    );
  });

  it("refuses plaintext env without allow flag", () => {
    const r = verifyOperatorApproveKey("op-secret", {
      CLAWQL_OPERATOR_APPROVE_KEY: "op-secret",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/KEY_HASH|plaintext/i);
  });

  it("allows plaintext when CLAWQL_ALLOW_OPERATOR_APPROVE_KEY_PLAINTEXT=1", () => {
    expect(
      verifyOperatorApproveKey("op-secret", {
        CLAWQL_OPERATOR_APPROVE_KEY: "op-secret",
        CLAWQL_ALLOW_OPERATOR_APPROVE_KEY_PLAINTEXT: "1",
      })
    ).toEqual({ ok: true });
  });

  it("detects plaintext key lines in clawql.env", () => {
    expect(
      clawqlEnvContainsPlaintextOperatorKey("# comment\nCLAWQL_OPERATOR_APPROVE_KEY=secret\n")
    ).toBe(true);
    expect(clawqlEnvContainsPlaintextOperatorKey("CLAWQL_OPERATOR_APPROVE_KEY_HASH=abc\n")).toBe(
      false
    );
  });
});
