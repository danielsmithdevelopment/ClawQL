import {
  headersFromPlainRecord,
  runWithMcpX402Context,
} from "clawql-payments/x402";
import { setMcpMessageContextHook } from "mcp-grpc-transport";

let registered = false;

/** Propagate gRPC / HTTP MCP request headers into x402 AsyncLocalStorage for tool calls. */
export function registerMcpX402TransportHooks(): void {
  if (registered) return;
  registered = true;

  setMcpMessageContextHook((extra) => async (fn) => {
    const headers = extra.requestInfo?.headers ?? {};
    return runWithMcpX402Context(headersFromPlainRecord(headers, headers["x-grpc-host"]), fn);
  });
}

export { runWithMcpX402Context, headersFromExpressRequest } from "clawql-payments/x402";
