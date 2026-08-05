import { describe, expect, it } from "vitest";
import { generateTotp, generateTotpSecret, verifyTotp } from "./totp.js";

describe("totp", () => {
  it("round-trips generate/verify within the window", () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
  });
});
