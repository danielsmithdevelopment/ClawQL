/**
 * Provider / model token pricing for VK budgets and fan-out spend-ledger costs.
 *
 * Rates are public rate-card ballparks (USD per 1M tokens), not billed invoices.
 * Unknown models fall back to the historic flat $1/$3 per 1M rates.
 */

import { Context, Effect, Layer } from "effect";
import type { InferenceUsage } from "../gateway.js";

/** Historic flat rates (USD per token) used before provider pricing. */
export const DEFAULT_INPUT_USD_PER_TOKEN = 0.000_001;
export const DEFAULT_OUTPUT_USD_PER_TOKEN = 0.000_003;

export type PricingSource = "model" | "provider" | "local" | "default";

export type TokenRates = {
  readonly inputUsdPerToken: number;
  readonly outputUsdPerToken: number;
  readonly source: PricingSource;
};

export type TokenRatesPerMillion = {
  readonly inputUsdPer1M: number;
  readonly outputUsdPer1M: number;
};

const ZERO: TokenRatesPerMillion = { inputUsdPer1M: 0, outputUsdPer1M: 0 };

/** Built-in model rates (USD / 1M tokens). Keys are lowercase. */
const MODEL_RATES_PER_1M: Readonly<Record<string, TokenRatesPerMillion>> = {
  // Local / in-process — no metered token bill
  clawql: ZERO,
  "clawql-auto": ZERO,
  gliner2: ZERO,
  // OpenAI
  "gpt-4o-mini": { inputUsdPer1M: 0.15, outputUsdPer1M: 0.6 },
  "openai/gpt-4o-mini": { inputUsdPer1M: 0.15, outputUsdPer1M: 0.6 },
  "gpt-4o": { inputUsdPer1M: 2.5, outputUsdPer1M: 10 },
  "openai/gpt-4o": { inputUsdPer1M: 2.5, outputUsdPer1M: 10 },
  // Decisions Luna — estimate at gpt-4o tier until a public card lands
  "gpt-6-luna": { inputUsdPer1M: 2.5, outputUsdPer1M: 10 },
  "openai/gpt-6-luna": { inputUsdPer1M: 2.5, outputUsdPer1M: 10 },
  // Anthropic
  "claude-sonnet-4": { inputUsdPer1M: 3, outputUsdPer1M: 15 },
  "anthropic/claude-sonnet-4": { inputUsdPer1M: 3, outputUsdPer1M: 15 },
  "claude-sonnet-4.6": { inputUsdPer1M: 3, outputUsdPer1M: 15 },
  "anthropic/claude-sonnet-4.6": { inputUsdPer1M: 3, outputUsdPer1M: 15 },
  "openrouter/anthropic/claude-sonnet-4.6": { inputUsdPer1M: 3, outputUsdPer1M: 15 },
  // DeepSeek
  "deepseek-chat": { inputUsdPer1M: 0.27, outputUsdPer1M: 1.1 },
  "deepseek/deepseek-chat": { inputUsdPer1M: 0.27, outputUsdPer1M: 1.1 },
  "openrouter/deepseek/deepseek-chat": { inputUsdPer1M: 0.27, outputUsdPer1M: 1.1 },
  "deepseek-reasoner": { inputUsdPer1M: 0.55, outputUsdPer1M: 2.19 },
  "deepseek/deepseek-reasoner": { inputUsdPer1M: 0.55, outputUsdPer1M: 2.19 },
  // Groq
  "llama-3.3-70b-versatile": { inputUsdPer1M: 0.59, outputUsdPer1M: 0.79 },
  "groq/llama-3.3-70b-versatile": { inputUsdPer1M: 0.59, outputUsdPer1M: 0.79 },
  "llama-3.1-8b-instant": { inputUsdPer1M: 0.05, outputUsdPer1M: 0.08 },
  "groq/llama-3.1-8b-instant": { inputUsdPer1M: 0.05, outputUsdPer1M: 0.08 },
  // Mistral
  "mistral-small-latest": { inputUsdPer1M: 0.2, outputUsdPer1M: 0.6 },
  "mistral/mistral-small-latest": { inputUsdPer1M: 0.2, outputUsdPer1M: 0.6 },
  "mistral-large-latest": { inputUsdPer1M: 2, outputUsdPer1M: 6 },
  "mistral/mistral-large-latest": { inputUsdPer1M: 2, outputUsdPer1M: 6 },
  // xAI
  "grok-2-latest": { inputUsdPer1M: 2, outputUsdPer1M: 10 },
  "xai/grok-2-latest": { inputUsdPer1M: 2, outputUsdPer1M: 10 },
  // OpenRouter Decision-1 (estimate — aggregator markup not modeled)
  "microsoft-decision-1": { inputUsdPer1M: 1, outputUsdPer1M: 3 },
  "microsoft/microsoft-decision-1": { inputUsdPer1M: 1, outputUsdPer1M: 3 },
  "openrouter/microsoft/microsoft-decision-1": { inputUsdPer1M: 1, outputUsdPer1M: 3 },
};

