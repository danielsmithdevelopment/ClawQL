import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  CELLD_PINNED_VERSION,
  celldKillNodeDemoReportEffect,
  type CelldBinaryProbeResult,
} from "clawql-api";
import { celldDoctorChecksFromReport, runCelldDoctorChecks } from "./celld-doctor-check.js";

function probeOf(result: CelldBinaryProbeResult) {
  return () => Effect.succeed(result);
}

describe("celld doctor", () => {
  it("reports stand-in ok when pin env unset", async () => {
    const checks = await runCelldDoctorChecks({
      env: {},
      probe: probeOf({ present: false, version: null, path: null }),
    });
    expect(checks).toHaveLength(1);
    expect(checks[0]!.level).toBe("ok");
    expect(checks[0]!.message).toMatch(/stand-in/i);
  });

  it("warns when isolate flag set but binary missing", async () => {
    const checks = await runCelldDoctorChecks({
      env: {
        CELLD_VERSION: CELLD_PINNED_VERSION,
        CLAWQL_PROGRAM_CELLD_ISOLATE: "1",
      },
      probe: probeOf({ present: false, version: null, path: null }),
    });
    expect(checks.some((c) => c.level === "warn" && /incomplete/i.test(c.message))).toBe(true);
  });

  it("keeps stand-in ok when only binary is on PATH", async () => {
    const checks = await runCelldDoctorChecks({
      env: {},
      probe: probeOf({
        present: true,
        version: CELLD_PINNED_VERSION,
        path: "/tmp/celld",
      }),
    });
    expect(checks).toHaveLength(1);
    expect(checks[0]!.level).toBe("ok");
    expect(checks[0]!.message).toMatch(/stand-in/i);
    expect(checks[0]!.detail).toMatch(/binary/i);
  });

  it("ok when isolateReady", async () => {
    const report = await Effect.runPromise(
      celldKillNodeDemoReportEffect(
        {
          CELLD_VERSION: CELLD_PINNED_VERSION,
          CLAWQL_PROGRAM_CELLD_ISOLATE: "1",
        },
        probeOf({ present: true, version: CELLD_PINNED_VERSION, path: "/tmp/celld" })
      )
    );
    const checks = celldDoctorChecksFromReport(report);
    expect(checks).toHaveLength(1);
    expect(checks[0]!.level).toBe("ok");
    expect(checks[0]!.message).toMatch(/isolateReady/);
  });
});
