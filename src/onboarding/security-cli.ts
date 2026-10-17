/**
 * `clawql security …` — red-team drills (docs/security §24).
 */

import { Effect } from "effect";
import {
  celldKillNodeDemoReportEffect,
  parseInjectionMode,
  runInjectionDrillsEffect,
  type InjectionMode,
} from "clawql-api";

export async function runSecurityInject(options: {
  readonly mode?: string;
  readonly target?: string;
  readonly json?: boolean;
}): Promise<number> {
  const mode = parseInjectionMode(options.mode ?? "direct");
  if (!mode) {
    console.error("Usage: clawql security inject --mode direct|indirect|multistep [--target staging] [--json]");
    return 1;
  }
  const report = await Effect.runPromise(
    runInjectionDrillsEffect(mode as InjectionMode, { target: options.target })
  );
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Injection drills · mode=${report.mode} · target=${report.target}`);
    console.log(`  ${report.passed} passed · ${report.failed} failed`);
    for (const c of report.cases) {
      const mark = c.ok ? "ok" : "FAIL";
      console.log(`  [${mark}] ${c.id} · ${c.toolName} · blocked=${c.blocked} — ${c.detail}`);
    }
    console.log(`  Honesty: ${report.honesty}`);
  }
  return report.failed > 0 ? 1 : 0;
}

export async function runSecurityCelld(options: { readonly json?: boolean }): Promise<number> {
  const report = await Effect.runPromise(celldKillNodeDemoReportEffect());
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`celld kill-node readiness · pin=${report.pinnedVersion}`);
    console.log(`  isolateReady=${report.pin.isolateReady} · isolateKillNodeEligible=${report.isolateKillNodeEligible}`);
    console.log(`  standInDemoAvailable=${report.standInDemoAvailable}`);
    console.log(`  Honesty: ${report.honesty}`);
    for (const step of report.nextSteps) {
      console.log(`  Next: ${step}`);
    }
  }
  // Non-zero only when isolate was requested but pin is broken mid-flight — unset pin is OK (stand-in).
  if (report.pin.isolateFlag && !report.pin.isolateReady) {
    return 1;
  }
  return 0;
}
