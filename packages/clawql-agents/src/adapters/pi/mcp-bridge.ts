import { Effect } from "effect";
import type { ATRScope } from "../../shared/types.js";

/**
 * Pi is API-only — inject ClawQL by wrapping the client: recall at session start,
 * ingest at session end. No native MCP; operators call ClawQL MCP alongside Pi.
 */
export const buildPiSessionMemoryPlan = (input: {
  readonly atrScope: ATRScope;
  readonly mcpEndpoint: string;
}): Effect.Effect<{
  readonly recallOnStart: boolean;
  readonly ingestOnEnd: boolean;
  readonly mcpEndpoint: string;
  readonly atrScope: ATRScope;
}> =>
  Effect.sync(() => ({
    recallOnStart: input.atrScope.toolsInScope.includes("memory_recall"),
    ingestOnEnd: input.atrScope.toolsInScope.includes("memory_ingest"),
    mcpEndpoint: input.mcpEndpoint,
    atrScope: input.atrScope,
  }));
