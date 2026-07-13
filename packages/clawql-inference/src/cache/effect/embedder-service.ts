import { Context, Effect, Layer } from "effect";
import type { Embedder } from "../embedding.js";

/** Effect wrapper for semantic cache embedding lookups. */
export class EmbedderService extends Context.Tag("clawql/EmbedderService")<
  EmbedderService,
  {
    readonly embed: (text: string) => Effect.Effect<Float32Array, unknown>;
  }
>() {}

export function embedderLiveLayer(embedder: Embedder): Layer.Layer<EmbedderService> {
  return Layer.succeed(
    EmbedderService,
    EmbedderService.of({
      embed: (text) =>
        Effect.tryPromise({
          try: () => embedder.embed(text),
          catch: (cause) => cause,
        }),
    })
  );
}
