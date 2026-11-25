/**
 * S1: unauthenticated CallTool (server-streaming) must return UNAUTHENTICATED
 * without crashing the Node process (auth wrapper must not call a missing callback).
 */
import { afterEach, describe, expect, it } from "vitest";
import * as grpc from "@grpc/grpc-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maybeStartGrpcMcpServer } from "./server.js";
import { callToolServerStreamingGrpc } from "./grpc-call-tool-client.js";

describe("gRPC auth wrapper streaming safety (S1)", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const prev: Record<string, string | undefined> = {};

  function stash(keys: string[]) {
    for (const k of keys) prev[k] = process.env[k];
  }
  function restore() {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  afterEach(async () => {
    while (cleanups.length) {
      const c = cleanups.pop();
      if (c) await c();
    }
    restore();
  });

  it("unauthenticated CallTool gets UNAUTHENTICATED and process stays up", async () => {
    stash([
      "ENABLE_GRPC",
      "ENABLE_GRPC_REFLECTION",
      "GRPC_BIND",
      "GRPC_PORT",
      "GRPC_ALLOW_INSECURE",
      "GRPC_TLS_CERT_PATH",
      "GRPC_TLS_KEY_PATH",
    ]);
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";
    delete process.env.GRPC_TLS_CERT_PATH;
    delete process.env.GRPC_TLS_KEY_PATH;
    // Host only in GRPC_BIND — getGrpcBindAddress appends GRPC_PORT.
    process.env.GRPC_BIND = "127.0.0.1";
    process.env.GRPC_PORT = "0";

    const started = await maybeStartGrpcMcpServer({
      createMcpServer: () =>
        new McpServer({ name: "s1-test", version: "0.0.0" }, { capabilities: { tools: {} } }),
      authorizeMetadata: async () => false,
      bindAddress: "127.0.0.1:0",
    });
    expect(started).toBeTruthy();
    cleanups.push(() => started!.shutdown());

    const beforeListeners = process.listenerCount("unhandledRejection");
    let unhandled = 0;
    const onUnhandled = () => {
      unhandled += 1;
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      await expect(
        callToolServerStreamingGrpc({
          address: started!.address,
          credentials: grpc.credentials.createInsecure(),
          toolName: "search",
          arguments: { query: "x" },
        })
      ).rejects.toMatchObject({
        code: grpc.status.UNAUTHENTICATED,
      });
      // Give the void async wrapper a tick to throw if it still would.
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).toBe(0);
      expect(process.listenerCount("unhandledRejection")).toBeGreaterThanOrEqual(beforeListeners);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
