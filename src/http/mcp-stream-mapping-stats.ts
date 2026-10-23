/**
 * Bench / regression diagnostics for Streamable HTTP JSON `_streamMapping` size.
 * Gated by `CLAWQL_BENCH_STATS=1` on `/healthz`.
 */

import { Effect } from "effect";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { WebStandardStreamMaps } from "./prune-json-stream-mappings.js";

export const benchStatsEnabled = (env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> =>
  Effect.sync(() =>
    ["1", "true", "yes"].includes((env.CLAWQL_BENCH_STATS ?? "").trim().toLowerCase())
  );

export type StreamMappingStats = {
  readonly mcp_sessions: number;
  readonly stream_mapping_entries: number;
  readonly request_to_stream_entries: number;
};

function webMaps(transport: StreamableHTTPServerTransport): WebStandardStreamMaps | undefined {
  return (transport as unknown as { _webStandardTransport?: WebStandardStreamMaps })
    ._webStandardTransport;
}

export const collectStreamMappingStats = (
  transports: ReadonlyMap<string, StreamableHTTPServerTransport>
): Effect.Effect<StreamMappingStats> =>
  Effect.sync(() => {
    let streamEntries = 0;
    let requestEntries = 0;
    for (const t of transports.values()) {
      const web = webMaps(t);
      streamEntries += web?._streamMapping?.size ?? 0;
      requestEntries += web?._requestToStreamMapping?.size ?? 0;
    }
    return {
      mcp_sessions: transports.size,
      stream_mapping_entries: streamEntries,
      request_to_stream_entries: requestEntries,
    };
  });
