/**
 * celld pin readiness for `clawql doctor` (Streams / durable programs claim surface).
 *
 * Honesty: Core **prefers celld** (CoreToolsDO / default localhost proxy).
 * Node Core is the escape hatch when celld is unreachable or
 * `CLAWQL_CORE_IN_CELLD=0` / `CLAWQL_FORCE_NODE_CORE=1`.
 */

import { Effect } from "effect";
import {
  CELLD_PINNED_VERSION,
  DEFAULT_CORE_CELLD_MCP_URL,
  celldKillNodeDemoReportEffect,
  preferCoreInCelld,
  resolveCoreCelldProxyConfig,
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
  const prefer = preferCoreInCelld(env);
  const proxyCfg = resolveCoreCelldProxyConfig(env);

  if (pin.isolateReady) {
    checks.push({
      level: "ok",
      message: `celld pin: isolateReady (${report.pinnedVersion})`,
      detail: `${report.honesty}. Core prefers celld${
        proxyCfg ? ` → ${proxyCfg.url}` : ""
      }. Next: ${report.nextSteps.join("; ")}`,
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

  const binaryNote = pin.binaryPresent
    ? ` binary ${pin.binaryVersion ?? "unknown"} on PATH`
    : "";

  if (!prefer) {
    checks.push({
      level: "ok",
      message: `celld pin: stand-in (Node Core escape hatch active)`,
      detail: `CLAWQL_CORE_IN_CELLD=0 or CLAWQL_FORCE_NODE_CORE=1 — search/execute stay on Node.${binaryNote}. Re-enable celld default by unsetting those flags; local MCP ${DEFAULT_CORE_CELLD_MCP_URL}`,
    });
    return checks;
  }

  checks.push({
    level: "ok",
    message: `celld pin: stand-in (file journal; pin ${CELLD_PINNED_VERSION} optional)`,
    detail: `Core prefers celld (default ${DEFAULT_CORE_CELLD_MCP_URL}${
      proxyCfg?.usingDefaultUrl === false ? `; override ${proxyCfg.url}` : ""
    }). Node search/execute only if celld unreachable or escape hatch set.${binaryNote}. Streams isolate pin: CELLD_VERSION + CLAWQL_PROGRAM_CELLD_ISOLATE=1`,
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