/** Provider-level fallbacks when the leaf model is unknown (USD / 1M). */
const PROVIDER_RATES_PER_1M: Readonly<Record<string, TokenRatesPerMillion>> = {
  openai: { inputUsdPer1M: 1, outputUsdPer1M: 3 },
  anthropic: { inputUsdPer1M: 3, outputUsdPer1M: 15 },
  deepseek: { inputUsdPer1M: 0.27, outputUsdPer1M: 1.1 },
  groq: { inputUsdPer1M: 0.59, outputUsdPer1M: 0.79 },
  mistral: { inputUsdPer1M: 0.2, outputUsdPer1M: 0.6 },
  xai: { inputUsdPer1M: 2, outputUsdPer1M: 10 },
  openrouter: { inputUsdPer1M: 1, outputUsdPer1M: 3 },
  fireworks: { inputUsdPer1M: 0.9, outputUsdPer1M: 0.9 },
  together: { inputUsdPer1M: 0.88, outputUsdPer1M: 0.88 },
  mlx: ZERO,
  ollama: ZERO,
  local: ZERO,
  clawql: ZERO,
};

function perMillionToTokenRates(
  rates: TokenRatesPerMillion,
  source: PricingSource
): TokenRates {
  return {
    inputUsdPerToken: rates.inputUsdPer1M / 1_000_000,
    outputUsdPerToken: rates.outputUsdPer1M / 1_000_000,
    source,
  };
}

function isLocalKey(key: string): boolean {
  return (
    key === "clawql" ||
    key === "clawql-auto" ||
    key === "gliner2" ||
    key.startsWith("mlx/") ||
    key.startsWith("ollama/") ||
    key.startsWith("local/")
  );
}

function providerFromKey(key: string): string | undefined {
  const slash = key.indexOf("/");
  if (slash <= 0) return undefined;
  return key.slice(0, slash);
}

/** Resolve token rates for a model or provider rollup key. */
export function resolveTokenRates(modelOrProviderKey?: string): Effect.Effect<TokenRates> {
  return Effect.sync(() => {
    if (!modelOrProviderKey || !modelOrProviderKey.trim()) {
      return perMillionToTokenRates(
        { inputUsdPer1M: 1, outputUsdPer1M: 3 },
        "default"
      );
    }
    const key = modelOrProviderKey.trim().toLowerCase();
    if (isLocalKey(key)) {
      return perMillionToTokenRates(ZERO, "local");
    }
    const modelHit = MODEL_RATES_PER_1M[key];
    if (modelHit) return perMillionToTokenRates(modelHit, "model");

    const leafSlash = key.lastIndexOf("/");
    if (leafSlash >= 0 && leafSlash < key.length - 1) {
      const leaf = key.slice(leafSlash + 1);
      const leafHit = MODEL_RATES_PER_1M[leaf];
      if (leafHit) return perMillionToTokenRates(leafHit, "model");
    }

    const provider = providerFromKey(key) ?? key;
    const providerHit = PROVIDER_RATES_PER_1M[provider];
    if (providerHit) return perMillionToTokenRates(providerHit, "provider");

    return perMillionToTokenRates(
      { inputUsdPer1M: 1, outputUsdPer1M: 3 },
      "default"
    );
  });
}

export function usdFromTokenCountsWithRates(
  inputTokens: number,
  outputTokens: number,
  rates: TokenRates
): Effect.Effect<number> {
  return Effect.sync(
    () => inputTokens * rates.inputUsdPerToken + outputTokens * rates.outputUsdPerToken
  );
}

/** Estimate USD for usage under a model/provider key (Effect primary API). */
export function estimateCostUsdEffect(
  usage: InferenceUsage | undefined,
  modelOrProviderKey?: string
): Effect.Effect<number> {
  return Effect.gen(function* () {
    if (!usage) return 0;
    const rates = yield* resolveTokenRates(modelOrProviderKey);
    return yield* usdFromTokenCountsWithRates(usage.inputTokens, usage.outputTokens, rates);
  });
}

export class TokenPricingService extends Context.Service<
  TokenPricingService,
  {
    readonly resolveRates: (modelOrProviderKey?: string) => Effect.Effect<TokenRates>;
    readonly estimateCostUsd: (
      usage: InferenceUsage | undefined,
      modelOrProviderKey?: string
    ) => Effect.Effect<number>;
  }
>()("clawql/inference/TokenPricingService") {}

export const TokenPricingLive: Layer.Layer<TokenPricingService> = Layer.succeed(
  TokenPricingService,
  {
    resolveRates: resolveTokenRates,
    estimateCostUsd: estimateCostUsdEffect,
  }
);
