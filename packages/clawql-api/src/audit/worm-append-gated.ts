/**
 * Gate process WORM appends: best-effort by default; fail closed when
 * CLAWQL_TIER=regulated or CLAWQL_WORM_REQUIRED=1 (audit 3.02).
 */

import {
  appendProcessWormEffect,
  type AuditError,
  type WORMAppendInput,
  type WORMEntry,
} from "clawql-audit";
import { Effect } from "effect";

export function wormAppendRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CLAWQL_TIER?.trim().toLowerCase() === "regulated") return true;
  const raw = env.CLAWQL_WORM_REQUIRED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Append to the process trail. When required, failures propagate as `Error`;
 * otherwise they are swallowed so domain callers stay best-effort.
 */
export function appendProcessWormGatedEffect(
  input: WORMAppendInput,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<WORMEntry | null, Error> {
  const write = appendProcessWormEffect(input).pipe(
    Effect.mapError(
      (err: AuditError) => new Error(err.reason || "process WORM append failed")
    )
  );
  if (wormAppendRequired(env)) return write;
  return write.pipe(Effect.catch(() => Effect.succeed(null)));
}
