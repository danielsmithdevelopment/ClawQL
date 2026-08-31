import type { AnyPlugin } from "clawql-core";
import { defaultPlugins } from "./panguard-proxy-plugin.js";
import { createPresidioGatewayPlugin, presidioPluginEnabled } from "./presidio-gateway-plugin.js";
import {
  createPrivacyFilterGatewayPlugin,
  privacyFilterPluginEnabled,
} from "./privacy-filter-gateway-plugin.js";
import { createHandoffSkillPlugin, handoffSkillPluginEnabled } from "../skills/handoff-plugin.js";
import {
  createWebMcpDraftGatewayPlugin,
  webMcpDraftPluginEnabled,
} from "./webmcp-draft-gateway-plugin.js";

/**
 * Default sync plugins for `createClawQLApi()` — 8.0+:
 * - Panguard / Presidio / Privacy Filter: opt-in
 * - Handoff standalone skill: **default on** (skills approach for 8.0)
 * - WebMCP draft provider: opt-in (`CLAWQL_ENABLE_WEBMCP_DRAFT=1`)
 * Horizontal tiers still register via `pluginLayers`.
 */
export function composeDefaultPlugins(): readonly AnyPlugin[] {
  const plugins: AnyPlugin[] = [...defaultPlugins()];
  if (handoffSkillPluginEnabled()) {
    plugins.push(createHandoffSkillPlugin());
  }
  if (presidioPluginEnabled()) {
    plugins.push(createPresidioGatewayPlugin());
  }
  if (privacyFilterPluginEnabled()) {
    plugins.push(createPrivacyFilterGatewayPlugin());
  }
  if (webMcpDraftPluginEnabled()) {
    plugins.push(createWebMcpDraftGatewayPlugin());
  }
  return plugins;
}
