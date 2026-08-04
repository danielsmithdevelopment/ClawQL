import type { Plugin } from "clawql-core";
import { defaultPlugins } from "./panguard-proxy-plugin.js";
import { createPresidioGatewayPlugin, presidioPluginEnabled } from "./presidio-gateway-plugin.js";
import {
  createPrivacyFilterGatewayPlugin,
  privacyFilterPluginEnabled,
} from "./privacy-filter-gateway-plugin.js";

/**
 * Default sync plugins for `createClawQLApi()` — Panguard proxy + optional Presidio + Privacy Filter.
 * Horizontal tiers register via `pluginLayers` (see `composeHorizontalPluginLayers`).
 */
export function composeDefaultPlugins(): readonly Plugin[] {
  const plugins: Plugin[] = [...defaultPlugins()];
  if (presidioPluginEnabled()) {
    plugins.push(createPresidioGatewayPlugin());
  }
  if (privacyFilterPluginEnabled()) {
    plugins.push(createPrivacyFilterGatewayPlugin());
  }
  return plugins;
}
