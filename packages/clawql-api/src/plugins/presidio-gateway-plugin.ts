import { defineProviderPlugin, type ProviderPlugin } from "clawql-core";

import { loadPresidioConfig, presidioEnabled } from "../presidio/client.js";

export const PRESIDIO_PLUGIN_ID = "clawql-presidio-gateway";

/** Registers Presidio gateway marker (execute + ingest redaction runs in clawql-api paths). */
export function createPresidioGatewayPlugin(): ProviderPlugin {
  const cfg = loadPresidioConfig();
  if (cfg) {
    process.stderr.write(
      `[clawql-api] PresidioGatewayPlugin active analyzer=${cfg.analyzerUrl} policy=${cfg.failurePolicy}\n`
    );
  }
  return defineProviderPlugin({
    id: PRESIDIO_PLUGIN_ID,
    version: "0.1.0",
    description: "Presidio PII gateway marker (redaction runs on execute/ingest paths)",
  });
}

export function presidioPluginEnabled(): boolean {
  return presidioEnabled();
}
