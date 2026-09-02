import { Context, Data, Effect, Layer } from "effect";
import { refreshCatalog as refreshCatalogImpl } from "../catalog.js";
import { connectUpstream, buildCatalogFromUpstream as buildCatalogFromUpstreamImpl } from "../upstream.js";
import type { ListedMcpTool, McpApiAdapterOptions, ToolCatalog } from "../types.js";
import type { UpstreamConnection } from "../upstream.js";

export class McpApiAdapterError extends Data.TaggedError("McpApiAdapterError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class McpApiAdapterService extends Context.Tag("clawql/McpApiAdapterService")<
  McpApiAdapterService,
  {
    readonly refreshCatalog: (
      upstream: UpstreamConnection,
      mcpPath?: string,
      wsPath?: string,
      mcpUiPath?: string
    ) => Effect.Effect<ToolCatalog, McpApiAdapterError>;
    readonly connectUpstream: (
      options: NonNullable<McpApiAdapterOptions["upstream"]>
    ) => Effect.Effect<Awaited<ReturnType<typeof connectUpstream>>, McpApiAdapterError>;
    readonly buildCatalogFromUpstream: (
      connection: UpstreamConnection,
      extras?: {
        tools?: ListedMcpTool[];
        mcpPath?: string;
        wsPath?: string;
        mcpUiPath?: string;
      }
    ) => Effect.Effect<ToolCatalog, McpApiAdapterError>;
  }
>() {}

const fromPromise = <A>(reason: string, task: () => Promise<A>) =>
  Effect.tryPromise({
    try: task,
    catch: (cause) => new McpApiAdapterError({ reason, cause }),
  });

export const McpApiAdapterServiceLive = Layer.succeed(
  McpApiAdapterService,
  McpApiAdapterService.of({
    refreshCatalog: (upstream, mcpPath, wsPath, mcpUiPath) =>
      fromPromise("refresh catalog failed", () =>
        refreshCatalogImpl(upstream, mcpPath, wsPath, mcpUiPath)
      ),
    connectUpstream: (options) => fromPromise("connect upstream failed", () => connectUpstream(options)),
    buildCatalogFromUpstream: (connection, extras) =>
      Effect.sync(() => buildCatalogFromUpstreamImpl(connection, extras)),
  })
);

export function runMcpApiAdapterEffect<A, E>(
  program: Effect.Effect<A, E, McpApiAdapterService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(McpApiAdapterServiceLive)));
}
