import { Context, Data, Effect, Layer } from "effect";
import { collectReleaseManifestEffect } from "../collect.js";
import { verifyReleaseManifestEffect } from "../verify.js";
import type { CollectOptions, ReleaseManifestV01, VerifyResult } from "../types.js";

export class ReleaseManifestError extends Data.TaggedError("ReleaseManifestError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class ReleaseManifestService extends Context.Service<
  ReleaseManifestService,
  {
    readonly collect: (
      options: CollectOptions
    ) => Effect.Effect<ReleaseManifestV01, ReleaseManifestError>;
    readonly verify: (
      manifestPath: string,
      bundleDir?: string,
      options?: { workspaceRoot?: string }
    ) => Effect.Effect<VerifyResult, ReleaseManifestError>;
  }
>()("clawql/ReleaseManifestService") {}

export const ReleaseManifestServiceLive = Layer.succeed(
  ReleaseManifestService,
  ReleaseManifestService.of({
    collect: (options) =>
      collectReleaseManifestEffect(options).pipe(
        Effect.mapError(
          (cause) => new ReleaseManifestError({ reason: "collect release manifest failed", cause })
        )
      ),
    verify: (manifestPath, bundleDir, options) =>
      verifyReleaseManifestEffect(manifestPath, bundleDir, options).pipe(
        Effect.mapError(
          (cause) => new ReleaseManifestError({ reason: "verify release manifest failed", cause })
        )
      ),
  })
);

export function runReleaseManifestEffect<A, E>(
  program: Effect.Effect<A, E, ReleaseManifestService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(ReleaseManifestServiceLive)));
}
