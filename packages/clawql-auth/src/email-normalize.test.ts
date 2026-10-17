import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { normalizeEmailIdentity, normalizeEmailIdentityEffect } from "./email-normalize.js";

describe("normalizeEmailIdentity", () => {
  it("lowercases without stripping plus by default", () => {
    expect(normalizeEmailIdentity("Alice+News@Acme.COM", { env: {} })).toBe("alice+news@acme.com");
  });

  it("strips plus tag when CLAWQL_EMAIL_PLUS_NORMALIZE=1", () => {
    expect(
      normalizeEmailIdentity("Alice+News@Acme.COM", {
        env: { CLAWQL_EMAIL_PLUS_NORMALIZE: "1" },
      })
    ).toBe("alice@acme.com");
  });

  it("stripPlus option overrides env", () => {
    expect(normalizeEmailIdentity("a+b@x.com", { stripPlus: true, env: {} })).toBe("a@x.com");
    expect(
      normalizeEmailIdentity("a+b@x.com", {
        stripPlus: false,
        env: { CLAWQL_EMAIL_PLUS_NORMALIZE: "1" },
      })
    ).toBe("a+b@x.com");
  });

  it("Effect path fails on invalid", async () => {
    const err = await Effect.runPromise(
      normalizeEmailIdentityEffect("not-an-email", { env: {} }).pipe(Effect.flip)
    );
    expect(err.message).toMatch(/Invalid email/);
  });
});
