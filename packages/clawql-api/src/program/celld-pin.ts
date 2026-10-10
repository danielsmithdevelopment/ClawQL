/**
 * celld pin readiness for durable program cells (ADR 0015 / Streams celld baseline).
 *
 * Honesty: program mode today uses a file-journal cell façade. Claiming a V8
 * isolate + SQLite/LTX crash demo requires the pinned celld binary on PATH
 * (matching {@link CELLD_PINNED_VERSION}), install pin env, and an explicit host
 * flag — this module only reports readiness, it does not spawn celld.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Context, Effect, Layer } from "effect";

const execFileAsync = promisify(execFile);

/** Streams / program-mode pin — keep in sync with docs/streams/clawql-celld.md §0. */
export const CELLD_PINNED_VERSION = "v0.4.0" as const;

export type CelldBinaryProbeResult = {
  readonly present: boolean;
  readonly version: string | null;
  readonly path: string | null;
};

/** Injectable binary probe — tests supply fixtures; production execs `celld --version`. */
export type CelldBinaryProbe = () => Effect.Effect<CelldBinaryProbeResult>;

export type CelldPinStatus = {
  readonly pinnedVersion: typeof CELLD_PINNED_VERSION;
  /** From `CELLD_VERSION` (install pin). */
  readonly reportedVersion: string | null;
  readonly versionMatches: boolean;
  /**
   * Operator opts into isolate-backed program cells (`CLAWQL_PROGRAM_CELLD_ISOLATE=1`).
   * Alone this does not prove a kill-node demo.
   */
  readonly isolateFlag: boolean;
  /** Binary found on PATH (or probe fixture). */
  readonly binaryPresent: boolean;
  /** Parsed version from `celld --version` / probe (normalized with leading `v`). */
  readonly binaryVersion: string | null;
  readonly binaryMatches: boolean;
  /**
   * True only when install pin, isolate flag, and binary probe all agree on
   * {@link CELLD_PINNED_VERSION}. Still does not prove kill-node crash resume.
   */
  readonly isolateReady: boolean;
  readonly honesty: string;
};

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function normalizeVersion(raw: string | undefined | null): string | null {
  const v = raw?.trim();
  if (!v) return null;
  // First semver-ish token (handles "celld 0.4.0" / "v0.4.0\n…")
  const m = v.match(/v?\d+\.\d+\.\d+/);
  if (!m) return null;
  return m[0]!.startsWith("v") ? m[0]! : `v${m[0]!}`;
}

/**
 * Probe the celld binary.
 *
 * Precedence:
 * 1. `CLAWQL_CELLD_PROBE_VERSION` — air-gap / unit-test fixture (no spawn)
 * 2. `execFile(CELLD_BIN || "celld", ["--version"])`
 */
export function defaultCelldBinaryProbe(env: NodeJS.ProcessEnv = process.env): CelldBinaryProbe {
  return () =>
    Effect.gen(function* () {
      const fixture = env.CLAWQL_CELLD_PROBE_VERSION?.trim();
      if (fixture) {
        const version = normalizeVersion(fixture);
        return {
          present: version != null,
          version,
          path: env.CLAWQL_CELLD_BIN?.trim() || "celld",
        };
      }

      const bin = env.CLAWQL_CELLD_BIN?.trim() || "celld";
      return yield* Effect.tryPromise({
        try: async (): Promise<CelldBinaryProbeResult> => {
          try {
            const { stdout, stderr } = await execFileAsync(bin, ["--version"], {
              timeout: 4_000,
              maxBuffer: 64 * 1024,
              env: process.env,
            });
            const version = normalizeVersion(`${stdout}\n${stderr}`);
            return { present: true, version, path: bin };
          } catch {
            return { present: false, version: null, path: null };
          }
        },
        catch: (): CelldBinaryProbeResult => ({
          present: false,
          version: null,
          path: null,
        }),
      });
    });
}

export function celldPinStatusEffect(
  env: NodeJS.ProcessEnv = process.env,
  probe: CelldBinaryProbe = defaultCelldBinaryProbe(env)
): Effect.Effect<CelldPinStatus> {
  return Effect.gen(function* () {
    const reportedVersion = normalizeVersion(env.CELLD_VERSION);
    const versionMatches = reportedVersion === CELLD_PINNED_VERSION;
    const isolateFlag = envFlag("CLAWQL_PROGRAM_CELLD_ISOLATE", env);
    const binary = yield* probe();
    const binaryPresent = binary.present;
    const binaryVersion = binary.version;
    const binaryMatches = binaryPresent && binaryVersion === CELLD_PINNED_VERSION;
    const isolateReady = versionMatches && isolateFlag && binaryMatches;
    const honesty = isolateReady
      ? `celld ${CELLD_PINNED_VERSION} binary on PATH (${binary.path ?? "celld"}); isolate flag on — still require kill-node demo before crash claims`
      : [
          "file-journal program cell stand-in",
          `pin ${CELLD_PINNED_VERSION}`,
          `env=${reportedVersion ?? "unset"}`,
          `binary=${binaryPresent ? (binaryVersion ?? "unknown") : "missing"}`,
          `isolateFlag=${isolateFlag ? "on" : "off"}`,
          `set CELLD_VERSION=${CELLD_PINNED_VERSION}, CLAWQL_PROGRAM_CELLD_ISOLATE=1, and install celld ${CELLD_PINNED_VERSION} on PATH when the isolate host is wired`,
        ].join("; ");
    return {
      pinnedVersion: CELLD_PINNED_VERSION,
      reportedVersion,
      versionMatches,
      isolateFlag,
      binaryPresent,
      binaryVersion,
      binaryMatches,
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

export function celldPinLayer(
  env: NodeJS.ProcessEnv = process.env,
  probe: CelldBinaryProbe = defaultCelldBinaryProbe(env)
): Layer.Layer<CelldPinService> {
  return Layer.succeed(
    CelldPinService,
    CelldPinService.of({
      status: () => celldPinStatusEffect(env, probe),
    })
  );
}
