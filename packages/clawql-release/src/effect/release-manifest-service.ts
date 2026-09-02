import { Context, Data, Effect, Layer } from "effect";
import { collectReleaseManifest } from "../collect.js";
import { verifyReleaseManifest } from "../verify.js";
import type { CollectOptions, ReleaseManifestV01, VerifyResult } from "../types.js";

export class ReleaseManifestError extends Data.TaggedError("ReleaseManifestError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class ReleaseManifestService extends Context.Tag("clawql/ReleaseManifestService")<
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
>() {}

const fromPromise = <A>(reason: string, task: () => Promise<A>) =>
  Effect.tryPromise({
    try: task,
    catch: (cause) => new ReleaseManifestError({ reason, cause }),
  });

export const ReleaseManifestServiceLive = Layer.succeed(
  ReleaseManifestService,
  ReleaseManifestService.of({
    collect: (options) => fromPromise("collect release manifest failed", () => collectReleaseManifest(options)),
    verify: (manifestPath, bundleDir, options) =>
      fromPromise("verify release manifest failed", () =>
        verifyReleaseManifest(manifestPath, bundleDir, options)
      ),
  })
);

export function runReleaseManifestEffect<A, E>(
  program: Effect.Effect<A, E, ReleaseManifestService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(ReleaseManifestServiceLive)));
}
