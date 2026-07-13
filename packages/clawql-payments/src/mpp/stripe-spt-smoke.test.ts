import { describe, expect, it } from "vitest";

const runLive =
  process.env.CLAWQL_STRIPE_SPT_SMOKE === "1" &&
  Boolean(process.env.STRIPE_SECRET_KEY?.trim()) &&
  Boolean(process.env.STRIPE_PROFILE_ID?.trim());

describe.runIf(runLive)("Stripe SPT live smoke", () => {
  it("documents link-cli mpp pay flow for operators", async () => {
    // Live SPT settlement requires operator credentials and link-cli spend requests.
    // This test gate ensures CI skips unless explicitly enabled in a credentialed environment.
    expect(process.env.STRIPE_PROFILE_ID).toMatch(/^profile(_test)?_/);
    expect(process.env.STRIPE_SECRET_KEY).toMatch(/^sk_(test|live)_/);
  });
});

describe("Stripe SPT smoke harness", () => {
  it("skips live verification when CLAWQL_STRIPE_SPT_SMOKE is unset", () => {
    if (runLive) return;
    expect(runLive).toBe(false);
  });
});
