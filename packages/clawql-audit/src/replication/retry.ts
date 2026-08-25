import { Effect } from "effect";
import { AuditError } from "../errors.js";

export type RetryConfig = {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
};

export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 10,
  backoffMs: 100,
  backoffMultiplier: 2,
};

export const withRetry = <A>(
  effect: () => Effect.Effect<A, AuditError>,
  retry: RetryConfig
): Effect.Effect<A, AuditError> =>
  Effect.gen(function* () {
    let delay = retry.backoffMs;
    let last: AuditError | undefined;
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      const result = yield* effect().pipe(
        Effect.map((value) => ({ ok: true as const, value })),
        Effect.catchAll((err) => Effect.succeed({ ok: false as const, err }))
      );
      if (result.ok) return result.value;
      last = result.err;
      if (attempt < retry.maxAttempts) {
        yield* Effect.sleep(`${delay} millis`);
        delay = Math.floor(delay * retry.backoffMultiplier);
      }
    }
    return yield* Effect.fail(
      last ?? new AuditError({ reason: "retry exhausted with no error" })
    );
  });
