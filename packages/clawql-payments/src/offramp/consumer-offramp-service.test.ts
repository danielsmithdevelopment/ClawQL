import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { ConsumerOffRampService } from "./consumer-offramp-service.js";

describe("ConsumerOffRampService", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-offramp-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_OFFRAMP_ENABLED = "1";
    process.env.CLAWQL_OFFRAMP_DRY_RUN = "1";
    resetPaymentsEffectRuntimeForTests();
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_OFFRAMP_ENABLED;
    delete process.env.CLAWQL_OFFRAMP_DRY_RUN;
    delete process.env.MOONPAY_API_KEY;
    await rm(home, { recursive: true, force: true });
  });

  it("creates dry-run Moonpay sell session URL", async () => {
    const session = await runPaymentsEffect(
      Effect.gen(function* () {
        const offramp = yield* ConsumerOffRampService;
        return yield* offramp.createSession({
          amountUsd: 40,
          walletAddress: "0x1111111111111111111111111111111111111111",
          provider: "moonpay",
          creatorId: "clipper-9",
        });
      })
    );
    expect(session.dryRun).toBe(true);
    expect(session.provider).toBe("moonpay");
    expect(session.url).toContain("moonpay");
    expect(session.amountUsd).toBe(40);
  });

  it("builds live Moonpay URL when API key set", async () => {
    process.env.CLAWQL_OFFRAMP_DRY_RUN = "0";
    process.env.MOONPAY_API_KEY = "pk_test_moon";
    resetPaymentsEffectRuntimeForTests();

    const session = await runPaymentsEffect(
      Effect.gen(function* () {
        const offramp = yield* ConsumerOffRampService;
        return yield* offramp.createSession({
          amountUsd: 15,
          walletAddress: "0x2222222222222222222222222222222222222222",
          provider: "moonpay",
        });
      })
    );
    expect(session.dryRun).toBe(false);
    expect(session.url).toContain("apiKey=pk_test_moon");
    expect(session.url).toContain("baseCurrencyCode=usdc");
  });
});
