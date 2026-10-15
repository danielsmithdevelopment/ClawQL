/**
 * Declarative `where` filtering for execute responses (JMESPath).
 *
 * Applied **after** the provider response and **before** `fields` projection.
 * Caps expression size/complexity; invalid expressions fail closed.
 */

import { Context, Effect, Layer } from "effect";
import jmespath from "jmespath";
import { projectRestByFields } from "./field-projection.js";

/** Max characters for a `where` expression (schema + runtime). */
export const WHERE_MAX_LENGTH = 512;

/** Max `|` pipe operators in a `where` expression. */
export const WHERE_MAX_PIPES = 6;

/** Max nesting depth of `[]` / `()` groups. */
export const WHERE_MAX_NEST_DEPTH = 8;

/** Max function-call sites (`name(`) in a `where` expression. */
export const WHERE_MAX_FUNCTION_CALLS = 8;

export type WhereFilterIssue = "empty" | "too_long" | "too_complex" | "invalid_expression";

/** Canonical short examples returned on every fail-closed `where` error. */
export const WHERE_FIX_EXAMPLES = {
  filter: "result[?type==`A`]",
  count: "length(result[?state=='ACTIVE'])",
  extract: "result[0].id",
} as const;

/** Tagged fail-closed error for invalid or over-budget `where` expressions. */
export class WhereFilterError extends Error {
  readonly _tag = "WhereFilterError";
  constructor(
    message: string,
    readonly issue: WhereFilterIssue,
    readonly fixHint: string,
    /** One corrected JMESPath the model can paste/adapt. */
    readonly example: string = WHERE_FIX_EXAMPLES.filter
  ) {
    super(message);
    this.name = "WhereFilterError";
  }
}

function countPipes(expression: string): number {
  let count = 0;
  let inSingle = false;
  let inBacktick = false;
  for (let i = 0; i < expression.length; i++) {
    const ch = expression[i]!;
    if (ch === "'" && !inBacktick) inSingle = !inSingle;
    else if (ch === "`" && !inSingle) inBacktick = !inBacktick;
    else if (ch === "|" && !inSingle && !inBacktick) count++;
  }
  return count;
}

function maxNestDepth(expression: string): number {
  let depth = 0;
  let max = 0;
  let inSingle = false;
  let inBacktick = false;
  for (let i = 0; i < expression.length; i++) {
    const ch = expression[i]!;
    if (ch === "'" && !inBacktick) inSingle = !inSingle;
    else if (ch === "`" && !inSingle) inBacktick = !inBacktick;
    else if (!inSingle && !inBacktick) {
      if (ch === "[" || ch === "(") {
        depth++;
        if (depth > max) max = depth;
      } else if (ch === "]" || ch === ")") {
        depth = Math.max(0, depth - 1);
      }
    }
  }
  return max;
}

