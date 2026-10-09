/**
 * Resource caps for read-only program mode (ADR 0015 v0 plan runner).
 */

import { Effect } from "effect";

/** Max UTF-16 length of `source` (JSON plan text). */
export const PROGRAM_MAX_SOURCE_LENGTH = 32_768;

/** Max host tool calls (search + execute) per program. */
export const PROGRAM_MAX_TOOL_CALLS = 16;

/** Default wall-clock timeout when `timeoutMs` omitted. */
export const PROGRAM_DEFAULT_TIMEOUT_MS = 30_000;

/** Hard ceiling for `timeoutMs`. */
export const PROGRAM_MAX_TIMEOUT_MS = 120_000;

/** Max JSON-serialized result bytes returned to the client. */
export const PROGRAM_MAX_OUTPUT_BYTES = 256 * 1024;

export type ProgramCaps = {
  readonly maxSourceLength: number;
  readonly maxToolCalls: number;
  readonly defaultTimeoutMs: number;
  readonly maxTimeoutMs: number;
  readonly maxOutputBytes: number;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

/** Caps resolved from env (Effect for domain boundary). */
export function resolveProgramCapsEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ProgramCaps> {
  return Effect.sync(() => ({
    maxSourceLength: parsePositiveInt(
      env.CLAWQL_PROGRAM_MAX_SOURCE_LENGTH,
      PROGRAM_MAX_SOURCE_LENGTH
    ),
    maxToolCalls: parsePositiveInt(env.CLAWQL_PROGRAM_MAX_TOOL_CALLS, PROGRAM_MAX_TOOL_CALLS),
    defaultTimeoutMs: parsePositiveInt(
      env.CLAWQL_PROGRAM_DEFAULT_TIMEOUT_MS,
      PROGRAM_DEFAULT_TIMEOUT_MS
    ),
    maxTimeoutMs: parsePositiveInt(env.CLAWQL_PROGRAM_MAX_TIMEOUT_MS, PROGRAM_MAX_TIMEOUT_MS),
    maxOutputBytes: parsePositiveInt(env.CLAWQL_PROGRAM_MAX_OUTPUT_BYTES, PROGRAM_MAX_OUTPUT_BYTES),
  }));
}

/** Requested wall-clock budget clamped to `[1, maxTimeoutMs]`; default when omitted. */
export function resolveProgramTimeoutMsEffect(
  requested: number | undefined,
  caps: ProgramCaps
): Effect.Effect<number> {
  return Effect.sync(() =>
    typeof requested === "number" && Number.isFinite(requested)
      ? Math.max(1, Math.min(Math.trunc(requested), caps.maxTimeoutMs))
      : caps.defaultTimeoutMs
  );
}
