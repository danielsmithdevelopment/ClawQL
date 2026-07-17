import { describe, expect, it } from "vitest";
import { Ap2Error, decodeJwtPayload, signHs256Jwt, verifyHs256Jwt } from "./jwt.js";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

describe("AP2 HS256 JWT adversarial", () => {
  const secret = "test-secret-for-ap2-jwt";

  it("round-trips sign + verify for HS256", () => {
    const token = signHs256Jwt({ vct: "payment", n: 1 }, secret);
    const { payload } = verifyHs256Jwt(token, secret);
    expect(payload.vct).toBe("payment");
    expect(payload.n).toBe(1);
  });

  it("rejects alg:none and non-HS256", () => {
    const none = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: "x" })}.`;
    expect(() => decodeJwtPayload(none)).toThrow(Ap2Error);
    expect(() => verifyHs256Jwt(none, secret)).toThrow(/alg/i);

    const rs = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ sub: "x" })}.sig`;
    expect(() => verifyHs256Jwt(rs, secret)).toThrow(/Unsupported JWT alg/i);
  });

  it("rejects empty alg, truncated segments, and forged signatures", () => {
    const emptyAlg = `${b64url({ alg: "", typ: "JWT" })}.${b64url({ sub: "x" })}.aa`;
    expect(() => decodeJwtPayload(emptyAlg)).toThrow(/alg/i);

    expect(() => verifyHs256Jwt("onlyone", secret)).toThrow(/three segments/i);

    const good = signHs256Jwt({ sub: "ok" }, secret);
    const forged = `${good.split(".").slice(0, 2).join(".")}.${b64url("nope")}`;
    expect(() => verifyHs256Jwt(forged, secret)).toThrow(/signature mismatch/i);
  });
});
