/**
 * Effect service surface for gdp-ts naming. Proof minting stays in trusted
 * proofs modules (defineProof must not be exported from here).
 */

import { name, type Named } from "@gdp-ts/core";
import { Context, Effect, Layer } from "effect";

export class GdpService extends Context.Service<
  GdpService,
  {
    /** Name one value and run an Effect inside the name scope. */
    readonly name1: <A, R, E, R2>(
      a: A,
      k: <N>(a: Named<N, A>) => Effect.Effect<R, E, R2>
    ) => Effect.Effect<R, E, R2>;
    /** Name two values and run an Effect inside the name scope. */
    readonly name2: <A, B, R, E, R2>(
      a: A,
      b: B,
      k: <N, M>(a: Named<N, A>, b: Named<M, B>) => Effect.Effect<R, E, R2>
    ) => Effect.Effect<R, E, R2>;
    /** Name three values and run an Effect inside the name scope. */
    readonly name3: <A, B, C, R, E, R2>(
      a: A,
      b: B,
      c: C,
      k: <N, M, O>(
        a: Named<N, A>,
        b: Named<M, B>,
        c: Named<O, C>
      ) => Effect.Effect<R, E, R2>
    ) => Effect.Effect<R, E, R2>;
  }
>()("clawql/GdpService") {}

export const GdpServiceLive = Layer.succeed(
  GdpService,
  GdpService.of({
    name1: (a, k) => name(a, k),
    name2: (a, b, k) => name(a, b, k),
    name3: (a, b, c, k) => name(a, b, c, k),
  })
);

export function runGdpEffect<A, E>(program: Effect.Effect<A, E, GdpService>): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(GdpServiceLive)));
}
