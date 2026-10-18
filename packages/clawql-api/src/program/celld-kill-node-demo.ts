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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultKillNodeEvidencePath,
  loadKillNodeStandinEvidence,
  type KillNodeStandinEvidence,
} from "./kill-node-standin-demo.js";

export type IsolateKillNodeEvidence = {
  readonly kind: "celld-isolate-sigkill";
  readonly ok: boolean;
  readonly arms?: readonly { readonly arm: string; readonly ok: boolean }[];
  readonly honesty?: string;
};

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
  /** Lab ProgramCellDO isolate evidence if present (smoke-program-cell-kill). */
  readonly isolateEvidence: IsolateKillNodeEvidence | null;
  readonly isolateEvidencePassed: boolean;
  readonly honesty: string;
  readonly nextSteps: readonly string[];
};

function defaultIsolateEvidencePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CLAWQL_ISOLATE_KILL_EVIDENCE_PATH?.trim()) {
    return env.CLAWQL_ISOLATE_KILL_EVIDENCE_PATH.trim();
  }
  return join(process.cwd(), "docs/benchmarks/program-cell-isolate-kill/evidence.json");
}

function loadIsolateKillEvidence(
  path: string = defaultIsolateEvidencePath()
): IsolateKillNodeEvidence | null {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as IsolateKillNodeEvidence;
    if (raw?.kind !== "celld-isolate-sigkill") return null;
    return raw;
  } catch {
    return null;
  }
}

export function celldKillNodeDemoReportEffect(
  env: NodeJS.ProcessEnv = process.env,
  probe: CelldBinaryProbe = defaultCelldBinaryProbe(env)
): Effect.Effect<CelldKillNodeDemoReport> {
  return Effect.gen(function* () {
    const pin = yield* celldPinStatusEffect(env, probe);
    const standInDemoAvailable = true;
    const isolateKillNodeEligible = pin.isolateReady;
    const standInEvidence = loadKillNodeStandinEvidence(defaultKillNodeEvidencePath(env));
    const standInEvidencePassed = standInEvidence?.ok === true;
    const isolateEvidence = loadIsolateKillEvidence(defaultIsolateEvidencePath(env));
    const isolateEvidencePassed = isolateEvidence?.ok === true;
    const nextSteps: string[] = [];
    if (!standInEvidencePassed) {
      nextSteps.push("Run npm run demo:kill-node-standin to publish file-journal SIGKILL evidence");
    }
    if (!isolateEvidencePassed) {
      nextSteps.push(
        "Run STREAMS_CELLD_SMOKE_REQUIRED=1 bash docs/examples/streams-celld/scripts/smoke-program-cell-kill.sh"
      );
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
        "Pin ready: Lab ProgramCellDO kill smoke exists; fleet LTX / three-arm product gate still open"
      );
    } else {
      nextSteps.push(
        "Until isolateReady pin: file-journal stand-in + Lab ProgramCellDO smoke are the earned local crash/resume paths"
      );
    }

    const honesty =
      standInEvidencePassed && isolateEvidencePassed
        ? `Stand-in + Lab ProgramCellDO isolate evidence PASS — ${pin.honesty}`
        : standInEvidencePassed
          ? `Stand-in SIGKILL evidence PASS; isolate Lab smoke ${isolateEvidencePassed ? "PASS" : "pending"} — ${pin.honesty}`
          : isolateEvidencePassed
            ? `Lab ProgramCellDO isolate evidence PASS; stand-in pending — ${pin.honesty}`
            : `File-journal stand-in + Lab ProgramCellDO path — ${pin.honesty}`;

    return {
      pinnedVersion: CELLD_PINNED_VERSION,
      pin,
      standInDemoAvailable,
      isolateKillNodeEligible,
      standInEvidence,
      standInEvidencePassed,
      isolateEvidence,
      isolateEvidencePassed,
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
