/**
 * celld pin readiness for durable program cells (ADR 0015 / Streams celld baseline).
 *
 * Honesty: program mode today uses a file-journal cell façade. Claiming a V8
 * isolate + SQLite/LTX crash demo requires the pinned celld binary version and
 * an explicit host flag — this module only reports readiness, it does not spawn
 * celld.
 */

import { Context, Effect, Layer } from "effect";

/** Streams / program-mode pin — keep in sync with docs/streams/clawql-celld.md §0. */
export const CELLD_PINNED_VERSION = "v0.4.0" as const;

export type CelldPinStatus = {
  readonly pinnedVersion: typeof CELLD_PINNED_VERSION;
  /** From `CELLD_VERSION` (install pin). */
  readonly reportedVersion: string | null;
  readonly versionMatches: boolean;
  /**
   * Operator opts into isolate-backed program cells (`CLAWQL_PROGRAM_CELLD_ISOLATE=1`).
   * Alone this does not prove a kill-node demo; both version match and this flag
   * are required for {@link celldIsolateReady}.
   */
  readonly isolateFlag: boolean;
  readonly isolateReady: boolean;
  readonly honesty: string;
};

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function normalizeVersion(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  return v.startsWith("v") ? v : `v${v}`;
}

export function celldPinStatusEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<CelldPinStatus> {
  return Effect.sync(() => {
    const reportedVersion = normalizeVersion(env.CELLD_VERSION);
    const versionMatches = reportedVersion === CELLD_PINNED_VERSION;
    const isolateFlag = envFlag("CLAWQL_PROGRAM_CELLD_ISOLATE", env);
    const isolateReady = versionMatches && isolateFlag;
    const honesty = isolateReady
      ? `celld ${CELLD_PINNED_VERSION} pin reported; isolate flag on — still require kill-node demo before crash claims`
      : `file-journal program cell stand-in; pin ${CELLD_PINNED_VERSION} (reported=${reportedVersion ?? "unset"}); set CELLD_VERSION=${CELLD_PINNED_VERSION} and CLAWQL_PROGRAM_CELLD_ISOLATE=1 when the isolate host is wired`;
    return {
      pinnedVersion: CELLD_PINNED_VERSION,
      reportedVersion,
      versionMatches,
      isolateFlag,
      isolateReady,
      honesty,
    };
  });
}

export class CelldPinService extends Context.Service<
  CelldPinService,
  {
    readonly status: () => Effect.Effect<CelldPinStatus>;
  }
>()("clawql/CelldPinService") {}

export function celldPinLayer(env: NodeJS.ProcessEnv = process.env): Layer.Layer<CelldPinService> {
  return Layer.succeed(
    CelldPinService,
    CelldPinService.of({
      status: () => celldPinStatusEffect(env),
    })
  );
}
