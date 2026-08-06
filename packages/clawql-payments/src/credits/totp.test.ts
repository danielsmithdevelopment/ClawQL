import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { generateTotp, generateTotpSecret, verifyTotp } from "./totp.js";

const run = <A, E>(e: Effect.Effect<A, E>): A => Effect.runSync(e);

describe("totp", () => {
  it("round-trips generate/verify within the window", () => {
    const secret = run(generateTotpSecret());
    const code = run(generateTotp(secret));
    expect(run(verifyTotp(secret, code))).toBe(true);
    expect(run(verifyTotp(secret, "000000"))).toBe(false);
  });
});
