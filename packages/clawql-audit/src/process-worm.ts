/**
 * Process-scoped durable WORM trail. Env-gated (`CLAWQL_WORM_ENABLED=1`).
 * Appends are best-effort — never fail domain callers.
 */

import { Effect } from "effect";
import type { WORMAppendInput, WORMEntry } from "./entry.js";
import { createMemoryBackend } from "./storage/memory.js";
import { makeWORMAuditTrailLayer, WORMAuditTrail } from "./trail.js";

let booted = false;
let disabled = false;
let appendEffect: ((input: WORMAppendInput) => Effect.Effect<WORMEntry, unknown>) | null = null;

export function resetProcessWormForTests(): void {
  booted = false;
  disabled = false;
  appendEffect = null;
}

function wormEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.CLAWQL_WORM_ENABLED?.trim() === "1";
}

/** Boot in-memory dual-ack trail when enabled (idempotent). */
export function bootProcessWormFromEnvEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.sync(() => {
    if (booted) return appendEffect !== null;
    if (disabled || !wormEnabled(env)) {
      disabled = true;
      return false;
    }
    const layer = makeWORMAuditTrailLayer({
      local: createMemoryBackend(),
      remote: createMemoryBackend(),
    });
    const runAppend = (input: WORMAppendInput) =>
      Effect.gen(function* () {
        const trail = yield* WORMAuditTrail;
        return yield* trail.append(input);
      }).pipe(Effect.provide(layer));
    appendEffect = runAppend;
    booted = true;
    return true;
  });
}

/** Best-effort append; returns null when trail disabled or append fails. */
export function appendProcessWormEffect(input: WORMAppendInput): Effect.Effect<WORMEntry | null> {
  return Effect.gen(function* () {
    if (!booted && !disabled) {
      yield* bootProcessWormFromEnvEffect();
    }
    if (!appendEffect) return null;
    return yield* appendEffect(input).pipe(Effect.catchAll(() => Effect.succeed(null)));
  });
}

/** Promise edge for host sinks. */
export async function appendProcessWorm(input: WORMAppendInput): Promise<WORMEntry | null> {
  return Effect.runPromise(appendProcessWormEffect(input));
}
