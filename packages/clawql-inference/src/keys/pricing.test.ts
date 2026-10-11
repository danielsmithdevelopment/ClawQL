/**
 * Provider / model token pricing.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "./budget.js";
import {
  DEFAULT_INPUT_USD_PER_TOKEN,
  DEFAULT_OUTPUT_USD_PER_TOKEN,
  estimateCostUsdEffect,
  resolveTokenRates,
} from "./pricing.js";

describe("token pricing", () => {
  it("falls back to historic $1/$3 per 1M when model unknown", async () => {
    const rates = await Effect.runPromise(resolveTokenRates("unknown-vendor/unknown-model"));
    expect(rates.source).toBe("default");
    expect(rates.inputUsdPerToken).toBeCloseTo(DEFAULT_INPUT_USD_PER_TOKEN, 12);
    expect(rates.outputUsdPerToken).toBeCloseTo(DEFAULT_OUTPUT_USD_PER_TOKEN, 12);
  });

  it("prices gpt-4o-mini below the historic flat rate", async () => {
    const rates = await Effect.runPromise(resolveTokenRates("openai/gpt-4o-mini"));
    expect(rates.source).toBe("model");
    const cost = await Effect.runPromise(
      estimateCostUsdEffect({ inputTokens: 1_000_000, outputTokens: 0 }, "openai/gpt-4o-mini")
    );
    expect(cost).toBeCloseTo(0.15, 6);
    // Historic flat would be $1 for 1M input tokens.
    expect(cost).toBeLessThan(1);
  });

  it("resolves leaf model ids and local zero rates", async () => {
    const luna = await Effect.runPromise(resolveTokenRates("gpt-6-luna"));
    expect(luna.source).toBe("model");
    expect(luna.inputUsdPerToken).toBeGreaterThan(DEFAULT_INPUT_USD_PER_TOKEN);

    const local = await Effect.runPromise(resolveTokenRates("clawql"));
    expect(local.source).toBe("local");
    expect(local.inputUsdPerToken).toBe(0);
    expect(local.outputUsdPerToken).toBe(0);

    const mlx = await Effect.runPromise(resolveTokenRates("mlx/ornith-1.5-35b-a3b"));
    expect(mlx.source).toBe("local");
    expect(mlx.inputUsdPerToken).toBe(0);
  });

  it("uses provider fallback for unknown leaf under known provider", async () => {
    const rates = await Effect.runPromise(resolveTokenRates("deepseek/brand-new-model"));
    expect(rates.source).toBe("provider");
    expect(rates.inputUsdPerToken).toBeCloseTo(0.27 / 1_000_000, 12);
  });

  it("budget façade passes model key through", () => {
    const cheap = estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 0 }, "openai/gpt-4o-mini");
    const flat = estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 0 });
    expect(cheap).toBeCloseTo(0.15, 6);
    expect(flat).toBeCloseTo(1, 6);
  });
});
