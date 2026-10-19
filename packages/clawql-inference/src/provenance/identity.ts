/**
 * Model identity table — map every known naming scheme to one canonical id + vendor.
 * Matching runs on the *resolved* model id (after catalog aliases), not the request alias.
 */

import { Effect } from "effect";
import { resolveCatalogAlias } from "../catalog/index.js";
import type { InferenceModelCatalog } from "../catalog/index.js";
import { DEFAULT_INFERENCE_MODEL_CATALOG } from "../catalog/default-catalog.js";

export type ModelIdentity = {
  readonly requestedId: string;
  /** After catalog alias resolution. */
  readonly resolvedId: string;
  /** Stable id for policy matching (vendor-prefixed when known). */
  readonly canonicalId: string;
  /** Weight vendor / origin label (e.g. deepseek, anthropic). Not the aggregator. */
  readonly vendor: string;
  /** False when the id is not in the identity table and has no parseable vendor. */
  readonly known: boolean;
};

export type IdentityEntry = {
  /** Lowercase match keys: exact ids, `prefix/*`, or bare upstream model names. */
  readonly match: readonly string[];
  readonly canonicalId: string;
  readonly vendor: string;
};

/** Seed table for vendors we already ship in the default catalog + common aggregators. */
export const DEFAULT_MODEL_IDENTITY_TABLE: readonly IdentityEntry[] = [
  {
    match: [
      "deepseek/deepseek-chat",
      "deepseek/deepseek-chat-v3",
      "openrouter/deepseek/deepseek-chat",
      "deepseek-chat",
    ],
    canonicalId: "deepseek/deepseek-chat",
    vendor: "deepseek",
  },
  {
    match: [
      "deepseek/deepseek-reasoner",
      "openrouter/deepseek/deepseek-reasoner",
      "deepseek-reasoner",
    ],
    canonicalId: "deepseek/deepseek-reasoner",
    vendor: "deepseek",
  },
  {
    match: ["deepseek/*", "openrouter/deepseek/*"],
    canonicalId: "deepseek/*",
    vendor: "deepseek",
  },
  {
    match: ["anthropic/*", "openrouter/anthropic/*", "claude*"],
    canonicalId: "anthropic/*",
    vendor: "anthropic",
  },
  {
    match: ["openai/*", "openrouter/openai/*", "gpt-*", "o1*", "o3*", "text-embedding-*"],
    canonicalId: "openai/*",
    vendor: "openai",
  },
  {
    match: ["groq/llama-*", "llama-3*", "meta-llama/*", "openrouter/meta-llama/*"],
    canonicalId: "meta/llama",
    vendor: "meta",
  },
  {
    match: ["groq/*", "openrouter/groq/*"],
    canonicalId: "groq/*",
    vendor: "groq",
  },
  {
    match: ["google/*", "openrouter/google/*", "gemini*"],
    canonicalId: "google/*",
    vendor: "google",
  },
  {
    match: ["qwen/*", "openrouter/qwen/*", "qwen*"],
    canonicalId: "qwen/*",
    vendor: "qwen",
  },
  {
    match: ["mistral/*", "openrouter/mistral/*"],
    canonicalId: "mistral/*",
    vendor: "mistral",
  },
  {
    match: ["xai/*", "openrouter/xai/*", "grok*"],
    canonicalId: "xai/*",
    vendor: "xai",
  },
  {
    match: ["ollama/*"],
    canonicalId: "ollama/*",
    vendor: "ollama",
  },
  {
    match: ["mlx/*", "ornith*"],
    canonicalId: "mlx/*",
    vendor: "mlx",
  },
  {
    match: ["fireworks/*"],
    canonicalId: "fireworks/*",
    vendor: "fireworks",
  },
  {
    match: ["together/*"],
    canonicalId: "together/*",
    vendor: "together",
  },
  {
    match: ["microsoft/*", "openrouter/microsoft/*", "microsoft-decision-1"],
    canonicalId: "microsoft/*",
    vendor: "microsoft",
  },
];

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function globMatch(pattern: string, value: string): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1); // keep trailing /
    return value.startsWith(prefix) || value === pattern.slice(0, -2);
  }
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return value === pattern;
}

/**
 * Weight vendor for OpenRouter / aggregator ids: `openrouter/<vendor>/…` → vendor.
 * Direct `provider/model` → provider (except openrouter itself).
 */
export function extractVendorHint(resolvedId: string): string | null {
  const id = normalizeId(resolvedId);
  const parts = id.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts[0] === "openrouter" && parts.length >= 2) {
    return parts[1]!;
  }
  if (parts.length >= 1) {
    return parts[0]!;
  }
  return null;
}

export function identifyModelEffect(
  requestedId: string,
  options?: {
    readonly catalog?: InferenceModelCatalog;
    readonly table?: readonly IdentityEntry[];
  }
): Effect.Effect<ModelIdentity> {
  return Effect.sync(() => {
    const catalog = options?.catalog ?? DEFAULT_INFERENCE_MODEL_CATALOG;
    const table = options?.table ?? DEFAULT_MODEL_IDENTITY_TABLE;
    const requested = requestedId.trim();
    const resolvedId = resolveCatalogAlias(requested, catalog);
    const resolvedNorm = normalizeId(resolvedId);

    for (const entry of table) {
      for (const pattern of entry.match) {
        if (globMatch(normalizeId(pattern), resolvedNorm)) {
          return {
            requestedId: requested,
            resolvedId,
            canonicalId: entry.canonicalId,
            vendor: entry.vendor,
            known: true,
          };
        }
      }
    }

    const hint = extractVendorHint(resolvedId);
    if (hint && hint !== "openrouter") {
      return {
        requestedId: requested,
        resolvedId,
        canonicalId: `${hint}/*`,
        vendor: hint,
        known: true,
      };
    }

    return {
      requestedId: requested,
      resolvedId,
      canonicalId: resolvedId,
      vendor: hint ?? "unknown",
      known: false,
    };
  });
}

/** Sync helper for tests / thin façades — prefer {@link identifyModelEffect}. */
export function identifyModel(
  requestedId: string,
  options?: {
    readonly catalog?: InferenceModelCatalog;
    readonly table?: readonly IdentityEntry[];
  }
): ModelIdentity {
  return Effect.runSync(identifyModelEffect(requestedId, options));
}
