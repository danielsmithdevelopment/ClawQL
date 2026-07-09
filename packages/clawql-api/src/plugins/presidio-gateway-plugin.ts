import type { Plugin } from "clawql-core";
import { Effect } from "effect";

import { loadPresidioConfig, presidioEnabled } from "../presidio/client.js";

export const PRESIDIO_PLUGIN_ID = "clawql-presidio-gateway";

/** Registers Presidio gateway hook (execute + ingest redaction runs in clawql-api execute/memory paths). */
export function createPresidioGatewayPlugin(): Plugin {
  return {
    id: PRESIDIO_PLUGIN_ID,
    version: "0.1.0",
    kind: "mcp-proxy",
    vertical: "security",
    onRegister: () =>
      Effect.sync(() => {
        const cfg = loadPresidioConfig();
        if (!cfg) return;
        process.stderr.write(
          `[clawql-api] PresidioGatewayPlugin active analyzer=${cfg.analyzerUrl} policy=${cfg.failurePolicy}\n`
        );
      }),
  };
}

export function presidioPluginEnabled(): boolean {
  return presidioEnabled();
}
