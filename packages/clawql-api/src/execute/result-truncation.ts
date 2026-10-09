/**
 * Bound execute success payloads so agents never receive an unbounded silent cut.
 * Oversized JSON is replaced with an explicit truncated envelope.
 */

import { Context, Effect, Layer } from "effect";

/** Default char budget for serialized execute success JSON (~64 KiB). */
export const DEFAULT_EXECUTE_RESULT_CHAR_LIMIT = 64 * 1024;

/** Env override for {@link DEFAULT_EXECUTE_RESULT_CHAR_LIMIT}. */
export const EXECUTE_RESULT_MAX_CHARS_ENV = "CLAWQL_EXECUTE_RESULT_MAX_CHARS";

/** Marker appended to truncated previews (also echoed on the envelope). */
export const EXECUTE_TRUNCATION_MARKER = "…[TRUNCATED]";

export type TruncatedExecuteEnvelope = {
  readonly truncated: true;
  readonly byteCount: number;
  readonly limit: number;
  readonly marker: typeof EXECUTE_TRUNCATION_MARKER;
  readonly preview: string;
};

/**
 * Resolve char budget from env (positive int) or default.
 */
export const executeResultCharLimitEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<number> =>
  Effect.sync(() => {
    const raw = env[EXECUTE_RESULT_MAX_CHARS_ENV]?.trim();
    if (!raw) return DEFAULT_EXECUTE_RESULT_CHAR_LIMIT;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_EXECUTE_RESULT_CHAR_LIMIT;
    return n;
  });

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/**
 * Serialize execute success data. Under budget → pretty JSON as today.
 * Over budget → fail-closed envelope with `truncated: true` (never a silent cut).
 */
export const serializeExecuteResultEffect = (
  data: unknown,
  options?: { readonly limit?: number; readonly env?: NodeJS.ProcessEnv }
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const limit = options?.limit ?? (yield* executeResultCharLimitEffect(options?.env));
    const full = JSON.stringify(data, null, 2);
    const byteCount = utf8ByteLength(full);
    if (full.length <= limit) {
      return full;
    }

    let previewBudget = Math.max(0, limit - 256);
    let out: string;
    for (let i = 0; i < 8; i++) {
      const preview =
        previewBudget <= 0
          ? EXECUTE_TRUNCATION_MARKER
          : full.slice(0, previewBudget) + EXECUTE_TRUNCATION_MARKER;
      const envelope: TruncatedExecuteEnvelope = {
        truncated: true,
        byteCount,
        limit,
        marker: EXECUTE_TRUNCATION_MARKER,
        preview,
      };
      out = JSON.stringify(envelope, null, 2);
      if (out.length <= limit) return out;
      const overflow = out.length - limit;
      previewBudget = Math.max(0, previewBudget - overflow - 32);
    }

    // Fail closed: tiny limit still gets an explicit truncated flag (compact JSON).
    const minimal = JSON.stringify({
      truncated: true,
      byteCount,
      limit,
      marker: EXECUTE_TRUNCATION_MARKER,
      preview: EXECUTE_TRUNCATION_MARKER,
    } satisfies TruncatedExecuteEnvelope);
    if (minimal.length <= limit) return minimal;
    return `{"truncated":true,"byteCount":${byteCount},"limit":${limit},"marker":"${EXECUTE_TRUNCATION_MARKER}","preview":"${EXECUTE_TRUNCATION_MARKER}"}`;
  });

export class ExecuteResultTruncationService extends Context.Service<
  ExecuteResultTruncationService,
  {
    readonly charLimit: (env?: NodeJS.ProcessEnv) => Effect.Effect<number>;
    readonly serialize: (
      data: unknown,
      options?: { readonly limit?: number; readonly env?: NodeJS.ProcessEnv }
    ) => Effect.Effect<string>;
  }
>()("clawql/ExecuteResultTruncationService") {}

export const ExecuteResultTruncationLive = Layer.succeed(ExecuteResultTruncationService, {
  charLimit: (env) => executeResultCharLimitEffect(env),
  serialize: (data, options) => serializeExecuteResultEffect(data, options),
});
