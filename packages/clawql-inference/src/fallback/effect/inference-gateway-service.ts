import { Context, Effect, Layer } from "effect";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../../gateway.js";

/** Effect wrapper for an inner {@link InferenceGateway} (fallback chain attempts). */
export class InferenceGatewayService extends Context.Tag("clawql/InferenceGatewayService")<
  InferenceGatewayService,
  {
    readonly complete: (request: InferenceRequest) => Effect.Effect<InferenceResponse, unknown>;
  }
>() {}

export function inferenceGatewayLiveLayer(
  inner: InferenceGateway
): Layer.Layer<InferenceGatewayService> {
  return Layer.succeed(
    InferenceGatewayService,
    InferenceGatewayService.of({
      complete: (request) =>
        Effect.tryPromise({
          try: () => inner.complete(request),
          catch: (cause) => cause,
        }),
    })
  );
}
