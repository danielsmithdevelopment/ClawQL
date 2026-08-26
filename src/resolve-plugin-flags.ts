import {
  basePluginCompositionFlags,
  type ClawqlOptionalToolFlags,
} from "clawql-api";
import {
  applyTierPreset,
  clawqlInstanceSpecToHorizontalTierSpec,
  loadClawqlInstanceSpecFromEnvSync,
  optionalFlagsFromHorizontalTierSpec,
  type ClawQLInstanceSpecV1Alpha1,
} from "clawql-operator/spec";

function tierFromEnv(env: NodeJS.ProcessEnv): NonNullable<ClawQLInstanceSpecV1Alpha1["tier"]> {
  const raw = env.CLAWQL_TIER?.trim().toLowerCase();
  if (raw === "local" || raw === "standard" || raw === "enterprise") return raw;
  return "standard";
}

/**
 * Resolves MCP **plugin** composition flags from the standardized plugin config:
 * {@link ClawQLInstanceSpecV1Alpha1} / horizontal tier spec — **not** `CLAWQL_ENABLE_*`.
 *
 * Precedence:
 * 1. `CLAWQL_INSTANCE_SPEC` (inline JSON) or `CLAWQL_INSTANCE_SPEC_FILE`
 * 2. Else `{ tier: CLAWQL_TIER ?? "standard" }` expanded via tier presets
 *
 * Ouroboros / harness tools are always composed separately (see `composeHorizontalPluginLayers`).
 * Transport knobs (`ENABLE_GRPC`) and provider-stack flags remain outside this resolver.
 */
export function resolvePluginCompositionFlags(
  env: NodeJS.ProcessEnv = process.env
): ClawqlOptionalToolFlags {
  const loaded = loadClawqlInstanceSpecFromEnvSync(env);
  const instance = loaded ?? applyTierPreset({ tier: tierFromEnv(env) });
  const tierSpec = clawqlInstanceSpecToHorizontalTierSpec(instance);
  const flags = optionalFlagsFromHorizontalTierSpec(tierSpec, basePluginCompositionFlags());

  // Transport / provider-stack (not horizontal plugins) — still read from process env.
  const transport = {
    enableGrpc: env.ENABLE_GRPC?.trim() === "1" || env.ENABLE_GRPC?.trim().toLowerCase() === "true",
    enableGrpcReflection:
      env.ENABLE_GRPC_REFLECTION?.trim() === "1" ||
      env.ENABLE_GRPC_REFLECTION?.trim().toLowerCase() === "true",
    enableGoogle:
      env.CLAWQL_ENABLE_GOOGLE?.trim() === "1" ||
      env.CLAWQL_ENABLE_GOOGLE?.trim().toLowerCase() === "true",
    enableAws:
      env.CLAWQL_ENABLE_AWS?.trim() === "1" || env.CLAWQL_ENABLE_AWS?.trim().toLowerCase() === "true",
    enableCloudflare: (() => {
      const v = env.CLAWQL_ENABLE_CLOUDFLARE?.trim().toLowerCase();
      if (v === undefined || v === "") return true;
      return !(v === "0" || v === "false" || v === "no");
    })(),
  };

  return { ...flags, ...transport };
}
