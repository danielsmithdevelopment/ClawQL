import { getClawqlOptionalToolFlags, type ClawqlOptionalToolFlags } from "clawql-api";
import {
  clawqlInstanceSpecToHorizontalTierSpec,
  loadClawqlInstanceSpecFromEnvSync,
  optionalFlagsFromHorizontalTierSpec,
} from "clawql-operator/spec";

/**
 * Resolves MCP plugin flags: env vars remain the default path; an optional ClawQLInstance
 * spec (file or inline JSON) overlays tier toggles when present. When unset, behavior is
 * identical to {@link getClawqlOptionalToolFlags} alone.
 */
export function resolvePluginCompositionFlags(
  env: NodeJS.ProcessEnv = process.env
): ClawqlOptionalToolFlags {
  const envFlags = getClawqlOptionalToolFlags(env);
  const instanceSpec = loadClawqlInstanceSpecFromEnvSync(env);
  if (!instanceSpec) return envFlags;
  const tierSpec = clawqlInstanceSpecToHorizontalTierSpec(instanceSpec);
  return optionalFlagsFromHorizontalTierSpec(tierSpec, envFlags);
}
