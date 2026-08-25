import { Effect } from "effect";
import type { ATRScope } from "../../shared/types.js";
import { isToolInScope } from "../../shared/panguard.js";

export type DeepSeekToolDescriptor = {
  readonly name: string;
  readonly description: string;
};

/** Plan Cordis service-bus tool registration for ClawQL MCP tools. */
export const planDeepSeekMcpRegistration = (
  tools: readonly DeepSeekToolDescriptor[],
  atrScope: ATRScope
): Effect.Effect<{
  readonly tools: readonly DeepSeekToolDescriptor[];
  readonly skipped: readonly string[];
}> =>
  Effect.sync(() => {
    const allowed: DeepSeekToolDescriptor[] = [];
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
