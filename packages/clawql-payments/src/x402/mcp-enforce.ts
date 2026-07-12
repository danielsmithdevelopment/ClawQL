import { findX402GateForResource } from "./gate.js";
import { enforceX402Gate } from "./enforce.js";
import { isX402EnforcementActive } from "./config.js";
import { getMcpX402Context } from "./mcp-context.js";
import { X402McpPaymentDeniedError, X402McpPaymentRequiredError } from "./mcp-errors.js";

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
  const env = options.env ?? process.env;
  if (!isX402EnforcementActive(env)) {
    return;
  }

  const resource = mcpToolResourceName(options.toolName);
  const gate = await findX402GateForResource(resource, env);
  if (!gate) {
    return;
  }

  const ctx = getMcpX402Context();
  const headers = ctx?.headers ?? {};
  const requestUrl = ctx?.requestUrl ?? `mcp://tool/${encodeURIComponent(options.toolName)}`;

  const result = await enforceX402Gate({
    resource,
    requestUrl,
    headers,
    correlationId: ctx?.correlationId,
    env,
    fetchImpl: options.fetchImpl,
  });

  if (result.action === "allow") {
    return;
  }

  if (result.action === "require_payment") {
    throw new X402McpPaymentRequiredError(result.body);
  }

  throw new X402McpPaymentDeniedError(result.reason, result.resource);
}
