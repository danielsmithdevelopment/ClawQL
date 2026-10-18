/**
 * celld pin readiness for `clawql doctor` (Streams / durable programs claim surface).
 *
 * Honesty: Core search/execute does not need celld. This check surfaces whether
 * the install pin + binary match {@link CELLD_PINNED_VERSION} so operators can
 * claim Streams / isolate eligibility without guessing env.
 */

import { Effect } from "effect";
import {
  CELLD_PINNED_VERSION,
  celldKillNodeDemoReportEffect,
  type CelldBinaryProbe,
  type CelldKillNodeDemoReport,
} from "clawql-api";
import type { DoctorCheck } from "./doctor.js";

export type CelldDoctorOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly probe?: CelldBinaryProbe;
};

/** Map pin/kill-node report → doctor checks (testable without spawning celld). */
export function celldDoctorChecksFromReport(
  report: CelldKillNodeDemoReport,
  env: NodeJS.ProcessEnv = process.env
): DoctorCheck[] {
  const { pin } = report;
  const checks: DoctorCheck[] = [];

  if (pin.isolateReady) {
    checks.push({
      level: "ok",
      message: `celld pin: isolateReady (${report.pinnedVersion})`,
      detail: `${report.honesty}. Next: ${report.nextSteps.join("; ")}`,
    });
    return checks;
  }

  // Operator started isolate/pin config but it does not match — warn (same bar as security celld exit).
  if (pin.isolateFlag || pin.versionMatches) {
    const gaps: string[] = [];
    if (!pin.versionMatches) gaps.push(`CELLD_VERSION≠${CELLD_PINNED_VERSION}`);
    if (!pin.isolateFlag) gaps.push("CLAWQL_PROGRAM_CELLD_ISOLATE unset");
    if (!pin.binaryMatches) {
      gaps.push(
        pin.binaryPresent
          ? `binary ${pin.binaryVersion ?? "unknown"}≠${CELLD_PINNED_VERSION}`
          : "celld binary missing"
      );
    }
    checks.push({
      level: "warn",
      message: `celld pin incomplete (${gaps.join(", ")})`,
      detail: `${report.honesty}. ${report.nextSteps.join("; ")}. Detail: clawql security celld --json`,
    });
    return checks;
  }

  // Default: file-journal stand-in — fine for Core; binary-on-PATH alone is not a misconfig.
  const binaryNote = pin.binaryPresent
    ? ` binary ${pin.binaryVersion ?? "unknown"} on PATH`
    : "";
  const coreProxy = env.CLAWQL_CORE_CELLD_URL?.trim();
  checks.push({
    level: "ok",
    message: `celld pin: stand-in (file journal; pin ${CELLD_PINNED_VERSION} optional)`,
    detail: coreProxy
      ? `CLAWQL_CORE_CELLD_URL=${coreProxy} — Node search/execute proxy into CoreToolsDO.${binaryNote}`
      : `Default Core is Node; opt-in Core-in-celld: celld POST /mcp or CLAWQL_CORE_CELLD_URL.${binaryNote}. Streams/isolate pin: CELLD_VERSION + CLAWQL_PROGRAM_CELLD_ISOLATE=1`,
  });
  return checks;
}

export async function runCelldDoctorChecks(
  options: CelldDoctorOptions = {}
): Promise<DoctorCheck[]> {
  const env = options.env ?? process.env;
  const report = await Effect.runPromise(
    options.probe
      ? celldKillNodeDemoReportEffect(env, options.probe)
      : celldKillNodeDemoReportEffect(env)
  );
  return celldDoctorChecksFromReport(report, env);
}