function countFunctionCalls(expression: string): number {
  const re = /[A-Za-z_][A-Za-z0-9_]*\s*\(/g;
  let count = 0;
  for (const _ of expression.matchAll(re)) count++;
  return count;
}

/**
 * Validate size/complexity caps (fail closed). Does not parse JMESPath yet.
 */
export const validateWhereCapsEffect = (where: string): Effect.Effect<string, WhereFilterError> =>
  Effect.gen(function* () {
    const trimmed = where.trim();
    if (!trimmed) {
      return yield* Effect.fail(
        new WhereFilterError(
          "where expression is empty",
          "empty",
          `Provide a non-empty JMESPath, or omit where. Example: ${WHERE_FIX_EXAMPLES.filter}`,
          WHERE_FIX_EXAMPLES.filter
        )
      );
    }
    if (trimmed.length > WHERE_MAX_LENGTH) {
      return yield* Effect.fail(
        new WhereFilterError(
          `where expression exceeds max length ${WHERE_MAX_LENGTH} (got ${trimmed.length})`,
          "too_long",
          `Shorten to ≤${WHERE_MAX_LENGTH} chars. Prefer a tight filter like ${WHERE_FIX_EXAMPLES.filter} over returning whole arrays.`,
          WHERE_FIX_EXAMPLES.filter
        )
      );
    }
    const pipes = countPipes(trimmed);
    if (pipes > WHERE_MAX_PIPES) {
      return yield* Effect.fail(
        new WhereFilterError(
          `where expression is too complex: ${pipes} pipe operators (max ${WHERE_MAX_PIPES})`,
          "too_complex",
          `Reduce | pipes to ≤${WHERE_MAX_PIPES}, or split across calls. Example without pipes: ${WHERE_FIX_EXAMPLES.count}`,
          WHERE_FIX_EXAMPLES.count
        )
      );
    }
    const nest = maxNestDepth(trimmed);
    if (nest > WHERE_MAX_NEST_DEPTH) {
      return yield* Effect.fail(
        new WhereFilterError(
          `where expression is too complex: nest depth ${nest} (max ${WHERE_MAX_NEST_DEPTH})`,
          "too_complex",
          `Flatten [] / () nesting to ≤${WHERE_MAX_NEST_DEPTH}. Example: ${WHERE_FIX_EXAMPLES.extract}`,
          WHERE_FIX_EXAMPLES.extract
        )
      );
    }
    const fns = countFunctionCalls(trimmed);
    if (fns > WHERE_MAX_FUNCTION_CALLS) {
      return yield* Effect.fail(
        new WhereFilterError(
          `where expression is too complex: ${fns} function calls (max ${WHERE_MAX_FUNCTION_CALLS})`,
          "too_complex",
          `Use ≤${WHERE_MAX_FUNCTION_CALLS} functions (length, contains, …). Example: ${WHERE_FIX_EXAMPLES.count}`,
          WHERE_FIX_EXAMPLES.count
        )
      );
    }
    return trimmed;
  });

/**
 * Evaluate JMESPath `where` against provider JSON.
 * Omit / undefined → identity. Invalid expression → {@link WhereFilterError}.
 */
export const applyWhereEffect = (
  data: unknown,
  where: string | undefined
): Effect.Effect<unknown, WhereFilterError> =>
  Effect.gen(function* () {
    if (where === undefined || where === null) return data;
    const expression = yield* validateWhereCapsEffect(where);
    return yield* Effect.try({
      try: () => jmespath.search(data, expression) as unknown,
      catch: (cause) => {
        const detail = cause instanceof Error ? cause.message : String(cause);
        const shown = expression.length > 80 ? `${expression.slice(0, 77)}…` : expression;
        const example = suggestWhereExample(expression);
        return new WhereFilterError(
          `Invalid where JMESPath (${detail}). Got: ${shown}`,
          "invalid_expression",
          `Fix the syntax, then retry. Corrected example: ${example}. ` +
            `Also valid: ${WHERE_FIX_EXAMPLES.count}; ${WHERE_FIX_EXAMPLES.extract}.`,
          example
        );
      },
    });
  });

/** Pick a paste-ready example based on what the model was likely trying to do. */
export function suggestWhereExample(expression: string): string {
  const e = expression.toLowerCase();
  if (e.includes("length") || e.includes("count") || e.includes("total")) {
    return WHERE_FIX_EXAMPLES.count;
  }
  if (
    e.includes("[0]") ||
    e.endsWith(".id") ||
    e.includes(".name") ||
    (!e.includes("[?") && e.includes("."))
  ) {
    return WHERE_FIX_EXAMPLES.extract;
  }
  return WHERE_FIX_EXAMPLES.filter;
}

/**
 * Compose execute shaping: **where** (filter/extract) then **fields** projection.
 */
export const shapeExecuteDataEffect = (
  data: unknown,
  options: {
    readonly where?: string;
    readonly fields?: readonly string[];
  }
): Effect.Effect<unknown, WhereFilterError> =>
  Effect.gen(function* () {
    const filtered = yield* applyWhereEffect(data, options.where);
    return projectRestByFields(filtered, options.fields);
  });

export class WhereFilterService extends Context.Service<
  WhereFilterService,
  {
    readonly validateCaps: (where: string) => Effect.Effect<string, WhereFilterError>;
    readonly apply: (
      data: unknown,
      where: string | undefined
    ) => Effect.Effect<unknown, WhereFilterError>;
    readonly shape: (
      data: unknown,
      options: { readonly where?: string; readonly fields?: readonly string[] }
    ) => Effect.Effect<unknown, WhereFilterError>;
  }
>()("clawql/WhereFilterService") {}

export const WhereFilterLive = Layer.succeed(
  WhereFilterService,
  WhereFilterService.of({
    validateCaps: (where) => validateWhereCapsEffect(where),
    apply: (data, where) => applyWhereEffect(data, where),
    shape: (data, options) => shapeExecuteDataEffect(data, options),
  })
);
