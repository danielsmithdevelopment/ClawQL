import { Context, Data, Effect, Layer } from "effect";
import {
  callToolServerStreamingGrpc,
  listToolsUnaryGrpc,
  type CallToolGrpcClientOptions,
  type ListToolsGrpcClientOptions,
} from "../grpc-call-tool-client.js";
import { maybeStartGrpcMcpServer, type GrpcMcpServerOptions } from "../server.js";

export class GrpcMcpTransportError extends Data.TaggedError("GrpcMcpTransportError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class GrpcMcpTransportService extends Context.Tag("clawql/GrpcMcpTransportService")<
  GrpcMcpTransportService,
  {
    readonly maybeStartServer: (
      options: GrpcMcpServerOptions
    ) => Effect.Effect<Awaited<ReturnType<typeof maybeStartGrpcMcpServer>>, GrpcMcpTransportError>;
    readonly callToolStreaming: (
      options: CallToolGrpcClientOptions
    ) => Effect.Effect<
      Awaited<ReturnType<typeof callToolServerStreamingGrpc>>,
      GrpcMcpTransportError
    >;
    readonly listTools: (
      options: ListToolsGrpcClientOptions
    ) => Effect.Effect<Awaited<ReturnType<typeof listToolsUnaryGrpc>>, GrpcMcpTransportError>;
  }
>() {}

const fromPromise = <A>(reason: string, task: () => Promise<A>) =>
  Effect.tryPromise({
    try: task,
    catch: (cause) => new GrpcMcpTransportError({ reason, cause }),
  });

export const GrpcMcpTransportServiceLive = Layer.succeed(
  GrpcMcpTransportService,
  GrpcMcpTransportService.of({
    maybeStartServer: (options) =>
      fromPromise("start gRPC MCP server failed", () => maybeStartGrpcMcpServer(options)),
    callToolStreaming: (options) =>
      fromPromise("gRPC callTool failed", () => callToolServerStreamingGrpc(options)),
    listTools: (options) => fromPromise("gRPC listTools failed", () => listToolsUnaryGrpc(options)),
  })
);

export function runGrpcMcpTransportEffect<A, E>(
  program: Effect.Effect<A, E, GrpcMcpTransportService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(GrpcMcpTransportServiceLive)));
}
