import {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  type ClawQLPluginRegistrationApi,
  type McpToolDefinition,
  type McpToolHandler,
} from "clawql-core";
import { Effect } from "effect";
import type { z } from "zod";

export type McpToolRegistration = {
  readonly name: string;
  readonly description?: string;
  readonly schema: Record<string, z.ZodTypeAny>;
  readonly handler: McpToolHandler;
  /** Preserved for Agent Seer scenario synthesis / eval quality (§9.3). */
  readonly parameterNotes?: Record<string, string>;
};

export class McpToolRegistry {
  private readonly tools = new Map<string, McpToolRegistration>();

  register(
    tool: McpToolRegistration
  ): Effect.Effect<void, McpToolAlreadyRegisteredError | ClawQLError> {
    const tools = this.tools;
    return Effect.gen(function* () {
      if (tools.has(tool.name)) {
        return yield* Effect.fail(new McpToolAlreadyRegisteredError({ toolName: tool.name }));
      }
      tools.set(tool.name, tool);
    });
  }

  list(): readonly McpToolRegistration[] {
    return [...this.tools.values()];
  }

  /** ToolDefinition-shaped rows for scenario synthesis (handlers omitted from eval surface). */
  listForSynthesis(): readonly import("clawql-core").ToolDefinition[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      schema: t.schema as unknown as Record<string, unknown>,
      handler: t.handler,
      parameterNotes: t.parameterNotes,
    }));
  }

  registrationApi(): ClawQLPluginRegistrationApi {
    return {
      registerMcpTool: (tool: McpToolDefinition) =>
        this.register({
          name: tool.name,
          description: tool.description ?? tool.name,
          schema: tool.schema as Record<string, z.ZodTypeAny>,
          handler: tool.handler,
          parameterNotes: tool.parameterNotes,
        }),
    };
  }
}
