import { gatewayRedactionEnabled, maybeGatewayRedactText } from "clawql-api";
import { Effect, Exit } from "effect";
import type { PiiScrubMode } from "./types.js";

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function scrubJsonValueEffect(value: unknown): Effect.Effect<unknown, Error> {
  if (typeof value === "string") {
    return Effect.tryPromise({ try: () => maybeGatewayRedactText(value), catch: asError });
  }
  if (Array.isArray(value)) {
    return Effect.gen(function* () {
      const out: unknown[] = [];
      for (const v of value) {
        out.push(yield* scrubJsonValueEffect(v));
      }
      return out;
    });
  }
  if (value && typeof value === "object") {
    return Effect.gen(function* () {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = yield* scrubJsonValueEffect(v);
      }
      return out;
    });
  }
  return Effect.succeed(value);
}

export function scrubExportLineEffect(
  line: string,
  mode: PiiScrubMode
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    if (mode === "off") return line;
    if (!gatewayRedactionEnabled()) return line;
    const parseExit = yield* Effect.exit(
      Effect.try({
        try: () => JSON.parse(line) as unknown,
        catch: asError,
      })
    );
    if (Exit.isFailure(parseExit)) {
      return yield* Effect.tryPromise({
        try: () => maybeGatewayRedactText(line),
        catch: asError,
      });
    }
    const scrubbed = yield* scrubJsonValueEffect(parseExit.value);
    return JSON.stringify(scrubbed);
  });
}

/** Promise façade. */
export async function scrubExportLine(line: string, mode: PiiScrubMode): Promise<string> {
  return Effect.runPromise(scrubExportLineEffect(line, mode));
}

export function resolvePiiScrubMode(noPiiScrub?: boolean): PiiScrubMode {
  return noPiiScrub ? "off" : "presidio";
}
