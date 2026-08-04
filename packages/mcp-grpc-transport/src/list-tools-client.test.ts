import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { maybeStartGrpcMcpServer, type StartedGrpcServer } from "./server.js";
import { listToolsUnaryGrpc } from "./grpc-call-tool-client.js";

describe("listToolsUnaryGrpc", () => {
  let started: StartedGrpcServer | undefined;
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";
  });

  afterEach(async () => {
    process.env = { ...saved };
    await started?.shutdown();
    started = undefined;
  });

  it("returns tool names and input schemas", async () => {
    started = await maybeStartGrpcMcpServer({
      createMcpServer: () => {
        const s = new McpServer({ name: "list-tools-client-test", version: "0.0.0" });
        s.tool("echo", "Echo", { message: z.string() }, async ({ message }) => ({
          content: [{ type: "text", text: message }],
        }));
        return s;
      },
      bindAddress: "127.0.0.1:0",
    });
    if (!started) throw new Error("expected server");

    const tools = await listToolsUnaryGrpc({ address: started.address });
    expect(tools.map((t) => t.name)).toContain("echo");
    const echo = tools.find((t) => t.name === "echo")!;
    expect(echo.inputSchema).toBeTruthy();
    expect(typeof echo.inputSchema).toBe("object");
    const props = echo.inputSchema.properties as Record<string, unknown> | undefined;
    expect(props?.message).toBeTruthy();
  });
});
