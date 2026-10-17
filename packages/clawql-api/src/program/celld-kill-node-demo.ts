/**
 * celld kill-node / crash-resume demo report (ADR 0015 earned-claim gate).
 *
 * Honesty:
 * - The file-journal SIGKILL path proves the *stand-in* resume contract
 *   (same as durable-runner tests). That is not yet a pinned celld V8 isolate
 *   kill-node demo — {@link CelldPinStatus.isolateReady} must be true and the
 *   isolate host must run the kill before crash claims ship.
 */

import { Context, Effect, Layer } from "effect";
import {
  CELLD_PINNED_VERSION,
  celldPinStatusEffect,
  type CelldBinaryProbe,
  type CelldPinStatus,
  defaultCelldBinaryProbe,
} from "./celld-pin.js";

export type CelldKillNodeDemoReport = {
  readonly pinnedVersion: typeof CELLD_PINNED_VERSION;
  readonly pin: CelldPinStatus;
  /**
   * True when the file-journal stand-in crash/resume contract is the path under
   * test (always the case until isolate host is wired).
   */
  readonly standInDemoAvailable: boolean;
  /**
   * True only when pin.isolateReady — operators may then run the real celld
   * kill-node load-test. This module does not spawn celld.
   */
  readonly isolateKillNodeEligible: boolean;
  readonly honesty: string;
  readonly nextSteps: readonly string[];
};

export function celldKillNodeDemoReportEffect(
  env: NodeJS.ProcessEnv = process.env,
  probe: CelldBinaryProbe = defaultCelldBinaryProbe(env)
): Effect.Effect<CelldKillNodeDemoReport> {
  return Effect.gen(function* () {
    const pin = yield* celldPinStatusEffect(env, probe);
    const standInDemoAvailable = true;
    const isolateKillNodeEligible = pin.isolateReady;
    const nextSteps: string[] = [];
    if (!pin.versionMatches) {
      nextSteps.push(`Set CELLD_VERSION=${CELLD_PINNED_VERSION}`);
    }
    if (!pin.isolateFlag) {
      nextSteps.push("Set CLAWQL_PROGRAM_CELLD_ISOLATE=1 when isolate host is wired");
    }
    if (!pin.binaryMatches) {
      nextSteps.push(
        `Install celld ${CELLD_PINNED_VERSION} on PATH (or CLAWQL_CELLD_BIN) — see docs/streams/clawql-celld.md`
      );
    }
    if (pin.isolateReady) {
      nextSteps.push(
        "Run three-arm load-test kill-node against the pinned isolate; publish resume+audit evidence before crash claims"
      );
    } else {
      nextSteps.push(
        "Until isolateReady: rely on file-journal SIGKILL tests (durable-runner) — do not claim celld crash survival"
      );
    }

    const honesty = pin.isolateReady
      ? `Pin ready for isolate host (${CELLD_PINNED_VERSION}); file-journal stand-in still the default until kill-node demo ships`
      : `File-journal stand-in only — ${pin.honesty}`;

    return {
      pinnedVersion: CELLD_PINNED_VERSION,
      pin,
      standInDemoAvailable,
      isolateKillNodeEligible,
      honesty,
      nextSteps,
    };
  });
}

export class CelldKillNodeDemoService extends Context.Service<
  CelldKillNodeDemoService,
  {
    readonly report: () => Effect.Effect<CelldKillNodeDemoReport>;
  }
>()("clawql/CelldKillNodeDemoService") {}

export function celldKillNodeDemoLayer(
  env: NodeJS.ProcessEnv = process.env,
  probe: CelldBinaryProbe = defaultCelldBinaryProbe(env)
): Layer.Layer<CelldKillNodeDemoService> {
  return Layer.succeed(
    CelldKillNodeDemoService,
    CelldKillNodeDemoService.of({
      report: () => celldKillNodeDemoReportEffect(env, probe),
    })
  );
}
