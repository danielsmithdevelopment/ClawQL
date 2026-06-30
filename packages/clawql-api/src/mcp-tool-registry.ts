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
  readonly schema: Record<string, z.ZodTypeAny>;
  readonly handler: McpToolHandler;
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

  registrationApi(): ClawQLPluginRegistrationApi {
    return {
      registerMcpTool: (tool: McpToolDefinition) =>
        this.register({
          name: tool.name,
          schema: tool.schema as Record<string, z.ZodTypeAny>,
          handler: tool.handler,
        }),
    };
  }
}
