import { defineProviderPlugin, type ProviderPlugin } from "clawql-core";

import { tailcatConnectHook } from "../enforcement/tailcat-connect-hook.js";
import { gatewayRegistryToolDefinitions } from "../registry/mcp-tools.js";

export const NETWORK_PLUGIN_ID = "clawql-network";

/** Registers tailcat ATR enforcement hook + gateway registry MCP tools. */
export const createNetworkPlugin = (): ProviderPlugin =>
  defineProviderPlugin({
    id: NETWORK_PLUGIN_ID,
    version: "0.1.0",
    description: "Headscale mesh + governed Tailcat ephemeral transport (selector + audit hooks)",
    hooks: [tailcatConnectHook],
    tools: [...gatewayRegistryToolDefinitions()],
  });
