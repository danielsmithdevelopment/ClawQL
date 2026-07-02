import type { Plugin } from "clawql-core";
import { defaultPlugins } from "./panguard-proxy-plugin.js";

/**
 * Default sync plugins for `createClawQLApi()` — Panguard proxy only.
 * Horizontal tiers register via `pluginLayers` (see `composeHorizontalPluginLayers`).
 */
export function composeDefaultPlugins(): readonly Plugin[] {
  return [...defaultPlugins()];
}
