import { listToolsUnaryGrpc } from "mcp-grpc-transport";
import type { ToolCatalog } from "./types.js";

export async function fetchToolCatalog(options: {
  grpcAddress: string;
  protocolVersion?: string;
}): Promise<ToolCatalog> {
  const tools = await listToolsUnaryGrpc({
    address: options.grpcAddress,
    protocolVersion: options.protocolVersion,
  });
  return {
    tools,
    fetchedAt: new Date().toISOString(),
    grpcAddress: options.grpcAddress,
  };
}
