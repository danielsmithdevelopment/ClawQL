import { basePluginCompositionFlags, type ClawqlOptionalToolFlags } from "clawql-api";
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
 * Transport knobs (`ENABLE_GRPC`) remain outside this resolver.
 * Provider stack uses instance `providers` / `CLAWQL_PROVIDER` (clawql-api spec-loader), not
 * `CLAWQL_ENABLE_GOOGLE|AWS|CLOUDFLARE`.
 */
export function resolvePluginCompositionFlags(
  env: NodeJS.ProcessEnv = process.env
): ClawqlOptionalToolFlags {
  const loaded = loadClawqlInstanceSpecFromEnvSync(env);
  const instance = loaded ?? applyTierPreset({ tier: tierFromEnv(env) });
  const tierSpec = clawqlInstanceSpecToHorizontalTierSpec(instance);
  const flags = optionalFlagsFromHorizontalTierSpec(tierSpec, basePluginCompositionFlags());

  // Transport only — legacy provider-stack fields kept on the flag object but unused for loading.
  const transport = {
    enableGrpc: env.ENABLE_GRPC?.trim() === "1" || env.ENABLE_GRPC?.trim().toLowerCase() === "true",
    enableGrpcReflection:
      env.ENABLE_GRPC_REFLECTION?.trim() === "1" ||
      env.ENABLE_GRPC_REFLECTION?.trim().toLowerCase() === "true",
    enableGoogle: false,
    enableAws: false,
    enableCloudflare: true,
  };

  return { ...flags, ...transport };
}
