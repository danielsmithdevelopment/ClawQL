import { describe, expect, it } from "vitest";

const runLive =
  process.env.CLAWQL_STRIPE_SPT_SMOKE === "1" &&
  Boolean(process.env.STRIPE_SECRET_KEY?.trim()) &&
  Boolean(process.env.STRIPE_PROFILE_ID?.trim());

/**
 * Live Stripe Shared Payment Token smoke. Skips unless CLAWQL_STRIPE_SPT_SMOKE=1
 * and Stripe credentials are present. Credential-format checks only — settle SPT
 * via link-cli / MppVerificationService in a credentialed operator environment.
 */
describe.runIf(runLive)("Stripe SPT live smoke", () => {
  it("requires Stripe profile + secret key shapes before operator settlement", () => {
    expect(process.env.STRIPE_PROFILE_ID).toMatch(/^profile(_test)?_/);
    expect(process.env.STRIPE_SECRET_KEY).toMatch(/^sk_(test|live)_/);
  });
});
