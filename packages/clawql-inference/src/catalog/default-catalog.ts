/**
 * Curated BYOK model catalog for clawql-inference.
 *
 * Operators bring provider API keys; ClawQL routes `provider/model` directly.
 * OpenRouter stays available as an optional aggregator escape hatch
 * (`openrouter/<vendor>/<model>`), not as a required dependency.
 */

export type CatalogModel = {
  /** Gateway model id: `provider/upstream_model` (or openrouter/vendor/model). */
  id: string;
  provider: string;
  /** Model string sent upstream (may equal the id suffix). */
  upstream_model: string;
  display_name: string;
  tier_hint?: "frugal" | "standard" | "frontier";
  context_tokens?: number;
  /** Short capability tags for docs / future routing. */
  tags?: string[];
};

export type InferenceModelCatalog = {
  version: 1;
  models: CatalogModel[];
  /** Stable aliases → catalog / gateway ids. */
  aliases: Record<string, string>;
};

export const DEFAULT_INFERENCE_MODEL_CATALOG: InferenceModelCatalog = {
  version: 1,
  aliases: {
    "clawql/cheap-chat": "deepseek/deepseek-chat",
    "clawql/fast-chat": "groq/llama-3.3-70b-versatile",
    "clawql/code": "deepseek/deepseek-chat",
  },
  models: [
    // DeepSeek (direct)
    {
      id: "deepseek/deepseek-chat",
      provider: "deepseek",
      upstream_model: "deepseek-chat",
      display_name: "DeepSeek Chat",
      tier_hint: "frugal",
      context_tokens: 65536,
      tags: ["chat", "byok"],
    },
    {
      id: "deepseek/deepseek-reasoner",
      provider: "deepseek",
      upstream_model: "deepseek-reasoner",
      display_name: "DeepSeek Reasoner",
      tier_hint: "standard",
      context_tokens: 65536,
      tags: ["reasoning", "byok"],
    },
    // Groq
    {
      id: "groq/llama-3.3-70b-versatile",
      provider: "groq",
      upstream_model: "llama-3.3-70b-versatile",
      display_name: "Llama 3.3 70B (Groq)",
      tier_hint: "standard",
      context_tokens: 131072,
      tags: ["chat", "fast", "byok"],
    },
    {
      id: "groq/llama-3.1-8b-instant",
      provider: "groq",
      upstream_model: "llama-3.1-8b-instant",
      display_name: "Llama 3.1 8B Instant (Groq)",
      tier_hint: "frugal",
      context_tokens: 131072,
      tags: ["chat", "fast", "byok"],
    },
    // Fireworks
    {
      id: "fireworks/accounts/fireworks/models/llama-v3p3-70b-instruct",
      provider: "fireworks",
      upstream_model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
      display_name: "Llama 3.3 70B (Fireworks)",
      tier_hint: "standard",
      tags: ["chat", "byok"],
    },
    // Together
    {
      id: "together/meta-llama/Llama-3.3-70B-Instruct-Turbo",
      provider: "together",
      upstream_model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      display_name: "Llama 3.3 70B Turbo (Together)",
      tier_hint: "standard",
      tags: ["chat", "byok"],
    },
    // Mistral
    {
      id: "mistral/mistral-small-latest",
      provider: "mistral",
      upstream_model: "mistral-small-latest",
      display_name: "Mistral Small",
      tier_hint: "frugal",
      tags: ["chat", "byok"],
    },
    {
      id: "mistral/mistral-large-latest",
      provider: "mistral",
      upstream_model: "mistral-large-latest",
      display_name: "Mistral Large",
      tier_hint: "frontier",
      tags: ["chat", "byok"],
    },
    // xAI
    {
      id: "xai/grok-2-latest",
      provider: "xai",
      upstream_model: "grok-2-latest",
      display_name: "Grok 2",
      tier_hint: "frontier",
      tags: ["chat", "byok"],
    },
    // OpenAI / Anthropic (still first-class BYOK)
    {
      id: "openai/gpt-4o-mini",
      provider: "openai",
      upstream_model: "gpt-4o-mini",
      display_name: "GPT-4o mini",
      tier_hint: "frugal",
      tags: ["chat", "byok"],
    },
    {
      id: "openai/gpt-4o",
      provider: "openai",
      upstream_model: "gpt-4o",
      display_name: "GPT-4o",
      tier_hint: "frontier",
      tags: ["chat", "vision", "byok"],
    },
    {
      id: "anthropic/claude-sonnet-4",
      provider: "anthropic",
      upstream_model: "claude-sonnet-4",
      display_name: "Claude Sonnet 4",
      tier_hint: "frontier",
      tags: ["chat", "byok"],
    },
    // OpenRouter bring-your-aggregator examples (cheap first for CI / OpenBench).
    // DeepSeek Chat is the OpenBench default: still frugal, more reliable tool loops
    // than flash-lite (which often stops after memory_recall or mangles edits).
    {
      id: "openrouter/deepseek/deepseek-chat",
      provider: "openrouter",
      upstream_model: "deepseek/deepseek-chat",
      display_name: "DeepSeek Chat (via OpenRouter)",
      tier_hint: "frugal",
      tags: ["chat", "openrouter", "openbench-default"],
    },
    {
      id: "openrouter/google/gemini-2.5-flash-lite",
      provider: "openrouter",
      upstream_model: "google/gemini-2.5-flash-lite",
      display_name: "Gemini 2.5 Flash Lite (via OpenRouter)",
      tier_hint: "frugal",
      tags: ["chat", "openrouter"],
    },
    {
      id: "openrouter/qwen/qwen3.6-plus",
      provider: "openrouter",
      upstream_model: "qwen/qwen3.6-plus",
      display_name: "Qwen3.6 Plus (via OpenRouter)",
      tier_hint: "standard",
      tags: ["chat", "openrouter"],
    },
  ],
};
