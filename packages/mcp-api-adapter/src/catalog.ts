import type { ToolCatalog } from "./types.js";
import { buildCatalogFromUpstream, type UpstreamConnection } from "./upstream.js";
import { Effect } from "effect";

/** @deprecated Prefer {@link buildCatalogFromUpstream} via {@link connectUpstream}. */
async function fetchToolCatalogImpl(options: {
  grpcAddress: string;
  protocolVersion?: string;
}): Promise<ToolCatalog>  {
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

export function fetchToolCatalogEffect(options: {
  grpcAddress: string;
  protocolVersion?: string;
}): Effect.Effect<ToolCatalog, Error> {
  return Effect.tryPromise({
    try: () => fetchToolCatalogImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link fetchToolCatalogEffect} for Effect callers. */
export async function fetchToolCatalog(options: {
  grpcAddress: string;
  protocolVersion?: string;
}): Promise<ToolCatalog>  {
  return Effect.runPromise(fetchToolCatalogEffect(options));
}

async function refreshCatalogImpl(
  upstream: UpstreamConnection,
  mcpPath?: string,
  wsPath?: string,
  mcpUiPath?: string
): Promise<ToolCatalog>  {
  const tools = await upstream.refreshTools();
  upstream.tools = tools;
  return buildCatalogFromUpstream(upstream, { tools, mcpPath, wsPath, mcpUiPath });
}

export function refreshCatalogEffect(
  upstream: UpstreamConnection,
  mcpPath?: string,
  wsPath?: string,
  mcpUiPath?: string
): Effect.Effect<ToolCatalog, Error> {
  return Effect.tryPromise({
    try: () => refreshCatalogImpl(upstream, mcpPath, wsPath, mcpUiPath),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link refreshCatalogEffect} for Effect callers. */
export async function refreshCatalog(
  upstream: UpstreamConnection,
  mcpPath?: string,
  wsPath?: string,
  mcpUiPath?: string
): Promise<ToolCatalog>  {
  return Effect.runPromise(refreshCatalogEffect(upstream, mcpPath, wsPath, mcpUiPath));
}
