import type { ToolCatalog } from "./types.js";
import { buildCatalogFromUpstream, type UpstreamConnection } from "./upstream.js";

/** @deprecated Prefer {@link buildCatalogFromUpstream} via {@link connectUpstream}. */
export async function fetchToolCatalog(options: {
  grpcAddress: string;
  protocolVersion?: string;
}): Promise<ToolCatalog> {
  const { connectUpstream } = await import("./upstream.js");
  const upstream = await connectUpstream({
    kind: "grpc",
    address: options.grpcAddress,
    protocolVersion: options.protocolVersion,
  });
  try {
    return buildCatalogFromUpstream(upstream);
  } finally {
    await upstream.close();
  }
}

export async function refreshCatalog(
  upstream: UpstreamConnection,
  mcpPath?: string,
  wsPath?: string,
  mcpUiPath?: string
): Promise<ToolCatalog> {
  const tools = await upstream.refreshTools();
  upstream.tools = tools;
  return buildCatalogFromUpstream(upstream, { tools, mcpPath, wsPath, mcpUiPath });
}
