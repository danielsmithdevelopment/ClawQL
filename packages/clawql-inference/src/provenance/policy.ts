/**
 * Model provenance policy — denylist (general) or allowlist fail-closed (federal).
 */

import { Context, Effect, Layer } from "effect";
import { resolveProviderPluginFlags } from "../providers/registry.js";

export type ProvenanceProfile = "general" | "federal";
export type ProvenanceMode = "deny" | "allow";

export type ModelProvenancePolicy = {
  readonly enabled: boolean;
  readonly profile: ProvenanceProfile;
  readonly mode: ProvenanceMode;
  /** Weight vendors denied (denylist mode + always checked in allow mode as belt). */
  readonly deniedVendors: ReadonlySet<string>;
  /** Weight vendors allowed (allowlist mode). */
  readonly allowedVendors: ReadonlySet<string>;
  /** Exact resolved/canonical model ids allowed (allowlist mode). */
  readonly allowedModels: ReadonlySet<string>;
};

/** Federal-facing default allowlist — known non-DeepSeek vendors. Qwen allowed here (not in the DeepSeek order); buyers may tighten. */
export const FEDERAL_DEFAULT_ALLOWED_VENDORS: readonly string[] = [
  "anthropic",
  "openai",
  "google",
  "mistral",
  "meta",
  "xai",
  "microsoft",
  "ollama",
  "mlx",
  "fireworks",
  "together",
  "groq",
  "qwen",
];

function parseCsv(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const n = value.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

function parseFalsey(value: string | undefined): boolean {
  if (value === undefined) return false;
  const n = value.trim().toLowerCase();
  return n === "0" || n === "false" || n === "no" || n === "off";
}

/**
 * Load provenance policy from env.
 *
 * - `CLAWQL_INFERENCE_PROVENANCE_PROFILE=general|federal`
 * - `CLAWQL_INFERENCE_PROVENANCE_MODE=deny|allow` (overrides profile default mode)
 * - `CLAWQL_INFERENCE_DENIED_VENDORS=deepseek,...`
 * - `CLAWQL_INFERENCE_ALLOWED_VENDORS=anthropic,openai,...` (allow mode)
 * - `CLAWQL_INFERENCE_ALLOWED_MODELS=id,...` (allow mode)
 * - `CLAWQL_INFERENCE_PROVENANCE=0` disables the gate
 *
 * When `CLAWQL_INFERENCE_DISABLE_PROVIDERS` includes `deepseek`, DeepSeek is
 * auto-added to denied vendors so provider-plugin disable alone is not a false sense of safety.
 */
export function loadModelProvenancePolicyEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ModelProvenancePolicy> {
  return Effect.sync(() => {
    if (parseFalsey(env.CLAWQL_INFERENCE_PROVENANCE)) {
      return {
        enabled: false,
        profile: "general",
        mode: "deny" as const,
        deniedVendors: new Set<string>(),
        allowedVendors: new Set<string>(),
        allowedModels: new Set<string>(),
      };
    }

    const profileRaw = env.CLAWQL_INFERENCE_PROVENANCE_PROFILE?.trim().toLowerCase();
    const profile: ProvenanceProfile = profileRaw === "federal" ? "federal" : "general";

    const modeRaw = env.CLAWQL_INFERENCE_PROVENANCE_MODE?.trim().toLowerCase();
    const mode: ProvenanceMode =
      modeRaw === "allow" || modeRaw === "deny"
        ? modeRaw
        : profile === "federal"
          ? "allow"
          : "deny";

    const denied = new Set(parseCsv(env.CLAWQL_INFERENCE_DENIED_VENDORS));
    const { denylist: disabledProviders } = resolveProviderPluginFlags(env);
    // Provider-plugin disable must not leave aggregator routes open (openrouter/deepseek/*).
    if (disabledProviders?.includes("deepseek")) {
      denied.add("deepseek");
    }
    // Federal profile always denies DeepSeek at the identity gate (order-facing default).
    if (profile === "federal") {
      denied.add("deepseek");
    }

    const allowedVendors = new Set(
      parseCsv(env.CLAWQL_INFERENCE_ALLOWED_VENDORS).length > 0
        ? parseCsv(env.CLAWQL_INFERENCE_ALLOWED_VENDORS)
        : profile === "federal"
          ? FEDERAL_DEFAULT_ALLOWED_VENDORS
          : []
    );
    const allowedModels = new Set(parseCsv(env.CLAWQL_INFERENCE_ALLOWED_MODELS));

    const enabled =
      parseTruthy(env.CLAWQL_INFERENCE_PROVENANCE) ||
      profile === "federal" ||
      denied.size > 0 ||
      (mode === "allow" && (allowedVendors.size > 0 || allowedModels.size > 0));

    return {
      enabled,
      profile,
      mode,
      deniedVendors: denied,
      allowedVendors,
      allowedModels,
    };
  });
}

export function loadModelProvenancePolicy(
  env: NodeJS.ProcessEnv = process.env
): ModelProvenancePolicy {
  return Effect.runSync(loadModelProvenancePolicyEffect(env));
}

export class ModelProvenancePolicyService extends Context.Service<
  ModelProvenancePolicyService,
  {
    readonly policy: ModelProvenancePolicy;
  }
>()("clawql/ModelProvenancePolicyService") {}

export function modelProvenancePolicyLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<ModelProvenancePolicyService> {
  return Layer.effect(
    ModelProvenancePolicyService,
    Effect.gen(function* () {
      const policy = yield* loadModelProvenancePolicyEffect(env);
      return ModelProvenancePolicyService.of({ policy });
    })
  );
}
