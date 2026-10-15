/**
 * Bound execute success payloads so agents never receive an unbounded silent cut.
 * Oversized JSON is replaced with an explicit truncated envelope.
 *
 * Two budgets:
 * 1. Hard char limit (`CLAWQL_EXECUTE_RESULT_MAX_CHARS`, default 64 KiB) — always on.
 * 2. Observation budget (~2k tokens) when the caller omits both `where` and `fields`
 *    and does not pass `full: true` — returns a short preview + honest truncation note
 *    so models retry with a filter instead of stuffing 60k tokens into context.
 */

import { Context, Effect, Layer } from "effect";
import { WHERE_FIX_EXAMPLES } from "./where-filter.js";

/** Default char budget for serialized execute success JSON (~64 KiB). */
export const DEFAULT_EXECUTE_RESULT_CHAR_LIMIT = 64 * 1024;

/** Env override for {@link DEFAULT_EXECUTE_RESULT_CHAR_LIMIT}. */
export const EXECUTE_RESULT_MAX_CHARS_ENV = "CLAWQL_EXECUTE_RESULT_MAX_CHARS";

/**
 * Soft observation budget (~2000 tokens ≈ 8000 chars of JSON) when no shaping
 * (`where` / `fields`) and `full` is not set.
 */
export const DEFAULT_OBSERVATION_BUDGET_CHARS = 8000;

/** Env override for {@link DEFAULT_OBSERVATION_BUDGET_CHARS}. `0` disables. */
export const OBSERVATION_BUDGET_CHARS_ENV = "CLAWQL_EXECUTE_OBSERVATION_BUDGET_CHARS";

/** How many array rows to keep in an observation-budget preview. */
export const DEFAULT_OBSERVATION_PREVIEW_ITEMS = 20;

/** Marker appended to truncated previews (also echoed on the envelope). */
export const EXECUTE_TRUNCATION_MARKER = "…[TRUNCATED]";

export type TruncatedExecuteEnvelope = {
  readonly truncated: true;
  readonly byteCount: number;
  readonly limit: number;
  readonly marker: typeof EXECUTE_TRUNCATION_MARKER;
  readonly preview: unknown;
  readonly reason?: "hard_limit" | "observation_budget";
  readonly note?: string;
  /** Present for list previews — always use this for count questions, not preview length. */
  readonly totalCount?: number;
  readonly previewCount?: number;
  /** `list` = row preview; `object` = single payload truncated by size (no row count). */
  readonly shape?: "list" | "object";
  /** Suggested JMESPath when the caller omitted where/fields. */
  readonly example?: string;
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

/** Resolve observation budget; `0` / negative disables the soft budget. */
export const observationBudgetCharsEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<number> =>
  Effect.sync(() => {
    const raw = env[OBSERVATION_BUDGET_CHARS_ENV]?.trim();
    if (raw === undefined || raw === "") return DEFAULT_OBSERVATION_BUDGET_CHARS;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_OBSERVATION_BUDGET_CHARS;
    return Math.max(0, n);
  });

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** Rough cl100k-style estimate without pulling tiktoken into the API package. */
export function estimateTokensFromChars(charCount: number): number {
  return Math.ceil(Math.max(0, charCount) / 4);
}

type ArraySite = {
  readonly path: "root" | "result";
  readonly items: unknown[];
  readonly container: Record<string, unknown> | null;
};

function findPrimaryArray(data: unknown): ArraySite | null {
  if (Array.isArray(data)) {
    return { path: "root", items: data, container: null };
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.result)) {
      return { path: "result", items: obj.result, container: obj };
    }
  }
  return null;
}

function listObservationNote(totalCount: number, previewCount: number, example: string): string {
  return (
    `${totalCount} records, first ${previewCount} shown. ` +
    `totalCount=${totalCount}; previewCount=${previewCount}. ` +
    `This result is truncated — do not treat the preview as the full answer; ` +
    `for count questions use totalCount, not the number of preview rows. ` +
    `Filter with where, for example ${example}, or pass full:true if you genuinely need everything.`
  );
}

