import { Context, Effect, Layer } from "effect";
import { loadNetworkState, type NetworkState } from "../network-state.js";
import { selectTransport, type ConnectionRequest, type NetworkTransport } from "../selector.js";

export class NetworkTransportService extends Context.Tag("clawql/NetworkTransportService")<
  NetworkTransportService,
  {
    readonly selectTransport: (req: ConnectionRequest) => Effect.Effect<NetworkTransport>;
    readonly loadState: (home?: string) => Effect.Effect<NetworkState | null, never>;
  }
>() {}

export const NetworkTransportServiceLive = Layer.succeed(
  NetworkTransportService,
  NetworkTransportService.of({
    selectTransport: (req) => Effect.sync(() => selectTransport(req)),
    loadState: (home) => loadNetworkState(home),
  })
);

export function runNetworkTransportEffect<A, E>(
  program: Effect.Effect<A, E, NetworkTransportService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(NetworkTransportServiceLive)));
}
