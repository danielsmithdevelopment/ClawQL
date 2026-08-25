import { Effect } from "effect";
import type { ATRScope } from "../../shared/types.js";
import { clineMcpServerConfig } from "./worm-hooks.js";

export type ClineMcpSettingsFragment = {
  readonly mcpServers: {
    readonly clawql: {
      readonly name: string;
      readonly url: string;
      readonly transport: "streamable-http";
    };
  };
  /** Operator hint: ATR should match Panguard JWT / session claims. */
  readonly atrScopeHint: ATRScope;
};

/**
 * Build Cline settings fragment that registers ClawQL MCP natively.
 * No bridge layer — Cline speaks MCP; Panguard still enforces ATR at the gateway.
 */
export const buildClineMcpBridge = (
  mcpEndpoint: string,
  atrScope: ATRScope
): Effect.Effect<ClineMcpSettingsFragment> =>
  Effect.sync(() => ({
    mcpServers: {
      clawql: clineMcpServerConfig(mcpEndpoint),
    },
    atrScopeHint: atrScope,
  }));