function objectObservationNote(byteCount: number, limit: number, example: string): string {
  return (
    `Single object truncated by size (${byteCount} bytes > observation budget ${limit} chars). ` +
    `This result is truncated — do not treat the preview as the full answer. ` +
    `There is no row count; extract fields with where (e.g. ${example}) or pass full:true.`
  );
}

/**
 * Build a structured preview for observation-budget truncation (arrays preferred).
 */
export function buildObservationPreview(
  data: unknown,
  previewItems: number = DEFAULT_OBSERVATION_PREVIEW_ITEMS,
  options?: { readonly budgetChars?: number }
): {
  readonly preview: unknown;
  readonly totalCount?: number;
  readonly previewCount?: number;
  readonly shape: "list" | "object";
  readonly example: string;
  readonly note: string;
  readonly byteCount: number;
} {
  const full = JSON.stringify(data);
  const byteCount = utf8ByteLength(full);
  const site = findPrimaryArray(data);
  if (site) {
    const totalCount = site.items.length;
    const previewCount = Math.min(previewItems, totalCount);
    const slice = site.items.slice(0, previewCount);
    const example = WHERE_FIX_EXAMPLES.filter;
    const preview =
      site.path === "root"
        ? slice
        : {
            ...site.container,
            result: slice,
            result_info: {
              ...(typeof site.container?.result_info === "object" && site.container.result_info
                ? (site.container.result_info as object)
                : {}),
              truncated: true,
              total_count: totalCount,
              preview_count: previewCount,
            },
          };
    return {
      preview,
      totalCount,
      previewCount,
      shape: "list",
      example,
      note: listObservationNote(totalCount, previewCount, example),
      byteCount,
    };
  }
  // Large single object / nested blob: truncate by size (no row preview).
  const limit = options?.budgetChars ?? DEFAULT_OBSERVATION_BUDGET_CHARS;
  const example = WHERE_FIX_EXAMPLES.extract;
  return {
    preview: full.slice(0, 400) + EXECUTE_TRUNCATION_MARKER,
    shape: "object",
    example,
    note: objectObservationNote(byteCount, limit, example),
    byteCount,
  };
}

function fitEnvelopeToLimit(envelope: TruncatedExecuteEnvelope, limit: number): string {
  let previewBudget =
    typeof envelope.preview === "string"
      ? Math.min(envelope.preview.length, Math.max(0, limit - 320))
      : -1;
  for (let i = 0; i < 8; i++) {
    const preview =
      typeof envelope.preview === "string"
        ? previewBudget <= 0
          ? EXECUTE_TRUNCATION_MARKER
          : envelope.preview.slice(0, previewBudget) +
            (previewBudget < envelope.preview.length ? EXECUTE_TRUNCATION_MARKER : "")
        : envelope.preview;
    const out = JSON.stringify({ ...envelope, preview }, null, 2);
    if (out.length <= limit) return out;
    if (typeof envelope.preview !== "string") {
      // Structured preview too large — fall back to string slice.
      const asText = JSON.stringify(envelope.preview);
      return fitEnvelopeToLimit(
        {
          ...envelope,
          preview: asText.slice(0, Math.max(0, limit - 400)) + EXECUTE_TRUNCATION_MARKER,
        },
        limit
      );
    }
    const overflow = out.length - limit;
    previewBudget = Math.max(0, previewBudget - overflow - 32);
  }
  const minimal = JSON.stringify({
    truncated: true,
    byteCount: envelope.byteCount,
    limit,
    marker: EXECUTE_TRUNCATION_MARKER,
    reason: envelope.reason ?? "hard_limit",
    note:
      envelope.note ??
      "This result is truncated — do not treat the preview as the full answer.",
    preview: EXECUTE_TRUNCATION_MARKER,
  } satisfies TruncatedExecuteEnvelope);
  if (minimal.length <= limit) return minimal;
  return `{"truncated":true,"byteCount":${envelope.byteCount},"limit":${limit},"marker":"${EXECUTE_TRUNCATION_MARKER}","reason":"${envelope.reason ?? "hard_limit"}","note":"This result is truncated.","preview":"${EXECUTE_TRUNCATION_MARKER}"}`;
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
    return fitEnvelopeToLimit(
      {
        truncated: true,
        byteCount,
        limit,
        marker: EXECUTE_TRUNCATION_MARKER,
        reason: "hard_limit",
        note: "This result is truncated — do not treat the preview as the full answer.",
        preview: full.slice(0, Math.max(0, limit - 256)) + EXECUTE_TRUNCATION_MARKER,
      },
      limit
    );
  });

