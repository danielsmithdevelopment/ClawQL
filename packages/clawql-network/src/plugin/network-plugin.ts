import { defineProviderPlugin, type ProviderPlugin } from "clawql-core";

import { tailcatConnectHook } from "../enforcement/tailcat-connect-hook.js";

export const NETWORK_PLUGIN_ID = "clawql-network";

/** Registers tailcat ATR enforcement hook with clawql-core. */
export const createNetworkPlugin = (): ProviderPlugin =>
  defineProviderPlugin({
    id: NETWORK_PLUGIN_ID,
    version: "0.1.0",
    description: "Headscale mesh + governed Tailcat ephemeral transport (selector + audit hooks)",
    hooks: [tailcatConnectHook],
  });
