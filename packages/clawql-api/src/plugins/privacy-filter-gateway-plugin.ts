import { defineProviderPlugin, type ProviderPlugin } from "clawql-core";

import { loadPrivacyFilterConfig, privacyFilterEnabled } from "../privacy-filter/client.js";

export const PRIVACY_FILTER_PLUGIN_ID = "clawql-privacy-filter-gateway";

/** Registers local Privacy Filter gateway marker (backup after Presidio on execute/ingest paths). */
export function createPrivacyFilterGatewayPlugin(): ProviderPlugin {
  const cfg = loadPrivacyFilterConfig();
  if (cfg) {
    process.stderr.write(
      `[clawql-api] PrivacyFilterGatewayPlugin active url=${cfg.baseUrl} model=${cfg.modelId} policy=${cfg.failurePolicy} (local only)\n`
    );
  }
  return defineProviderPlugin({
    id: PRIVACY_FILTER_PLUGIN_ID,
    version: "0.1.0",
    description: "Local Privacy Filter gateway marker (backup after Presidio)",
  });
}

export function privacyFilterPluginEnabled(): boolean {
  return privacyFilterEnabled();
}
