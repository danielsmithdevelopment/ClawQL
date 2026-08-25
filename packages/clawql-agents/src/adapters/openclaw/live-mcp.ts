import { Effect } from "effect";
import type { ATRScope } from "../../shared/types.js";
import { openClawMcpHttpConfig, planOpenClawSkillInjection } from "./mcp-bridge.js";
import type { DiscoveredMcpTool } from "./mcp-bridge.js";

export type OpenClawMcpSetHttp = {
  readonly url: string;
  readonly env?: Record<string, string>;
};

export type OpenClawMcpSetStdio = {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Record<string, string>;
};

/** JSON payload for `openclaw mcp set clawql '<json>'` (HTTP). */
export const buildOpenClawMcpSetHttpJson = (
  mcpEndpoint: string,
  env?: Record<string, string>
): Effect.Effect<OpenClawMcpSetHttp> =>
  Effect.sync(() => {
    const payload: OpenClawMcpSetHttp = { url: mcpEndpoint };
    if (env && Object.keys(env).length > 0) {
      return { ...payload, env };
    }
    return payload;
  });

/** JSON payload for stdio registration (`npx -y clawql-mcp`). */
export const buildOpenClawMcpSetStdioJson = (
  env?: Record<string, string>
): Effect.Effect<OpenClawMcpSetStdio> =>
  Effect.sync(() => {
    const payload: OpenClawMcpSetStdio = {
      command: "npx",
      args: ["-y", "clawql-mcp"],
    };
    if (env && Object.keys(env).length > 0) {
      return { ...payload, env };
    }
    return payload;
  });

/** Shell lines an operator can paste (does not execute openclaw). */
export const formatOpenClawMcpSetCommands = (input: {
  readonly mode: "http" | "stdio";
  readonly mcpEndpoint?: string;
  readonly env?: Record<string, string>;
}): Effect.Effect<readonly string[]> =>
  Effect.gen(function* () {
    if (input.mode === "http") {
      const json = yield* buildOpenClawMcpSetHttpJson(
        input.mcpEndpoint ?? "http://127.0.0.1:8080/mcp",
        input.env
      );
      return [
        `openclaw mcp set clawql '${JSON.stringify(json)}'`,
        "openclaw mcp list",
        "openclaw mcp show clawql",
      ];
    }
    const json = yield* buildOpenClawMcpSetStdioJson(input.env);
    return [
      `openclaw mcp set clawql '${JSON.stringify(json)}'`,
      "openclaw mcp list",
      "openclaw mcp show clawql",
    ];
  });

/**
 * End-to-end OpenClaw wiring plan: MCP set JSON + ATR-filtered skill injection.
 */
export const planOpenClawLiveWiring = (input: {
  readonly mcpEndpoint: string;
  readonly atrScope: ATRScope;
  readonly discoveredTools: readonly DiscoveredMcpTool[];
  readonly mode?: "http" | "stdio";
}) =>
  Effect.gen(function* () {
    const mode = input.mode ?? "http";
    const commands = yield* formatOpenClawMcpSetCommands({
      mode,
      mcpEndpoint: input.mcpEndpoint,
    });
    const httpCfg = yield* openClawMcpHttpConfig(input.mcpEndpoint);
    const skills = yield* planOpenClawSkillInjection(input.discoveredTools, input.atrScope);
    return {
      mode,
      commands,
      httpCfg,
      skills,
      atrScope: input.atrScope,
    };
  });
