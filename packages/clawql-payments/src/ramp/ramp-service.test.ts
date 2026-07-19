import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { RampService } from "./ramp-service.js";

describe("RampService", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-ramp-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_RAMP_ENABLED = "1";
    process.env.CLAWQL_RAMP_DRY_RUN = "1";
    delete process.env.RAMP_CLIENT_ID;
    delete process.env.RAMP_CLIENT_SECRET;
    resetPaymentsEffectRuntimeForTests();
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_RAMP_ENABLED;
    delete process.env.CLAWQL_RAMP_DRY_RUN;
    delete process.env.RAMP_CLIENT_ID;
    delete process.env.RAMP_CLIENT_SECRET;
    vi.unstubAllGlobals();
    await rm(home, { recursive: true, force: true });
  });

  it("creates fund and agent card in dry-run without secrets in audit path", async () => {
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const ramp = yield* RampService;
        const fund = yield* ramp.createFund({
          displayName: "Swarm budget",
          limitUsd: 500,
        });
        const card = yield* ramp.issueAgentCard({
          userId: "user_123",
          amountUsd: 25,
          agentId: "agent-research",
        });
        return { fund, card };
      })
    );

    expect(result.fund.id).toMatch(/^fund_dry_/);
    expect(result.card.agentScoped).toBe(true);
    expect(result.card.dryRun).toBe(true);
    expect(result.card.pan).toBeUndefined();
    expect(result.card.lastFour).toBe("4242");
  });

  it("issues vault virtual cards against mocked Ramp APIs", async () => {
    process.env.CLAWQL_RAMP_DRY_RUN = "0";
    process.env.RAMP_CLIENT_ID = "cid";
    process.env.RAMP_CLIENT_SECRET = "csecret";
    process.env.RAMP_ENVIRONMENT = "demo";
    resetPaymentsEffectRuntimeForTests();

    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/developer/v1/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
        });
      }
      if (href.includes("/cards/vault")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            id: "card_live_1",
            pan: "4111111111111111",
            cvv: "123",
            expiration: "2030-12",
            spend_limit_id: "fund_1",
          }),
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const card = await runPaymentsEffect(
      Effect.gen(function* () {
        const ramp = yield* RampService;
        return yield* ramp.createVirtualCard({
          userId: "user_abc",
          limitUsd: 75,
          displayName: "Vendor autopay",
        });
      })
    );

    expect(card.id).toBe("card_live_1");
    expect(card.lastFour).toBe("1111");
    expect(card.pan).toBe("4111111111111111");
    expect(card.fundId).toBe("fund_1");
    expect(card.dryRun).toBe(false);
  });
});
