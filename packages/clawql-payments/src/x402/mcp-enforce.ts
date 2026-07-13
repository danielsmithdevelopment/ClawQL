import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { mcpX402BeforeCallToolEffect } from "./mcp-enforce-effect.js";

export function mcpToolResourceName(toolName: string): string {
  return `tool:${toolName.trim()}`;
}

export type RunMcpX402BeforeCallToolOptions = {
  toolName: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

/**
 * In-process x402 gate for MCP `tools/call`. Uses payment proof from
 * {@link getMcpX402Context} (Streamable HTTP / gRPC headers) when set.
 */
export async function runMcpX402BeforeCallTool(
  options: RunMcpX402BeforeCallToolOptions
): Promise<void> {
  await runPaymentsEffect(mcpX402BeforeCallToolEffect(options), options.env);
}
