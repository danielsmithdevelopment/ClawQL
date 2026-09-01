import { Effect } from "effect";
import type { ATRScope } from "../../shared/types.js";
import { isToolInScope } from "../../shared/panguard.js";

export type OpenHandsToolDescriptor = {
  readonly name: string;
  readonly description: string;
};

export const planOpenHandsMcpInjection = (
  tools: readonly OpenHandsToolDescriptor[],
  atrScope: ATRScope
): Effect.Effect<{
  readonly tools: readonly OpenHandsToolDescriptor[];
  readonly skipped: readonly string[];
}> =>
  Effect.sync(() => {
    const allowed: OpenHandsToolDescriptor[] = [];
    const skipped: string[] = [];
    for (const tool of tools) {
      if (!isToolInScope(tool.name, atrScope)) {
        skipped.push(tool.name);
        continue;
      }
      allowed.push({
        name: `clawql_${tool.name}`,
        description: tool.description,
      });
    }
    return { tools: allowed, skipped };
  });
