import { Effect } from "effect";
import type { ATRScope } from "../../shared/types.js";
import { isToolInScope } from "../../shared/panguard.js";

export type GooseToolDescriptor = {
  readonly name: string;
  readonly description: string;
};

/**
 * Register ClawQL MCP tools into Goose's tool catalog (plan only — no Goose SDK dep).
 */
export const planGooseMcpToolRegistration = (
  tools: readonly GooseToolDescriptor[],
  atrScope: ATRScope
): Effect.Effect<{
  readonly registered: readonly GooseToolDescriptor[];
  readonly skipped: readonly string[];
}> =>
  Effect.sync(() => {
    const registered: GooseToolDescriptor[] = [];
    const skipped: string[] = [];
    for (const tool of tools) {
      if (!isToolInScope(tool.name, atrScope)) {
        skipped.push(tool.name);
        continue;
      }
      registered.push({
        name: `clawql_${tool.name}`,
        description: tool.description,
      });
    }
    return { registered, skipped };
  });
