import type { Plugin } from "clawql-core";
import { Effect } from "effect";

import { loadPrivacyFilterConfig, privacyFilterEnabled } from "../privacy-filter/client.js";

export const PRIVACY_FILTER_PLUGIN_ID = "clawql-privacy-filter-gateway";

/** Registers local Privacy Filter gateway hook (backup after Presidio on execute/ingest paths). */
export function createPrivacyFilterGatewayPlugin(): Plugin {
  return {
    id: PRIVACY_FILTER_PLUGIN_ID,
    version: "0.1.0",
    kind: "mcp-proxy",
    vertical: "security",
    onRegister: () =>
      Effect.sync(() => {
        const cfg = loadPrivacyFilterConfig();
        if (!cfg) return;
        process.stderr.write(
          `[clawql-api] PrivacyFilterGatewayPlugin active url=${cfg.baseUrl} model=${cfg.modelId} policy=${cfg.failurePolicy} (local only)\n`
        );
      }),
  };
}

export function privacyFilterPluginEnabled(): boolean {
  return privacyFilterEnabled();
}
