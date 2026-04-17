import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * Two linked {@link Transport} halves: client-side messages cross to the server's `onmessage`
 * and vice versa (in-process MCP JSON-RPC, used to bridge protobuf gRPC to {@link McpServer}).
 */
export function createLinkedMcpTransports(): {
  clientTransport: Transport;
  serverTransport: Transport;
} {
  const clientTransport: Transport = {
    onmessage: undefined,
    onclose: undefined,
    onerror: undefined,
    sessionId: undefined,
    setProtocolVersion: undefined,
    async start() {},
    async send(message: JSONRPCMessage) {
      queueMicrotask(() => {
        serverTransport.onmessage?.(message as JSONRPCMessage, undefined);
      });
    },
    async close() {
      serverTransport.onclose?.();
    },
  };

  const serverTransport: Transport = {
    onmessage: undefined,
    onclose: undefined,
    onerror: undefined,
    sessionId: undefined,
    setProtocolVersion: undefined,
    async start() {},
    async send(message: JSONRPCMessage) {
      queueMicrotask(() => {
        clientTransport.onmessage?.(message as JSONRPCMessage, undefined);
      });
    },
    async close() {
      clientTransport.onclose?.();
    },
  };

  return { clientTransport, serverTransport };
}
