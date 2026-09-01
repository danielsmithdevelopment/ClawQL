import { getClawqlOptionalToolFlags, type ClawqlOptionalToolFlags } from "clawql-api";

/**
 * Resolves MCP **plugin** composition flags from ClawQLInstance / tier — **not** `CLAWQL_ENABLE_*`.
 *
 * When instance JSON is unset, applies `CLAWQL_TIER` or **`standard`** preset (env ENABLE flags ignored).
 * Transport (`ENABLE_GRPC`) remains env-based inside {@link getClawqlOptionalToolFlags}.
 */
export function resolvePluginCompositionFlags(
  env: NodeJS.ProcessEnv = process.env
): ClawqlOptionalToolFlags {
  const hasInstance =
    Boolean(env.CLAWQL_INSTANCE_SPEC?.trim()) || Boolean(env.CLAWQL_INSTANCE_SPEC_FILE?.trim());
  if (hasInstance) {
    return getClawqlOptionalToolFlags(env);
  }
  return getClawqlOptionalToolFlags({
    ...env,
    CLAWQL_TIER: env.CLAWQL_TIER?.trim() || "standard",
  });
}
