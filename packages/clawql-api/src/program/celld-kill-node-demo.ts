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
import {
  defaultKillNodeEvidencePath,
  loadKillNodeStandinEvidence,
  type KillNodeStandinEvidence,
} from "./kill-node-standin-demo.js";

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
  /** Latest stand-in evidence JSON if present (npm run demo:kill-node-standin). */
  readonly standInEvidence: KillNodeStandinEvidence | null;
  readonly standInEvidencePassed: boolean;
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
    const standInEvidence = loadKillNodeStandinEvidence(
      defaultKillNodeEvidencePath(env)
    );
    const standInEvidencePassed = standInEvidence?.ok === true;
    const nextSteps: string[] = [];
    if (!standInEvidencePassed) {
      nextSteps.push("Run npm run demo:kill-node-standin to publish file-journal SIGKILL evidence");
    }
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
        "Pin ready: still need ProgramCellDO + SIGKILL of celld binary before isolate crash-survival claims"
      );
    } else {
      nextSteps.push(
        "Until isolateReady: file-journal stand-in is the earned local crash/resume path — do not claim celld isolate crash survival"
      );
    }

    const honesty = standInEvidencePassed
      ? pin.isolateReady
        ? `Stand-in SIGKILL evidence PASS; pin ready (${CELLD_PINNED_VERSION}) but isolate kill-node still not wired`
        : `Stand-in SIGKILL evidence PASS — ${pin.honesty}`
      : pin.isolateReady
        ? `Pin ready for isolate host (${CELLD_PINNED_VERSION}); run demo:kill-node-standin for stand-in evidence`
        : `File-journal stand-in only — ${pin.honesty}`;

    return {
      pinnedVersion: CELLD_PINNED_VERSION,
      pin,
      standInDemoAvailable,
      isolateKillNodeEligible,
      standInEvidence,
      standInEvidencePassed,
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
