import { Effect } from "effect";
import type { ATRScope } from "../../shared/types.js";
import { isToolInScope } from "../../shared/panguard.js";

export type OpenClawSkillDescriptor = {
  readonly name: string;
  readonly description: string;
};

export type DiscoveredMcpTool = {
  readonly name: string;
  readonly description: string;
};

export type OpenClawSkillInjectionPlan = {
  readonly skills: readonly OpenClawSkillDescriptor[];
  readonly skippedOutOfScope: readonly string[];
};

/**
 * Plan ClawQL MCP tools as OpenClaw skills filtered by ATR.
 * Registration against a live OpenClaw instance is operator-side (optional peer).
 */
export const planOpenClawSkillInjection = (
  tools: readonly DiscoveredMcpTool[],
  atrScope: ATRScope
): Effect.Effect<OpenClawSkillInjectionPlan> =>
  Effect.sync(() => {
    const skills: OpenClawSkillDescriptor[] = [];
    const skippedOutOfScope: string[] = [];
    for (const tool of tools) {
      if (!isToolInScope(tool.name, atrScope)) {
        skippedOutOfScope.push(tool.name);
        continue;
      }
      skills.push({
        name: `clawql_${tool.name}`,
        description: tool.description,
      });
    }
    return { skills, skippedOutOfScope };
  });

/** OpenClaw `mcp set`-style HTTP fragment for ClawQL Streamable HTTP. */
export const openClawMcpHttpConfig = (mcpEndpoint: string) =>
  Effect.sync(() => ({
    clawql: {
      url: mcpEndpoint,
      transport: "streamable-http" as const,
    },
  }));
