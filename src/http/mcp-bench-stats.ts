/**
 * Bench-only diagnostics for Streamable HTTP: live session / stream / audit counts.
 * Gated by {@link benchStatsEnabled} (`CLAWQL_BENCH_STATS=1`).
 */

import { Effect } from "effect";
import { getDefaultAuditRingBuffer } from "clawql-core";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { WebStandardStreamMaps } from "./prune-json-stream-mappings.js";

export const benchStatsEnabled = (env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> =>
  Effect.sync(() => ["1", "true", "yes"].includes((env.CLAWQL_BENCH_STATS ?? "").trim().toLowerCase()));

export type McpBenchStats = {
  readonly mcp_sessions: number;
  readonly stream_mapping_entries: number;
  readonly request_to_stream_entries: number;
  readonly audit_ring_entries: number;
  readonly audit_ring_max: number;
  readonly rss_mb: number | null;
  readonly heap_used_mb: number | null;
};

function webMaps(transport: StreamableHTTPServerTransport): WebStandardStreamMaps | undefined {
  return (transport as unknown as { _webStandardTransport?: WebStandardStreamMaps })
    ._webStandardTransport;
}

export const collectMcpBenchStats = (
  transports: ReadonlyMap<string, StreamableHTTPServerTransport>
): Effect.Effect<McpBenchStats> =>
  Effect.sync(() => {
    let streamEntries = 0;
    let requestEntries = 0;
    for (const t of transports.values()) {
      const web = webMaps(t);
      streamEntries += web?._streamMapping?.size ?? 0;
      requestEntries += web?._requestToStreamMapping?.size ?? 0;
    }
    const ring = getDefaultAuditRingBuffer().list(0);
    const mem = process.memoryUsage();
    return {
      mcp_sessions: transports.size,
      stream_mapping_entries: streamEntries,
      request_to_stream_entries: requestEntries,
      audit_ring_entries: ring.total,
      audit_ring_max: ring.maxEntries,
      rss_mb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
      heap_used_mb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
    };
  });
