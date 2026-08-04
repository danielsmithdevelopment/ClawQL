#!/usr/bin/env node
/**
 * Call the same demo MCP tools over gRPC CallTool (mcp-grpc-transport).
 *
 * Requires: node examples/mcp-api-adapter/server.mjs
 */

import {
  callToolServerStreamingGrpc,
  lastNonEmptyCallToolText,
  listToolsUnaryGrpc,
  resolveGrpcAddressFromEnv,
} from "mcp-grpc-transport";

const address =
  process.env.CLAWQL_MCP_GRPC_ADDR?.trim() ||
  resolveGrpcAddressFromEnv() ||
  "127.0.0.1:50051";

async function call(toolName, args) {
  const messages = await callToolServerStreamingGrpc({
    address,
    toolName,
    arguments: args,
  });
  return {
    text: lastNonEmptyCallToolText(messages),
    messages,
  };
}

async function main() {
  console.log(`gRPC address: ${address}\n`);

  const tools = await listToolsUnaryGrpc({ address });
  console.log(
    "ListTools:",
    tools.map((t) => t.name)
  );

  const echo = await call("echo", { message: "called via gRPC CallTool" });
  console.log("\nCallTool echo:", echo.text);

  const add = await call("add", { a: 20, b: 22 });
  console.log("CallTool add:", add.text);

  const greet = await call("greet", { name: "gRPC", shout: false });
  console.log("CallTool greet:", greet.text);

  console.log("\nTip: ENABLE_GRPC_REFLECTION=1 → grpcurl -plaintext", address, "list");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
