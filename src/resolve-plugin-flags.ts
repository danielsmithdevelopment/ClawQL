import { getClawqlOptionalToolFlags, type ClawqlOptionalToolFlags } from "clawql-api";

/** Horizontal plugin ENABLE_* keys that no longer drive composition without CLAWQL_INSTANCE_SPEC. */
const LEGACY_PLUGIN_ENABLE_KEYS = [
  "CLAWQL_ENABLE_MEMORY",
  "CLAWQL_ENABLE_DOCUMENTS",
  "CLAWQL_ENABLE_SCHEDULE",
  "CLAWQL_ENABLE_NOTIFY",
  "CLAWQL_ENABLE_WORKFLOW",
  "CLAWQL_ENABLE_ARGO_CD",
  "CLAWQL_ENABLE_VISION",
  "CLAWQL_ENABLE_ONYX",
  "CLAWQL_ENABLE_SANDBOX",
  "CLAWQL_ENABLE_DATA",
  "CLAWQL_ENABLE_WEB",
  "CLAWQL_ENABLE_CODEGRAPH",
  "CLAWQL_ENABLE_ONTOLOGY",
  "CLAWQL_ENABLE_ONTOLOGY_WRITES",
  "CLAWQL_ENABLE_HITL_LABEL_STUDIO",
  "CLAWQL_ENABLE_CONESHARE",
  "CLAWQL_ENABLE_IDP_PIPELINE",
  "CLAWQL_ENABLE_IDP_CLASSIFIER",
  "CLAWQL_ENABLE_LANGEXTRACT",
  "CLAWQL_ENABLE_PDF_INSPECTOR",
  "CLAWQL_ENABLE_ANYDOC",
  "CLAWQL_ENABLE_LANGFUSE_EVAL",
] as const;

let warnedLegacyPluginEnable = false;

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

  const legacySet = LEGACY_PLUGIN_ENABLE_KEYS.filter((k) => Boolean(env[k]?.trim()));
  if (legacySet.length > 0 && !warnedLegacyPluginEnable) {
    warnedLegacyPluginEnable = true;
    console.error(
      `[clawql] BREAKING (8.0.0): ${legacySet.join(", ")} ignored without CLAWQL_INSTANCE_SPEC — ` +
        `composition uses CLAWQL_TIER=${env.CLAWQL_TIER?.trim() || "standard"}. ` +
        `Put toggles in CLAWQL_INSTANCE_SPEC (Helm enable* → instance JSON) or set CLAWQL_TIER. ` +
        `See RELEASE_NOTES_v8.0.0.md.`
    );
  }

  return getClawqlOptionalToolFlags({
    ...env,
    CLAWQL_TIER: env.CLAWQL_TIER?.trim() || "standard",
  });
}

/** Test helper — reset one-shot legacy ENABLE_* warning. */
export function resetLegacyPluginEnableWarningForTests(): void {
  warnedLegacyPluginEnable = false;
}