export type SerializeExecuteOptions = {
  readonly where?: string;
  readonly fields?: readonly string[];
  /** Opt out of the soft observation budget (still subject to hard char limit). */
  readonly full?: boolean;
  readonly hardLimit?: number;
  readonly observationBudget?: number;
  readonly previewItems?: number;
  readonly env?: NodeJS.ProcessEnv;
};

/**
 * Serialize with observation budget then hard limit.
 * Soft budget applies only when `where` and `fields` are both omitted and `full` is not true.
 */
export const serializeExecuteResultWithBudgetsEffect = (
  data: unknown,
  options?: SerializeExecuteOptions
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const env = options?.env ?? process.env;
    const hardLimit = options?.hardLimit ?? (yield* executeResultCharLimitEffect(env));
    const hasWhere = typeof options?.where === "string" && options.where.trim().length > 0;
    const hasFields = Array.isArray(options?.fields) && options.fields.length > 0;
    const wantFull = options?.full === true;
    const obsBudget =
      options?.observationBudget ?? (yield* observationBudgetCharsEffect(env));

    if (!wantFull && !hasWhere && !hasFields && obsBudget > 0) {
      const full = JSON.stringify(data, null, 2);
      if (full.length > obsBudget) {
        const built = buildObservationPreview(
          data,
          options?.previewItems ?? DEFAULT_OBSERVATION_PREVIEW_ITEMS,
          { budgetChars: obsBudget }
        );
        const envelope: TruncatedExecuteEnvelope = {
          truncated: true,
          reason: "observation_budget",
          note: built.note,
          shape: built.shape,
          ...(built.totalCount !== undefined ? { totalCount: built.totalCount } : {}),
          ...(built.previewCount !== undefined ? { previewCount: built.previewCount } : {}),
          example: built.example,
          byteCount: built.byteCount,
          limit: obsBudget,
          marker: EXECUTE_TRUNCATION_MARKER,
          preview: built.preview,
        };
        // Soft envelope itself must fit under the hard limit.
        return fitEnvelopeToLimit(envelope, Math.min(hardLimit, Math.max(obsBudget, 1024)));
      }
    }
    return yield* serializeExecuteResultEffect(data, { limit: hardLimit, env });
  });

export class ExecuteResultTruncationService extends Context.Service<
  ExecuteResultTruncationService,
  {
    readonly charLimit: (env?: NodeJS.ProcessEnv) => Effect.Effect<number>;
    readonly observationBudget: (env?: NodeJS.ProcessEnv) => Effect.Effect<number>;
    readonly serialize: (
      data: unknown,
      options?: { readonly limit?: number; readonly env?: NodeJS.ProcessEnv }
    ) => Effect.Effect<string>;
    readonly serializeWithBudgets: (
      data: unknown,
      options?: SerializeExecuteOptions
    ) => Effect.Effect<string>;
  }
>()("clawql/ExecuteResultTruncationService") {}

export const ExecuteResultTruncationLive = Layer.succeed(ExecuteResultTruncationService, {
  charLimit: (env) => executeResultCharLimitEffect(env),
  observationBudget: (env) => observationBudgetCharsEffect(env),
  serialize: (data, options) => serializeExecuteResultEffect(data, options),
  serializeWithBudgets: (data, options) => serializeExecuteResultWithBudgetsEffect(data, options),
});
