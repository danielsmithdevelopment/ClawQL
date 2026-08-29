import type { ProviderPlugin } from "clawql-core";
import { defaultPlugins } from "./panguard-proxy-plugin.js";
import { createPresidioGatewayPlugin, presidioPluginEnabled } from "./presidio-gateway-plugin.js";
import {
  createPrivacyFilterGatewayPlugin,
  privacyFilterPluginEnabled,
} from "./privacy-filter-gateway-plugin.js";

/**
 * Default sync plugins for `createClawQLApi()` — 8.0+: empty unless opted in
 * (`CLAWQL_PANGUARD_PROXY_PLUGIN=1`, optional Presidio / Privacy Filter flags).
 * Horizontal tiers register via `pluginLayers` (see `composeHorizontalPluginLayers`).
 */
export function composeDefaultPlugins(): readonly ProviderPlugin[] {
  const plugins: ProviderPlugin[] = [...defaultPlugins()];
  if (presidioPluginEnabled()) {
    plugins.push(createPresidioGatewayPlugin());
  }
  if (privacyFilterPluginEnabled()) {
    plugins.push(createPrivacyFilterGatewayPlugin());
  }
  return plugins;
}
