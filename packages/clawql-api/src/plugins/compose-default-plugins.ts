import type { Plugin } from "clawql-core";
import { getClawqlOptionalToolFlags } from "../config/optional-flags.js";
import { createMemoryPlugin, MEMORY_PLUGIN_ID } from "./memory-plugin.js";
import { defaultPlugins } from "./panguard-proxy-plugin.js";

export { MEMORY_PLUGIN_ID };

/**
 * Default plugin set for `createClawQLApi()` — Panguard proxy + horizontal tiers gated by env.
 */
export function composeDefaultPlugins(
  options: { readonly enableMemory?: boolean } = {}
): readonly Plugin[] {
  const enableMemory = options.enableMemory ?? getClawqlOptionalToolFlags().enableMemory;
  return [...defaultPlugins(), ...(enableMemory ? [createMemoryPlugin()] : [])];
}
