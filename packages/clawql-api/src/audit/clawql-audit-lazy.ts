/**
 * Lazy `clawql-audit` loader for Ready RSS.
 *
 * Static `import "clawql-audit"` from execute-live / panguard / risk / pending
 * pulls cbor/qrcode/raptorq/S3 into every listen graph. Process WORM is env-gated
 * (default on; `CLAWQL_WORM_ENABLED=0` disables). Skip the dynamic import when
 * disabled so equal-arm tool-call Ready never evaluates the package.
 */

import { Effect } from "effect";

export type ClawqlAuditModule = typeof import("clawql-audit");
export type ProcessWormInput = Parameters<ClawqlAuditModule["appendProcessWormEffect"]>[0];

/** Cheap sync mirror of clawql-audit `wormEnabledFromEnv` (default on; `0`/`false`/`off`/`no` disable). */
export function processWormEnvLikelyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_WORM_ENABLED?.trim().toLowerCase();
  if (!raw) return true;
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

/** Dynamic-import clawql-audit (once per process; ESM caches the module). */
export const loadClawqlAuditEffect = (): Effect.Effect<ClawqlAuditModule, Error> =>
  Effect.tryPromise({
    try: () => import("clawql-audit"),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

/** Append a WORM event after dynamically loading clawql-audit (no-op when disabled). */
export const appendProcessWormLazyEffect = (
  input: ProcessWormInput
): Effect.Effect<unknown, Error> =>
  Effect.gen(function* () {
    if (!processWormEnvLikelyEnabled()) return null;
    const audit = yield* loadClawqlAuditEffect();
    return yield* audit.appendProcessWormEffect(input);
  });
